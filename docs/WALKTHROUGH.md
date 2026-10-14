# Loom walkthrough script (target 6-8 minutes)

Record against the hosted app: https://clearhaul.onrender.com
(open it a minute early so the free instance is awake). Browser at 1440x900,
DevTools closed. Plan a trip *before* hitting record so the first frame already
shows routes, checkpoints and the heatmap.

## 0:00 - Hook (30 s)

- "This is ClearHaul, a weather-aware truck router. You give it a trip, a
  departure time and a load weight. It builds three routes, looks up the
  forecast at the time the truck reaches each checkpoint, rates every stretch,
  and recommends the route with the fewest bad miles."
- Show the finished screen: three routes on the map, the recommendation, the
  heatmap corridor.

## 0:30 - Input (45 s)

- Click the **New Delhi-Mumbai** example link. Point out: From/To accept city
  names, addresses or raw lat/lon; departure defaults to the next hour; load in
  pounds with Empty/Light/Typical/Max presets; the sentence under the load
  changes as you cross 30,000 and 40,000 lb (that is the load rule in words).
- Choose **Check weather every 25 mi** and press **Plan routes**. While it
  loads: geocode both ends, fetch three routes, place checkpoints, one batched
  forecast call, score and rank. Usually 10 to 20 seconds.

## 1:15 - Routes and checkpoints (1.5 min)

- Map: routes A/B/C; the selected route is drawn thick and **coloured by the
  risk of each stretch**; checkpoints are dots coloured by level; S/E pins.
- Hover or click a checkpoint: mile, ETA, level, wind and gust, rain, snow,
  sky and temperature, and the reasons line ("Wind 38 mph (High)", "Wind 35-44
  mph with load over 40,000 lb: Severe").
- Route cards: drive time and delta to the fastest, distance, arrival, the
  risk ribbon (miles in proportion), miles per level, and the "Worst: ..."
  line, which jumps the map to that checkpoint. Expand the checkpoint table;
  click a row to fly to it.

## 2:45 - Recommendation logic (1.5 min)

- Read the recommendation: "Take Route C", the three reasons, and the ranked
  comparison table (No travel / Severe / High / Avg / Time).
- State the rules plainly:
  - wind, rain and snow each map to Low..No Travel; the worst variable wins;
  - load rules can only raise the level (45-54 mph over 30,000 lb: No Travel;
    35-44 mph over 40,000 lb: Severe; 55+ mph: No Travel for everyone);
  - ranking: fewest No-Travel miles, then Severe, then High, then lowest
    average risk, then shortest time.
- Mention that a stretch takes the worse of its two endpoint ratings
  (conservative) and that weather is interpolated to the ETA, not snapped to
  the nearest hour.

## 4:15 - Heatmap and time slider (1.5 min)

- Switch **Combined risk / Wind / Rain / Snow**.
- Drag the slider 0 -> 48 h; press **Play**. Point out the departure and ETA
  ticks, the truck marker moving along the selected route with the mile
  readout, and the matching marker on the route card's ribbon.
- Performance note: the heatmap is a small canvas re-drawn per frame with
  bilinear interpolation and blended between hours, draped on the map by
  MapLibre, so scrubbing stays smooth.

## 5:45 - Architecture and code (1.5 min)

- Backend: Django REST Framework. `services/` modules are pure functions
  (risk, sampling, recommend, heatmap) covered by 32 unit tests. Providers
  are swappable: OSRM by default, OpenRouteService truck profile with a key;
  Open-Meteo for weather with an automatic switch to MET Norway if Open-Meteo's
  per-IP quota is exhausted (it is shared on PaaS hosts). Batched and cached
  calls, a uniform error envelope, rate limiting.
- Frontend: React + TypeScript, Zustand store, MapLibre with GeoJSON sources
  and a canvas source; risk thresholds mirrored in `lib/risk.ts` and exposed
  by `/api/rules`.
- Deployment: one Docker image (Django serves the built React app) via
  `render.yaml`, or Vercel plus an API host.

## 7:15 - Close (20 s)

- Recap: correct rules, explainable recommendation, smooth map.
- Limitations, said plainly: OSRM is a car profile scaled 1.15x for trucks
  unless an ORS key is set; no hours-of-service breaks; forecast horizon 14
  days. What you would add next.

## Demo trips that usually show interesting weather

- New Delhi -> Mumbai (NH48 corridor, dust storms, monsoon rain)
- Bengaluru -> Hyderabad (Deccan thunderstorms)
- Chennai -> Kolkata (east-coast cyclone season, Oct-Dec)
- Ahmedabad -> Pune (Western Ghats rain)
- Jaipur -> Lucknow (winter fog, summer loo winds)

Tip: set the load to **Max (80k)** so the load rules bite on windy days, and
pick **10 mi** sampling to show checkpoint density.
