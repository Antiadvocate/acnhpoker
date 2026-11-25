# Hyper

A hypertrophy coach for a home gym. Static site, no build step, runs on GitHub Pages.

- **Today**: check in (energy, sleep, time, soreness) and get a session built for the equipment you own, either by the AI coach or by the offline quick builder.
- **Workout**: set logging with last-time values, double-progression targets, RIR, automatic rest timers, plate math and warm-up ramps.
- **Progress**: weekly hard sets per muscle against target, estimated-1RM trends, bodyweight and sleep.
- **Coach**: chat with any OpenRouter model; it reads your log, metrics and equipment and can hand back startable workouts.
- **Data**: import Strong CSV history and Withings weight/sleep CSV; JSON backup and restore.

Everything is stored in the browser's localStorage. The OpenRouter key never leaves the device except in requests to openrouter.ai.

## Deploy

Repo Settings → Pages → Deploy from a branch → pick the branch, folder `/ (root)`.

## Run locally

    python3 -m http.server 8000
