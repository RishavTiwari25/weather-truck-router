# ClearHaul - Weather-Aware Truck Routing

A React + Django web app that helps a truck driver choose the **safest route**
based on forecast weather, load weight and travel time.

- Enter origin, destination, departure time and load weight.
- Get **three route options**, each sampled every **10 / 25 / 50 miles** at the
  truck's **estimated arrival time** at that checkpoint.
- Every checkpoint is classified **Low / Moderate / High / Severe / No Travel**
  using the wind / rain / snow thresholds and the load rules.
- Routes are ranked by **fewest Severe miles, fewest High miles, lowest average
  risk, shortest time**, with a plain-English explanation of the decision.
- Map shows all routes, risk-coloured checkpoints, ETAs, route summaries, a
  **0-48 h corridor weather heatmap** with a time slider, playback, and a truck
  marker that moves along the chosen route as you scrub time.

| Area | Stack |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, MapLibre GL, Zustand, Framer Motion |
| Backend | Django 5/6, Django REST Framework, requests, gunicorn, WhiteNoise |
| Routing | OpenRouteService `driving-hgv` (truck profile) when `ORS_API_KEY` is set, otherwise public OSRM |
| Weather | Open-Meteo hourly forecast (no key); MET Norway as automatic fallback |
| Geocoding | OpenRouteService -> Photon -> Nominatim provider chain; raw `lat, lon` accepted |

---

## Quick start (local)

Prerequisites: Python 3.12+, Node 22+.

```bash
# 1. Backend (http://localhost:8000)
cd backend
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # optional: add ORS_API_KEY for the truck profile
python manage.py runserver

# 2. Frontend (http://localhost:5173, proxies /api to Django)
cd ../frontend
npm install
npm run dev
```

Run the backend test-suite (risk rules, sampling, ranking, grid, geometry):

```bash
cd backend && python manage.py test routing
```

---

## How it works

```
 origin/destination/departure/load
            |
            v
   +------------------+     +-------------------------+
   | Geocoding chain  | --> | Routing provider         |  3 alternatives
   | ORS/Nominatim/   |     | ORS driving-hgv or OSRM  |  (+ via-point synthesis
   | Photon           |     | per-vertex dist & time   |   if provider returns <3)
   +------------------+     +-------------------------+
                                        |
                                        v
                      +-----------------------------------+
                      | Sampler: checkpoint every N miles |
                      | ETA_i = departure + t(dist_i)     |
                      +-----------------------------------+
                                        |
                                        v  one batched Open-Meteo call (cached)
                      +-----------------------------------+
                      | Weather at ETA_i (hourly, linear  |
                      | interpolation between hours)      |
                      +-----------------------------------+
                                        |
                                        v
                      +-----------------------------------+
                      | Risk engine: thresholds + load    |
                      | rules -> level per checkpoint     |
                      +-----------------------------------+
                                        |
                                        v
                      +-----------------------------------+
                      | Miles per level, avg risk, rank   |
                      | & explanation                     |
                      +-----------------------------------+
```

### Checkpoints and ETAs

Each provider response is normalised into a polyline with **cumulative distance
and cumulative time per vertex** (OSRM annotations; ORS step durations
distributed over their vertices). A checkpoint at mile *m* is located by binary
search along the polyline and its ETA is `departure + time(m)`, so a slow
mountain segment and a fast interstate segment are timed correctly rather than
assuming a constant average speed.

Checkpoints are placed at 0, N, 2N ... miles plus the destination. A trailing
stub shorter than 40 % of the interval is merged into the final checkpoint.

OSRM's public server only has a car profile, so its durations are multiplied by
`OSRM_TRUCK_DURATION_FACTOR` (default 1.15) to approximate heavy-vehicle speeds.
With an `ORS_API_KEY` the real `driving-hgv` truck profile is used instead.

### Weather sampling

Open-Meteo returns hourly `wind_speed_10m` (mph), `rain` + `showers` (in/hr),
`snowfall` (in/hr) for up to 100 coordinates per request. Every checkpoint of
every route goes into one batched, parallel fetch; responses are cached for 15
minutes per 0.01 deg cell. Conditions at the exact ETA are **linearly
interpolated** between the two surrounding forecast hours.

### Risk rules

| Condition | Low | Moderate | High | Severe | No Travel |
| --- | --- | --- | --- | --- | --- |
| Wind (mph) | < 25 | 25-34 | 35-44 | 45-54 | >= 55 |
| Rain (in/hr) | < 0.10 | 0.10-0.25 | 0.25-0.50 | 0.50-1.00 | > 1.00 |
| Snow (in/hr) | < 0.5 | 0.5-1.0 | 1.0-2.0 | 2.0-3.0 | > 3.0 |

Load rules (applied after the table):

- wind >= 55 mph -> **No Travel** for any load
- wind 45-54 mph and load > 30,000 lb -> **No Travel**
- wind 35-44 mph and load > 40,000 lb -> **Severe**

A checkpoint's level is the worst of its three variables, then the load rules
can only raise it. Boundary values sit in the higher band (25 mph is Moderate)
except the top rain/snow bound, which the table writes as "> 1.00" / "> 3.0"
(exactly 1.00 in/hr is still Severe). All of this is unit-tested in
`backend/routing/tests/test_risk.py`.

### Route summaries and recommendation

The miles between two consecutive checkpoints take the **worse** of the two
endpoint levels (conservative). Per route we report miles per level, average
risk (mile-weighted, 0-4), worst segment and the ETA.

Ranking is lexicographic, exactly as specified, with No-Travel miles compared
first because a route through a No-Travel zone can never be safer than one
that avoids it:

1. fewest No-Travel miles
2. fewest Severe miles
3. fewest High miles
4. lowest average risk
5. shortest travel time

The response includes human-readable reasons ("Route C avoids Severe weather
entirely; it costs 2h 56m more than the fastest route") and a per-route
comparison so the UI can explain *why*.

### Three distinct routes, always

ORS returns up to three alternatives natively; OSRM often returns only one or
two. When fewer than three distinct routes come back, the backend routes
through **lateral via-points** (offset perpendicular to the straight line at
12 % and 22 % of its length, both sides, in parallel), discards candidates that
share >= 80 % of their vertices with an existing route or are more than 1.5x
the fastest duration, and labels survivors "Alt corridor" in the UI.

### Corridor heatmap

`POST /api/heatmap` builds a lat/lon grid over the padded bounding box of all
routes (cell size adapts so ~300 cells cover the box), keeps only cells within
~80 km of any route, fetches 49 hourly steps (now .. +48 h) for each cell
centre and returns compact arrays of wind, rain, snow and a continuous 0-4.5
risk score. The frontend converts the chosen variable to that same score
scale, **bilinearly interpolates** it in Web-Mercator pixel space onto a small
canvas and drapes it over the map as a MapLibre canvas source. Scrubbing the
slider re-renders ~30k pixels per frame and blends between hours, so playback
is smooth; the GPU handles resampling when zooming.

---

## API

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | - | provider configuration |
| GET | `/api/rules` | - | thresholds, load rules, ranking order |
| GET | `/api/geocode?q=` | free text or `lat, lon` | resolved place |
| POST | `/api/plan` | `{origin, destination, departure (ISO-8601 with offset), load_lb, interval_mi: 10\|25\|50}` | routes, checkpoints, summaries, recommendation, bbox, corridor |
| POST | `/api/heatmap` | `{bbox: [w,s,e,n], corridor: [[lon,lat],...]}` | grid + 49 hourly frames |

Errors use one envelope: `{"error": {"code", "message", "details?"}}`
(422 for geocoding/routing failures, 502 for upstream provider failures, 400
for validation).

Example:

```bash
curl -X POST http://localhost:8000/api/plan -H "Content-Type: application/json" -d '{
  "origin": "New Delhi, India", "destination": "Mumbai, India",
  "departure": "2026-10-16T06:00:00+05:30", "load_lb": 42000, "interval_mi": 25 }'
```

---

## Deployment

### Option A - single service (simplest): Render / Fly / Railway / any Docker host

The `Dockerfile` builds the React app and serves it from Django via WhiteNoise.
`render.yaml` is a one-click blueprint for Render: it generates
`DJANGO_SECRET_KEY`, sets debug off, and asks for an optional `ORS_API_KEY`.
Health check: `/api/health`. The free tier sleeps after 15 min idle; the first
request after that takes ~30 s.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/RishavTiwari25/weather-truck-router)

```bash
docker compose up --build   # http://localhost:8000
```

### Option B - split hosting: Vercel (frontend) + any Python host (API)

1. Deploy `backend/` (Procfile included). Set `CORS_ALLOWED_ORIGINS` to your
   Vercel URL and `CORS_ALLOW_ALL_ORIGINS=false`.
2. Deploy `frontend/` to Vercel with `VITE_API_BASE_URL=https://your-api`.

### Environment variables (backend)

| Variable | Default | Purpose |
| --- | --- | --- |
| `ORS_API_KEY` | empty | enables OpenRouteService truck routing + geocoding |
| `WEATHER_PROVIDER` | auto | `auto` uses Open-Meteo and switches to MET Norway while Open-Meteo reports its per-IP quota is exhausted; or pin `open-meteo` / `metno` |
| `WEATHER_FALLBACK_SECONDS` | 1800 | how long to stay on MET Norway before retrying Open-Meteo |
| `OSRM_TRUCK_DURATION_FACTOR` | 1.15 | scales OSRM car durations to truck speeds |
| `WEATHER_CACHE_SECONDS` | 900 | per-point forecast cache |
| `API_THROTTLE_RATE` | 60/min | anonymous rate limit |
| `CORS_ALLOW_ALL_ORIGINS` / `CORS_ALLOWED_ORIGINS` | true / - | CORS for split hosting |

---

## Project layout

```
backend/
  config/                 Django settings, URLs, WSGI
  routing/
    views.py, urls.py     thin DRF views
    serializers.py        request validation
    exceptions.py         uniform error envelope
    services/
      geo.py              haversine, interpolation, Douglas-Peucker
      geocoding.py        provider chain + cache
      routing.py          ORS / OSRM providers, via-point alternatives
      sampling.py         checkpoints, ETAs, miles-per-level summary
      weather.py          provider front door: Open-Meteo batched client + MET Norway fallback
      metno.py            MET Norway Locationforecast client, normalised to the same series
      series.py           HourlySeries + interpolation at a timestamp
      risk.py             threshold table + load rules
      recommend.py        lexicographic ranking + explanations
      heatmap.py          corridor grid + 48 h frames
      planner.py          orchestration
    tests/                26 unit tests, no network needed
frontend/src/
  api/                    types + fetch client
  lib/                    risk colours/scores, geometry, heatmap renderer, formatting
  components/             TripForm, RecommendationCard, RouteCard, RiskRibbon,
                          MapView, TimeDock, CheckpointPopup, Header
  store.ts                Zustand state + async actions
```

## Design decisions and trade-offs

- **Sustained wind, not gusts, drives the classification** (the table says
  "Wind"); gusts are shown in the checkpoint popup for context.
- **Segment risk = worse endpoint.** Simple to explain, errs on the side of
  safety, and makes "Severe miles" a meaningful number.
- **Weather at the ETA is interpolated** rather than snapped to the nearest
  hour, so a checkpoint at 3:40 PM uses 3 PM / 4 PM weighted 1:2.
- **Heatmap is weather-only** (no load rules) because it describes the
  corridor, not a specific truck; the checkpoints carry the load-aware result.
- **Stateless API, short-lived in-memory caches.** No database tables are
  needed; every request is reproducible from its inputs.
- **Free, key-less providers by default** so the app runs anywhere; an ORS key
  upgrades routing to a true truck profile without code changes.

## Known limitations

- Forecast horizon is limited to 14 days by Open-Meteo; departures beyond that
  are rejected with a clear message.
- The public OSRM demo server is rate-limited and has no truck profile; use an
  ORS key (free tier: 2,000 directions/day) for production-grade behaviour.
- Hours-of-service breaks are not modelled; ETAs assume continuous driving.
