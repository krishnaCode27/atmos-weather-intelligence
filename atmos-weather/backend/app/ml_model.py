from __future__ import annotations

import asyncio
from pathlib import Path

import joblib
import pandas as pd

from .weather_data import fetch_forecast_daily


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "models" / "rain_model.joblib"


# ============================================================
# MODEL CONFIGURATION
# ============================================================

FEATURES = [
    "Temperature",
    "Humidity",
    "Wind_Speed",
    "Cloud_Cover",
    "Pressure",
]


# ============================================================
# TRAINING / EVALUATION METRICS
# ============================================================

MODEL_METADATA = {
    "name": "Random Forest",
    "type": "Binary Rain Classification",
    "training_dataset": 2551,
    "training_records": 2040,
    "testing_records": 511,
    "test_accuracy": 88.85,
    "test_precision": 80.23,
    "test_recall": 86.59,
    "test_f1_score": 83.28,
    "test_roc_auc": 0.9604,
    "trees": 500,
    "features": FEATURES,
}


# ============================================================
# LOAD MODEL
# ============================================================

if not MODEL_PATH.exists():

    raise FileNotFoundError(
        f"Trained model not found: {MODEL_PATH}"
    )


MODEL = joblib.load(MODEL_PATH)


# ============================================================
# BUILD FEATURES
# ============================================================

def build_features(day: pd.Series) -> pd.DataFrame:

    return pd.DataFrame(
        [
            {
                "Temperature": float(
                    day["temp_mean"]
                ),

                "Humidity": float(
                    day["humidity_mean"]
                ),

                "Wind_Speed": float(
                    day["wind_mean"]
                ),

                "Cloud_Cover": float(
                    day["cloud_mean"]
                ),

                "Pressure": float(
                    day["pressure_mean"]
                ),
            }
        ]
    )


# ============================================================
# RAIN PREDICTION
# ============================================================

def predict_rain(features: pd.DataFrame):

    # Probability for both classes
    probabilities = MODEL.predict_proba(
        features
    )[0]

    classes = MODEL.classes_

    probability_map = {
        int(class_value): float(probability)
        for class_value, probability
        in zip(classes, probabilities)
    }

    no_rain_probability = probability_map.get(
        0,
        0.0
    )

    rain_probability = probability_map.get(
        1,
        0.0
    )

    prediction = int(
        MODEL.predict(features)[0]
    )

    # Probability of the predicted class
    predicted_probability = (
        rain_probability
        if prediction == 1
        else no_rain_probability
    )

    return {
        "prediction": (
            "rain"
            if prediction == 1
            else "no rain"
        ),

        "rain_probability": round(
            rain_probability * 100,
            2
        ),

        "no_rain_probability": round(
            no_rain_probability * 100,
            2
        ),

        "confidence_score": round(
            predicted_probability * 100,
            2
        ),
    }


# ============================================================
# NEXT DAY PREDICTION
# ============================================================

def predict_next_day(
    latitude: float,
    longitude: float,
    history_days: int = 730,
):

    # Fetch weather forecast
    forecast = asyncio.run(
        fetch_forecast_daily(
            latitude,
            longitude
        )
    )

    if forecast is None or forecast.empty:

        raise ValueError(
            "No forecast data received."
        )

    # Select tomorrow
    if len(forecast) > 1:

        tomorrow = forecast.iloc[1]

    else:

        tomorrow = forecast.iloc[0]

    # Build ML features
    features = build_features(
        tomorrow
    )

    # Predict
    prediction = predict_rain(
        features
    )


    # ========================================================
    # RESPONSE
    # ========================================================

    return {

        "success": True,

        "latitude": latitude,

        "longitude": longitude,

        "prediction_date": str(
            tomorrow["date"]
        ),

        "model": MODEL_METADATA,

        "prediction": prediction,

        "forecast_features": {

            "temperature": round(
                float(
                    tomorrow["temp_mean"]
                ),
                2
            ),

            "humidity": round(
                float(
                    tomorrow["humidity_mean"]
                ),
                2
            ),

            "wind_speed": round(
                float(
                    tomorrow["wind_mean"]
                ),
                2
            ),

            "cloud_cover": round(
                float(
                    tomorrow["cloud_mean"]
                ),
                2
            ),

            "pressure": round(
                float(
                    tomorrow["pressure_mean"]
                ),
                2
            ),
        },
    }