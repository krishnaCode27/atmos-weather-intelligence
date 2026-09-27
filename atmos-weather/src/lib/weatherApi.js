const GEOCODING_URL =
  "https://geocoding-api.open-meteo.com/v1/search";

const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast";

const isDevelopment =
  process.env.NODE_ENV !== "production";

const CONFIGURED_BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL;

/*
  In production NEXT_PUBLIC_API_URL must be set at build
  time, otherwise the app would silently call localhost.
*/
const BACKEND_URL = CONFIGURED_BACKEND_URL
  ? CONFIGURED_BACKEND_URL.replace(/\/+$/, "")
  : isDevelopment
    ? "http://127.0.0.1:8000"
    : "";


function getMissingBackendConfigMessage() {
  return isDevelopment
    ? "Backend not reachable. Start it with: " +
      "uvicorn app.main:app --reload " +
      "(from the backend folder)"
    : "Atmos backend is not configured. " +
      "NEXT_PUBLIC_API_URL is missing.";
}


export async function searchCity(
  city,
  count = 20
) {

  const params = new URLSearchParams({
    name: city.trim(),
    count: count.toString(),
    language: "en",
    format: "json",
  });

  const response = await fetch(
    `${GEOCODING_URL}?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error("Location search failed.");
  }

  const data = await response.json();

  return data.results || [];
}


export async function getWeather(
  latitude,
  longitude
) {

  const params = new URLSearchParams({

    latitude: latitude.toString(),

    longitude: longitude.toString(),

    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "weather_code",
      "cloud_cover",
      "pressure_msl",
      "wind_speed_10m",
      "wind_direction_10m",
      "is_day",
    ].join(","),

    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "rain",
      "weather_code",
      "cloud_cover",
      "visibility",
      "wind_speed_10m",
    ].join(","),

    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "apparent_temperature_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "sunrise",
      "sunset",
      "wind_speed_10m_max",
    ].join(","),

    timezone: "auto",

    forecast_days: "7",
  });


  const response = await fetch(
    `${WEATHER_URL}?${params.toString()}`
  );


  if (!response.ok) {
    throw new Error(
      "Weather service unavailable."
    );
  }


  const data = await response.json();


  if (data.error) {
    throw new Error(
      data.reason ||
      "Weather service returned an error."
    );
  }


  return data;
}


/* =========================================
   ML RAIN PREDICTION
========================================= */

export async function getMLRainPrediction(
  latitude,
  longitude
) {

  const params = new URLSearchParams({

    latitude: latitude.toString(),

    longitude: longitude.toString(),

  });


  if (!BACKEND_URL) {
    throw new Error(
      getMissingBackendConfigMessage()
    );
  }


  const response = await fetch(

    `${BACKEND_URL}/api/ml/rain-prediction?${params.toString()}`,

    {
      cache: "no-store",
    }

  );


  if (!response.ok) {

    let message =
      "ML prediction service unavailable.";

    try {

      const errorData =
        await response.json();

      message =
        errorData.detail ||
        errorData.message ||
        message;

    } catch {
      // Ignore JSON parsing error
    }

    throw new Error(message);
  }


  const data =
    await response.json();


  if (data.success === false) {

    throw new Error(
      data.message ||
      "ML prediction failed."
    );

  }


  return data;
}


/* =========================================
   HISTORICAL WEATHER
========================================= */

export async function getHistoricalWeather(
  latitude,
  longitude,
  days = 60
) {

  const params = new URLSearchParams({

    latitude: latitude.toString(),

    longitude: longitude.toString(),

    days: days.toString(),

  });


  if (!BACKEND_URL) {
    throw new Error(
      getMissingBackendConfigMessage()
    );
  }


  const response = await fetch(

    `${BACKEND_URL}/api/history?${params.toString()}`,

    {
      cache: "no-store",
    }

  );


  if (!response.ok) {

    let message =
      "Historical weather service unavailable.";

    try {

      const errorData =
        await response.json();

      message =
        errorData.detail ||
        errorData.message ||
        message;

    } catch {
      // Ignore JSON parsing error
    }

    throw new Error(message);
  }


  return response.json();
}