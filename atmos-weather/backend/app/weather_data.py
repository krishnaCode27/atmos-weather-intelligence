import httpx
import pandas as pd
from datetime import date, timedelta


HISTORICAL_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


# ---------------------------------------------------------
# Common HTTP GET helper
# ---------------------------------------------------------

async def fetch_json(url: str, params: dict):
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.get(url, params=params)

        response.raise_for_status()

        data = response.json()

        if data.get("error"):
            raise RuntimeError(
                data.get("reason", "Weather API returned an error.")
            )

        return data


# ---------------------------------------------------------
# Historical hourly weather
# ---------------------------------------------------------

async def fetch_historical_hourly(
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
):
    params = {
        "latitude": latitude,
        "longitude": longitude,

        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),

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

    return await fetch_json(HISTORICAL_URL, params)


# ---------------------------------------------------------
# Convert hourly historical data → daily data
# ---------------------------------------------------------

def hourly_to_daily_dataframe(data: dict) -> pd.DataFrame:

    hourly = data.get("hourly")

    if not hourly:
        raise ValueError("No hourly weather data received.")

    dataframe = pd.DataFrame(hourly)

    if "time" not in dataframe.columns:
        raise ValueError("Weather API response does not contain time data.")

    # Convert time to date
    dataframe["time"] = pd.to_datetime(dataframe["time"])
    dataframe["date"] = dataframe["time"].dt.date

    # Make sure numeric columns are numeric
    numeric_columns = [
        "temperature_2m",
        "relative_humidity_2m",
        "pressure_msl",
        "cloud_cover",
        "wind_speed_10m",
        "rain",
    ]

    for column in numeric_columns:
        if column in dataframe.columns:
            dataframe[column] = pd.to_numeric(
                dataframe[column],
                errors="coerce",
            )

    # Rain missing values are treated as zero
    if "rain" in dataframe.columns:
        dataframe["rain"] = dataframe["rain"].fillna(0)

    # Daily aggregation
    daily = (
        dataframe
        .groupby("date")
        .agg(
            temp_mean=("temperature_2m", "mean"),
            temp_max=("temperature_2m", "max"),
            temp_min=("temperature_2m", "min"),

            humidity_mean=(
                "relative_humidity_2m",
                "mean",
            ),

            pressure_mean=(
                "pressure_msl",
                "mean",
            ),

            cloud_mean=(
                "cloud_cover",
                "mean",
            ),

            wind_mean=(
                "wind_speed_10m",
                "mean",
            ),

            rain_sum=(
                "rain",
                "sum",
            ),
        )
        .reset_index()
    )

    # Remove incomplete rows
    daily = daily.dropna()

    # Sort by date
    daily = daily.sort_values("date")

    return daily


# ---------------------------------------------------------
# Fetch historical daily dataset
# ---------------------------------------------------------

async def fetch_historical_daily(
    latitude: float,
    longitude: float,
    days: int = 730,
):

    end_date = date.today() - timedelta(days=1)

    start_date = end_date - timedelta(days=days - 1)

    data = await fetch_historical_hourly(
        latitude=latitude,
        longitude=longitude,
        start_date=start_date,
        end_date=end_date,
    )

    daily = hourly_to_daily_dataframe(data)

    return daily


# ---------------------------------------------------------
# Forecast hourly weather
# ---------------------------------------------------------

async def fetch_forecast_hourly(
    latitude: float,
    longitude: float,
):

    params = {
        "latitude": latitude,
        "longitude": longitude,

        "forecast_days": 3,

        "hourly": ",".join([
            "temperature_2m",
            "relative_humidity_2m",
            "pressure_msl",
            "cloud_cover",
            "wind_speed_10m",
            "precipitation_probability",
            "rain",
        ]),

        "timezone": "auto",
    }

    return await fetch_json(FORECAST_URL, params)


# ---------------------------------------------------------
# Convert forecast hourly → daily features
# ---------------------------------------------------------

def forecast_hourly_to_daily(data: dict):

    hourly = data.get("hourly")

    if not hourly:
        raise ValueError("No forecast data received.")

    dataframe = pd.DataFrame(hourly)

    dataframe["time"] = pd.to_datetime(
        dataframe["time"]
    )

    dataframe["date"] = dataframe["time"].dt.date

    numeric_columns = [
        "temperature_2m",
        "relative_humidity_2m",
        "pressure_msl",
        "cloud_cover",
        "wind_speed_10m",
        "precipitation_probability",
        "rain",
    ]

    for column in numeric_columns:
        if column in dataframe.columns:
            dataframe[column] = pd.to_numeric(
                dataframe[column],
                errors="coerce",
            )

    dataframe["precipitation_probability"] = (
        dataframe["precipitation_probability"]
        .fillna(0)
    )

    dataframe["rain"] = dataframe["rain"].fillna(0)

    daily = (
        dataframe
        .groupby("date")
        .agg(
            temp_mean=("temperature_2m", "mean"),
            temp_max=("temperature_2m", "max"),
            temp_min=("temperature_2m", "min"),

            humidity_mean=(
                "relative_humidity_2m",
                "mean",
            ),

            pressure_mean=(
                "pressure_msl",
                "mean",
            ),

            cloud_mean=(
                "cloud_cover",
                "mean",
            ),

            wind_mean=(
                "wind_speed_10m",
                "mean",
            ),

            rain_sum=(
                "rain",
                "sum",
            ),

            precipitation_probability_max=(
                "precipitation_probability",
                "max",
            ),
        )
        .reset_index()
    )

    return daily


# ---------------------------------------------------------
# Fetch forecast daily data
# ---------------------------------------------------------

async def fetch_forecast_daily(
    latitude: float,
    longitude: float,
):

    data = await fetch_forecast_hourly(
        latitude=latitude,
        longitude=longitude,
    )

    daily = forecast_hourly_to_daily(data)

    return daily


# ---------------------------------------------------------
# Get recent historical data for graph
# ---------------------------------------------------------

def get_recent_history(
    dataframe: pd.DataFrame,
    days: int = 60,
):

    recent = dataframe.tail(days).copy()

    recent["date"] = recent["date"].apply(
        lambda value: value.isoformat()
    )

    return recent.to_dict(orient="records")