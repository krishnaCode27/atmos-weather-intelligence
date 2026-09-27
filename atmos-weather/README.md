# Atmos — Weather Intelligence

AI-powered weather intelligence with a Random Forest rain-prediction model.

Built by **Krishna Gupta**.

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Framer Motion |
| Backend | FastAPI, Uvicorn, pandas, scikit-learn |
| Weather data | Open-Meteo (forecast, geocoding, historical archive) — no API key required |
| ML model | Random Forest Classifier, 500 trees, next-day rain probability |

## Project structure

```
src/
  app/
    page.js          # Main Atmos UI
    layout.tsx       # Root layout, Geist fonts, metadata
    globals.css      # Tailwind entry + Atmos design tokens
  lib/
    weatherApi.js    # Open-Meteo + backend API client
backend/
  app/
    main.py          # FastAPI app, routes, CORS
    ml_model.py      # Model loading and prediction
    weather.py       # Daily aggregation and record cleanup
    weather_data.py  # Open-Meteo archive/forecast requests
    models/
      rain_model.joblib   # Trained model (used at runtime)
  scripts/
    create_dataset.py    # Regenerates the training dataset
    train_model.py       # Retrains and saves the model
  requirements.txt   # Pinned runtime dependencies
```

## Local development

**Frontend** (runs on port 3000):

```bash
npm install
npm run dev
```

**Backend** (runs on port 8000):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The frontend reads the backend URL from `.env.local`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

In production, if `NEXT_PUBLIC_API_URL` is missing the frontend shows a
configuration message instead of silently calling localhost.

## Backend endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Service metadata |
| GET | `/health` | Health check (used by Render) |
| GET | `/api` | Endpoint index |
| GET | `/api/history` | Daily historical weather, `?latitude=&longitude=&days=` (7–730) |
| GET | `/api/ml/rain-prediction` | Next-day rain probability, `?latitude=&longitude=&history_days=` (180–730) |
| GET | `/docs` | Interactive OpenAPI docs |

## Deployment

### Frontend — Netlify

1. Push the repository to GitHub, then import it in Netlify.
2. Build settings are defined in `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Node version: `24`
3. In **Netlify → Site configuration → Environment variables**, add:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_API_URL` | Your Render backend URL, e.g. `https://atmos-weather-backend.onrender.com` |

   This variable is **inlined at build time**, so add it before the first
   production build, then trigger a new deploy.

### Backend — Render

1. Create a new **Web Service** from the same repository, or use the
   `render.yaml` blueprint.
2. Configuration (from `render.yaml`):
   - Root directory: `backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Health check path: `/health`
3. Add the environment variable:

   | Variable | Value |
   | --- | --- |
   | `FRONTEND_URL` | Your Netlify URL, e.g. `https://your-app.netlify.app` |

   Multiple origins can be comma-separated. `FRONTEND_URL` feeds the CORS
   allow-list; localhost origins remain allowed for development.

4. After the backend is live, set `NEXT_PUBLIC_API_URL` on Netlify to the
   Render URL and redeploy the frontend.

### Order of operations

Deploy the backend first so you have its URL, then configure the frontend.

## Model retraining

```bash
cd backend
python scripts/create_dataset.py   # optional: refresh training data
python scripts/train_model.py     # retrains and writes app/models/rain_model.joblib
```

`train_model.py` uses a chronological 80/20 split and reports accuracy,
precision, recall, F1, ROC-AUC, and feature importances.

## Notes

- No API keys are required. Do not add any; Open-Meteo endpoints used here
  are keyless.
- `.env.local` and all `.env*` files are git-ignored and must never be
  committed.
- `NEXT_PUBLIC_*` variables are embedded in the client bundle and are public.
