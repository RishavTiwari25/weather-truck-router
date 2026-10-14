# Loom walkthrough script (target 6-8 minutes)

Keep the browser at 1440x900, dark theme, DevTools closed. Have the app loaded
with a planned trip *before* recording so the first frame is already impressive.

## 0:00 - Hook (30 s)

- "This is ClearHaul, a weather-aware truck router. You give it a trip, a
  departure time and a load weight; it compares three routes by the weather
  the truck will actually meet at each point along the way, and recommends the
  safest one."
- Show the finished screen: routes on the map, recommendation card, heatmap.

## 0:30 - Input (45 s)

- Click **New Delhi -> Mumbai** sample chip. Point out: origin/destination accept
  city names, addresses or raw lat/lon; departure defaults to the next hour;
  load slider with presets; the two load rules light up as the slider crosses
  30,000 and 40,000 lb.
- Choose **every 25 mi** sampling and hit **Find safest route**. While loading
  mention the steps shown in the skeleton (geocode -> 3 routes -> sample
  forecast -> score & rank).

## 1:15 - Routes and checkpoints (1.5 min)

- Map: three routes A/B/C, selected route drawn thick and **coloured by the
  risk of each segment**; checkpoints as circles coloured by level.
- Hover / click a checkpoint: mile, ETA, level, wind + gust, rain, snow, temp,
  and the *reasons* ("Wind 38 mph (High)", "Wind 35-44 mph with load over
  40,000 lb: Severe").
- Route cards: risk ribbon (miles proportional), distance, drive time, arrival,
  average risk, miles per level. Expand **checkpoints** table; click a row to
  fly to it.

## 2:45 - Recommendation logic (1.5 min)

- Read the recommendation card: "Route C avoids Severe weather entirely; costs
  2h 56m more than the fastest route". Show the ranking order line.
- Explain the exact rules (point at README table if helpful):
  - thresholds for wind / rain / snow -> worst variable wins;
  - load rules can only raise the level;
  - ranking: No-Travel miles, Severe miles, High miles, average risk, time.
- Mention that segment miles take the worse endpoint level (conservative) and
  that weather is interpolated to the ETA, not the nearest hour.

## 4:15 - Heatmap and time slider (1.5 min)

- Toggle **Combined risk / Wind / Rain / Snow**.
- Drag the slider 0 -> 48 h; press **Play**. Point out the departure and ETA
  ticks, the truck marker moving along the selected route with "mile X of Y",
  and the ribbon marker in the sidebar moving in sync.
- Note performance: the heatmap is a small canvas rendered per frame with
  bilinear interpolation and blended between hours, draped by MapLibre on the
  GPU, so scrubbing stays smooth.

## 5:45 - Architecture and code (1.5 min)

- Backend: Django REST Framework; `services/` modules are pure functions
  (risk, sampling, recommend, heatmap) with 26 unit tests; providers are
  swappable (OSRM default, OpenRouteService truck profile with a key);
  batched + cached Open-Meteo calls; uniform error envelope; rate limiting.
- Frontend: React + TypeScript, Zustand store, MapLibre with GeoJSON sources
  and a canvas source; risk thresholds mirrored in `lib/risk.ts` and exposed
  by `/api/rules`.
- Deployment: single Docker image (Django serves the built React app) with
  `render.yaml`; or Vercel + API host.

## 7:15 - Close (20 s)

- Recap: correct rules, explainable recommendation, smooth map.
- Mention limitations honestly (OSRM car profile scaled for trucks unless ORS
  key, no hours-of-service modelling) and what you would add next.

## Demo trips that usually show interesting weather

- New Delhi -> Mumbai (NH48 corridor, pre-monsoon dust storms, monsoon rain)
- Bengaluru -> Hyderabad (Deccan thunderstorms)
- Chennai -> Kolkata (east-coast cyclone season, Oct-Dec)
- Ahmedabad -> Pune (Western Ghats rain)
- Jaipur -> Lucknow (winter fog, summer loo winds)

Tip: set the load to **Max (80,000 lb)** to make the load rules bite on windy
days, and switch to **every 10 mi** sampling to show checkpoint density.
