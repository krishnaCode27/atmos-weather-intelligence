from __future__ import annotations

import logging
import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .ml_model import predict_next_day

from .weather import (
    aggregate_daily,
    fetch_historical_hourly,
    clean_records,
)


# =========================================================
# LOGGING
# =========================================================

logger = logging.getLogger("atmos.api")


# =========================================================
# FastAPI Application
# =========================================================

app = FastAPI(
    title="Atmos Weather Intelligence ML API",
    description="ML-powered weather analysis and rain prediction API",
    version="1.0.0",
)


# =========================================================
# CORS
# =========================================================

DEFAULT_LOCAL_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


def get_allowed_origins() -> list[str]:
    """
    Localhost origins are always allowed for development.

    FRONTEND_URL supplies the production Netlify origin(s)
    and may contain a comma-separated list.
    """

    configured = os.environ.get("FRONTEND_URL", "").strip()

    if not configured:
        return DEFAULT_LOCAL_ORIGINS

    origins = [
        origin.strip().rstrip("/")
        for origin in configured.split(",")
        if origin.strip()
    ]

    return DEFAULT_LOCAL_ORIGINS + origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():
    return {
        "name": "Atmos Weather Intelligence",
        "status": "online",
        "version": "1.0.0",
        "ml": "Random Forest Rain Prediction",
        "docs": "/docs",
        "health": "/health",
    }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "Atmos Weather Intelligence ML API",
    }


# =========================================================
# HISTORICAL WEATHER API
# =========================================================

@app.get("/api/history")
def historical_weather(
    latitude: float = Query(
        ...,
        ge=-90,
        le=90,
        description="Latitude",
    ),

    longitude: float = Query(
        ...,
        ge=-180,
        le=180,
        description="Longitude",
    ),

    days: int = Query(
        60,
        ge=7,
        le=730,
        description="Number of historical days",
    ),
):
    """
    Fetch historical hourly weather data,
    aggregate it into daily weather data,
    and return cleaned records.
    """

    try:

        # ---------------------------------------------
        # Fetch historical hourly weather
        # ---------------------------------------------

        hourly = fetch_historical_hourly(
            latitude=latitude,
            longitude=longitude,
            days=days,
        )

        # ---------------------------------------------
        # Convert hourly → daily
        # ---------------------------------------------

        daily = aggregate_daily(
            hourly
        )

        # ---------------------------------------------
        # Clean records for frontend
        # ---------------------------------------------

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

        logger.exception(
            "Historical weather request failed "
            "(lat=%s, lon=%s, days=%s)",
            latitude,
            longitude,
            days,
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "Upstream weather data is unavailable. "
                "Please try again shortly."
            ),
        ) from exc


# =========================================================
# ML RAIN PREDICTION
# =========================================================

@app.get("/api/ml/rain-prediction")
def ml_rain_prediction(
    latitude: float = Query(
        ...,
        ge=-90,
        le=90,
        description="Latitude",
    ),

    longitude: float = Query(
        ...,
        ge=-180,
        le=180,
        description="Longitude",
    ),

    history_days: int = Query(
        730,
        ge=180,
        le=730,
        description="Historical days used for ML training",
    ),
):
    """
    Train/use the Random Forest model on historical weather
    data and predict rain probability for the next day.
    """

    try:

        result = predict_next_day(
            latitude=latitude,
            longitude=longitude,
            history_days=history_days,
        )

        return {
            "success": True,
            **result,
        }

    except Exception as exc:

        logger.exception(
            "ML rain prediction request failed "
            "(lat=%s, lon=%s, history_days=%s)",
            latitude,
            longitude,
            history_days,
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "Rain prediction is temporarily "
                "unavailable. Please try again shortly."
            ),
        ) from exc


# =========================================================
# API INFORMATION
# =========================================================

@app.get("/api")
def api_information():
    return {
        "name": "Atmos Weather Intelligence API",

        "endpoints": {
            "health": "/health",
            "historical_weather": "/api/history",
            "rain_prediction": "/api/ml/rain-prediction",
            "documentation": "/docs",
        },

        "ml_model": {
            "type": "Random Forest Classifier",
            "purpose": "Next-day rain prediction",
        },
    }