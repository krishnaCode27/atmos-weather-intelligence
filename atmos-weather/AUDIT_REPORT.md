# Atmos — Deployment Audit Report
Date: 2026-09-27

## Summary
- Frontend: Next.js 16.3.6 (React 19.2.8, TS 5, Tailwind 4) — builds clean.
- Backend: FastAPI (uvicorn) on Python 3.14.3, scikit-learn 1.9.1, joblib 1.6.0, pandas 3.0.6.
- Model: active ackend/app/models/rain_model.joblib (RF, 500 trees, trained on 2551 days, test_acc 88.85%). Orphan ackend/app/rain_model.joblib is sklearn 1.8.0 pickled (InconsistentVersionWarning) — unused.
- Endpoints: /, /health, /api, /api/history, /api/ml/rain-prediction validated (422 for invalid params, correct 200s). History returns 60 rows clean; ML sums to 100%, reasonable latency.
- No .git repo, no secrets committed. .env.local present but ignored.
- Critical: missing ackend/requirements.txt (Render). CORS only allows localhost; needs Netlify frontend origin. Frontend defaults to localhost if NEXT_PUBLIC_API_URL unset.
- Training utilities mixed into runtime (	rain_model.py, create_dataset.py), no __init__.py in app package (implicit namespace), empty src/types/weather.ts, unused default public SVGs, README Vercel-centric.
## Cleanup Table (KEEP/REMOVE/MOVE/REASON)

| Path | Action | Reason |
|---|---|---|
| ackend/app/models/rain_model.joblib | KEEP | Runtime model (ml_model.py loads this). |
| ackend/app/rain_model.joblib | REMOVE | Orphan duplicate (sklearn 1.8.0 pickle), zero runtime references, can cause confusion. |
| ackend/app/ml_model.py | KEEP | Core ML logic; path already uses __file__ relative. |
| ackend/app/main.py | MODIFY | Add CORS for production FRONTEND_URL(s), avoid exposing full str(exc) in 500s (keep generic + log). |
| ackend/app/weather.py | KEEP | Minor control char not found now; no functional issue. |
| ackend/app/weather_data.py | KEEP | External API calls with timeouts present. |
| ackend/app/train_model.py | MOVE/SEPARATE | Training script, not needed at runtime. Suggest ackend/scripts/train_model.py (or docs). Do NOT delete dataset/model. |
| ackend/app/create_dataset.py | MOVE/SEPARATE | Dataset generation, not runtime. Suggest ackend/scripts/. |
| ackend/app/data/weather_dataset.csv | KEEP | Training data; referenced by train script (optional move). |
| ackend/requirements.txt | CREATE | Required for Render (Python build). Mirror installed packages (pinned). |
| ackend/app/__init__.py | CREATE (optional) | Explicit package; safe. Not required for import but cleaner. |
| ackend/.venv/, ackend/app/__pycache__/ | KEEP (local) | Local env; .gitignore will ignore if committed later. |
| src/lib/weatherApi.js | MODIFY | Respect NEXT_PUBLIC_API_URL in prod; avoid implicit localhost fallback in prod if missing (fail safe or warn). |
| src/app/page.js | KEEP | As-is per requirements (footer exact, toggles, search etc). |
| src/app/layout.tsx, globals.css | KEEP | Clean. |
| src/types/weather.ts (empty) | REMOVE | Unused, zero references. |
| public/file.svg, globe.svg, next.svg, vercel.svg, window.svg | REMOVE/KEEP | Zero references; default create-next-app. Safe to remove to reduce bundle (optional). Prefer minimal. |
| .env.local | KEEP (local) | Never commit; .gitignore covers *.env*. |
| .gitignore | REVIEW | Already ignores .env* and build dirs; consider adding backend/scripts/__pycache__, local notes. |
| README.md | UPDATE | Replace Vercel-centric with Netlify + Render deployment instructions (env vars, CORS, ). |
| 
etlify.toml, ender.yaml | CREATE | Deployment config per platform. |
| package.json | CONSIDER | Add "lint": "next lint" if linter desired (not present). Build-only OK for now. |
