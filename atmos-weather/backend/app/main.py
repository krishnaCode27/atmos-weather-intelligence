from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .ml_model import predict_next_day
from .weather import (
    aggregate_daily,
    fetch_historical_hourly,
    clean_records,
)


# ---------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------

app = FastAPI(
    title="Atmos Weather Intelligence ML API",
    description="AI-powered weather intelligence and rain prediction API.",
    version="1.0.0",
)


# ---------------------------------------------------------
# CORS Configuration
# ---------------------------------------------------------

frontend_url = os.getenv("FRONTEND_URL", "").strip()

allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

if frontend_url:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# Root Endpoint
# ---------------------------------------------------------

@app.get("/")
def root():
    return {
        "name": "Atmos Weather Intelligence",
        "status": "online",
        "version": "1.0.0",
        "ml": "Random Forest Rain Prediction",
    }


# ---------------------------------------------------------
# Health Check
# ---------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "healthy",
    }


# ---------------------------------------------------------
# Historical Weather Endpoint
# ---------------------------------------------------------

@app.get("/api/history")
def historical_weather(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    days: int = Query(60, ge=7, le=730),
):
    try:
        hourly = fetch_historical_hourly(
            latitude,
            longitude,
            days=days,
        )

        daily = aggregate_daily(hourly)

        records = clean_records(
            daily,
            limit=days,
        )

        return {
            "success": True,
            "latitude": latitude,
            "longitude": longitude,
            "days": len(records),
            "data": records,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


# ---------------------------------------------------------
# ML Rain Prediction Endpoint
# ---------------------------------------------------------

@app.get("/api/ml/rain-prediction")
def ml_rain_prediction(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    history_days: int = Query(
        730,
        ge=180,
        le=730,
    ),
):
    try:
        result = predict_next_day(
            latitude,
            longitude,
            history_days,
        )

        return result

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )