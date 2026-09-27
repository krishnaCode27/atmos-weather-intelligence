from __future__ import annotations

import asyncio
import pandas as pd

from .weather_data import (
    fetch_historical_hourly as _fetch_historical_hourly,
    hourly_to_daily_dataframe,
)


# =========================================================
# RUN ASYNC FUNCTION FROM SYNC CODE
# =========================================================

def _run_async(coro):
    return asyncio.run(coro)


# =========================================================
# HISTORICAL HOURLY WEATHER
# =========================================================

def fetch_historical_hourly(
    latitude: float,
    longitude: float,
    days: int = 730,
):
    """
    Synchronous wrapper around the existing
    async historical weather function.
    """

    from datetime import date, timedelta

    end_date = date.today() - timedelta(days=1)

    start_date = (
        end_date
        - timedelta(days=days - 1)
    )

    return _run_async(
        _fetch_historical_hourly(
            latitude=latitude,
            longitude=longitude,
            start_date=start_date,
            end_date=end_date,
        )
    )


# =========================================================
# HOURLY → DAILY
# =========================================================

def aggregate_daily(
    data,
):
    """
    Convert Open-Meteo hourly data into
    daily weather features.
    """

    return hourly_to_daily_dataframe(
        data
    )


# =========================================================
# CLEAN RECORDS
# =========================================================

def clean_records(
    dataframe: pd.DataFrame,
    limit: int = 60,
):
    """
    Convert dataframe into JSON-friendly
    records for the frontend.
    """

    if dataframe is None:
        return []

    if dataframe.empty:
        return []

    records = (
        dataframe
        .tail(limit)
        .copy()
    )

    # Convert dates to strings
    if "date" in records.columns:

        records["date"] = records[
            "date"
        ].apply(
            lambda value:
            value.isoformat()
            if hasattr(
                value,
                "isoformat",
            )
            else str(value)
        )

    # Replace NaN / infinity values
    records = records.replace(
        [
            float("inf"),
            float("-inf"),
        ],
        None,
    )

    records = records.where(
        pd.notnull(records),
        None,
    )

    return records.to_dict(
        orient="records"
    )