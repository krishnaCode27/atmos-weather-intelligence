from __future__ import annotations

import asyncio
from datetime import date, timedelta
from pathlib import Path

import httpx
import pandas as pd


# ==============================
# SETTINGS
# ==============================

LATITUDE = 26.5
LONGITUDE = 78.0

# Around 7 years of data
END_DATE = date.today() - timedelta(days=1)
START_DATE = END_DATE - timedelta(days=2550)

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "app" / "data"
OUTPUT_FILE = OUTPUT_DIR / "weather_dataset.csv"

API_URL = "https://archive-api.open-meteo.com/v1/archive"


# ==============================
# FETCH DATA
# ==============================

async def fetch_weather():

    params = {
        "latitude": LATITUDE,
        "longitude": LONGITUDE,
        "start_date": START_DATE.isoformat(),
        "end_date": END_DATE.isoformat(),

        "hourly": ",".join([
            "temperature_2m",
            "relative_humidity_2m",
            "pressure_msl",
            "cloud_cover",
            "wind_speed_10m",
            "rain",
        ]),

        "timezone": "auto",
    }

    async with httpx.AsyncClient(timeout=120) as client:

        response = await client.get(
            API_URL,
            params=params
        )

        response.raise_for_status()

        data = response.json()

        if data.get("error"):
            raise RuntimeError(
                data.get(
                    "reason",
                    "Open-Meteo returned an error."
                )
            )

        return data


# ==============================
# CREATE DATASET
# ==============================

def create_dataset(data):

    hourly = data.get("hourly")

    if not hourly:
        raise ValueError(
            "No hourly weather data received."
        )

    df = pd.DataFrame(hourly)

    df["time"] = pd.to_datetime(
        df["time"]
    )

    df["date"] = df["time"].dt.date

    # Convert numeric columns
    numeric_columns = [
        "temperature_2m",
        "relative_humidity_2m",
        "pressure_msl",
        "cloud_cover",
        "wind_speed_10m",
        "rain",
    ]

    for column in numeric_columns:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

    # Replace missing rain
    df["rain"] = df["rain"].fillna(0)

    # ==============================
    # DAILY AGGREGATION
    # ==============================

    daily = (
        df.groupby("date")
        .agg(
            Temperature=(
                "temperature_2m",
                "mean"
            ),

            Humidity=(
                "relative_humidity_2m",
                "mean"
            ),

            Wind_Speed=(
                "wind_speed_10m",
                "mean"
            ),

            Cloud_Cover=(
                "cloud_cover",
                "mean"
            ),

            Pressure=(
                "pressure_msl",
                "mean"
            ),

            Rain=(
                "rain",
                "sum"
            ),
        )
        .reset_index()
    )

    # ==============================
    # TARGET
    # ==============================

    # Rain >= 1 mm means rain
    daily["Rain_Today"] = (
        daily["Rain"] >= 1.0
    ).astype(int)

    # Rename date
    daily.rename(
        columns={
            "date": "Date"
        },
        inplace=True
    )

    # Round values
    for column in [
        "Temperature",
        "Humidity",
        "Wind_Speed",
        "Cloud_Cover",
        "Pressure",
        "Rain",
    ]:

        daily[column] = daily[column].round(2)

    # Remove missing rows
    daily = daily.dropna()

    return daily


# ==============================
# MAIN
# ==============================

async def main():

    print("=" * 60)
    print("ATMOS WEATHER DATASET GENERATOR")
    print("=" * 60)

    print(f"Location: {LATITUDE}, {LONGITUDE}")
    print(f"Start:    {START_DATE}")
    print(f"End:      {END_DATE}")

    print("\nDownloading historical weather data...")

    data = await fetch_weather()

    print("Data received.")

    dataset = create_dataset(data)

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    dataset.to_csv(
        OUTPUT_FILE,
        index=False
    )

    print("\nDataset created successfully!")
    print(f"\nFile:")
    print(OUTPUT_FILE)

    print("\nDataset shape:")
    print(dataset.shape)

    print("\nColumns:")
    print(dataset.columns.tolist())

    print("\nRain distribution:")

    print(
        dataset["Rain_Today"]
        .value_counts()
        .sort_index()
    )

    print("\nFirst 5 rows:")
    print(dataset.head())

    print("\nLast 5 rows:")
    print(dataset.tail())

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())