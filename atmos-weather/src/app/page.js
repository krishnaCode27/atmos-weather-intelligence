"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  MapPin,
  LocateFixed,
  Droplets,
  Wind,
  Gauge,
  Cloud,
  CloudRain,
  Sun,
  CloudSun,
  CloudLightning,
  CalendarDays,
  BrainCircuit,
  Activity,
  TrendingUp,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Sparkles,
  X,
  Bell,
  BellRing,
  CheckCircle2,
} from "lucide-react";

import {
  searchCity,
  getWeather,
  getMLRainPrediction,
  getHistoricalWeather,
} from "@/lib/weatherApi";

const ACCENT = "#FF4696";
const DARK = "#1E1033";

const IP_LOCATION_URL =
  "https://ipwho.is/";

/*
 * PositionError codes from
 * navigator.geolocation.
 */
const GEOLOCATION_MESSAGES = {
  1: "Location permission was denied. Allow location access in your browser, or search for a city.",
  2: "Your location could not be determined by the browser.",
  3: "Location request timed out.",
};

const DEFAULT_CITY = {
  name: "Gwalior",
  latitude: 26.2183,
  longitude: 78.1828,
  country: "India",
  admin1: "Madhya Pradesh",
};

function getWeatherInfo(code) {
  const map = {
    0: ["Clear Sky", Sun],
    1: ["Mainly Clear", Sun],
    2: ["Partly Cloudy", CloudSun],
    3: ["Overcast", Cloud],
    45: ["Foggy", Cloud],
    48: ["Rime Fog", Cloud],
    51: ["Light Drizzle", CloudRain],
    53: ["Drizzle", CloudRain],
    55: ["Dense Drizzle", CloudRain],
    61: ["Light Rain", CloudRain],
    63: ["Moderate Rain", CloudRain],
    65: ["Heavy Rain", CloudRain],
    66: ["Freezing Rain", CloudRain],
    67: ["Heavy Freezing Rain", CloudRain],
    71: ["Light Snow", Cloud],
    73: ["Snow", Cloud],
    75: ["Heavy Snow", Cloud],
    77: ["Snow Grains", Cloud],
    80: ["Rain Showers", CloudRain],
    81: ["Rain Showers", CloudRain],
    82: ["Heavy Showers", CloudRain],
    85: ["Snow Showers", Cloud],
    86: ["Heavy Snow", Cloud],
    95: ["Thunderstorm", CloudLightning],
    96: ["Thunderstorm", CloudLightning],
    99: ["Severe Thunderstorm", CloudLightning],
  };

  const [label, icon] = map[code] || ["Unknown", Cloud];

  return {
    label,
    icon,
  };
}

function getTheme(temp) {
  if (temp <= 5) {
    return {
      accent: "#67E8F9",
      secondary: "#071A2B",
      glow: "rgba(103,232,249,.18)",
      description: "Freezing Atmosphere",
    };
  }

  if (temp <= 15) {
    return {
      accent: "#60A5FA",
      secondary: "#101D3D",
      glow: "rgba(96,165,250,.18)",
      description: "Cold Atmosphere",
    };
  }

  if (temp <= 25) {
    return {
      accent: "#A78BFA",
      secondary: DARK,
      glow: "rgba(167,139,250,.18)",
      description: "Comfortable Atmosphere",
    };
  }

  if (temp <= 32) {
    return {
      accent: ACCENT,
      secondary: DARK,
      glow: "rgba(255,70,150,.18)",
      description: "Warm Atmosphere",
    };
  }

  if (temp <= 38) {
    return {
      accent: "#FB923C",
      secondary: "#29130D",
      glow: "rgba(251,146,60,.18)",
      description: "Hot Atmosphere",
    };
  }

  return {
    accent: "#EF4444",
    secondary: "#250C0C",
    glow: "rgba(239,68,68,.2)",
    description: "Extreme Heat",
  };
}

const round = (value) => {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "--";
  }

  return Math.round(Number(value));
};

/*
 * Converts any value into a finite number.
 * Prevents NaN / undefined from ever reaching the UI.
 */
const toNumber = (
  value,
  fallback = 0
) => {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
};

/*
 * Temperature display format:
 * integers stay clean (31) and decimals keep
 * one place (31.5). Never returns NaN.
 */
const formatTempValue = (
  value
) => {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return "--";
  }

  const rounded =
    Math.round(parsed * 10) / 10;

  return Number.isInteger(
    rounded
  )
    ? String(rounded)
    : rounded.toFixed(1);
};

const clamp = (value, min, max) =>
  Math.min(
    Math.max(Number(value) || 0, min),
    max
  );

/* =====================================================
   PLACE SEARCH
   Ranking and cleanup for Open-Meteo geocoding
   results. Pure functions, no state, no fetching.
   ===================================================== */

/*
 * Open-Meteo feature codes (GeoNames style):
 *   PPLA  -> seat of a first order admin division (Delhi)
 *   PPLA2 -> seat of a second order division (major city)
 *   PPL   -> populated place (can be a city or a village)
 *   PPLC  -> section of populated place (New Delhi)
 *   PPLL  -> populated locality, usually a small village
 *   PPLX  -> section of populated place
 *   PCLI  -> independent political entity (the country)
 *   ADM*  -> administrative division, not a settlement
 *   AIR*  -> airport, not a settlement
 *
 * Every populated place code starts with "PPL", and a
 * live sweep of the geocoding API for real city names
 * returned PPL, PPLA, PPLA2, PPLA3, PPLC, PPLL and
 * PPLX. Matching on the prefix keeps rarer variants
 * such as PPLC working instead of silently dropping a
 * real city because its exact code was not listed.
 */

const PLACE_FEATURE_RANK = {
  PPLA: 0,
  PPLA2: 1,
  PPLA3: 2,
  PPLA4: 3,
  PPLA5: 4,
  PPL: 5,
};

const UNRANKED_PLACE_FEATURE_RANK = 6;

const INDIA = "india";

const normalizePlaceName = (
  value
) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const isSettlement = (result) =>
  String(
    result?.feature_code || ""
  )
    .toUpperCase()
    .startsWith("PPL");

const isIndianPlace = (result) =>
  normalizePlaceName(
    result?.country
  ) === INDIA ||
  String(result?.country_code || "")
    .toUpperCase() === "IN";

const hasUsableCoordinates = (
  result
) => {
  const lat = Number(
    result?.latitude
  );
  const lon = Number(
    result?.longitude
  );

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
};

const featureRank = (result) => {
  const code = String(
    result?.feature_code || ""
  ).toUpperCase();

  if (
    Object.prototype.hasOwnProperty.call(
      PLACE_FEATURE_RANK,
      code
    )
  ) {
    return PLACE_FEATURE_RANK[code];
  }

  return isSettlement(result)
    ? UNRANKED_PLACE_FEATURE_RANK
    : 9;
};

/*
 * Removes results that are not settlements (countries,
 * states, airports) and then, when the response does
 * contain a settlement the API knows a population for,
 * drops the entries the API has no population for.
 * Those are the small villages, hamlets and postal
 * localities that otherwise bury a real city.
 *
 * The population step is deliberately conditional: when
 * nothing in the response has a population, nothing is
 * removed.
 */

function keepRealPlaces(
  results
) {
  const settlements =
    results.filter(
      isSettlement
    );

  if (!settlements.length) {
    return [];
  }

  const withPopulation =
    settlements.filter(
      (result) =>
        Number.isFinite(
          Number(result?.population)
        )
    );

  if (!withPopulation.length) {
    return settlements;
  }

  return withPopulation;
}

/*
 * Duplicate key is locality + state + country, which is
 * stable and comes straight from the API. Coordinates
 * are part of the key too, because the same locality
 * name legitimately repeats in different districts.
 */

function dedupeResults(
  results
) {
  const seen = new Set();

  return results.filter(
    (result) => {
      const key = [
        normalizePlaceName(
          result?.name
        ),
        normalizePlaceName(
          result?.admin1
        ),
        normalizePlaceName(
          result?.country
        ),
        Number(
          result?.latitude
        ).toFixed(3),
        Number(
          result?.longitude
        ).toFixed(3),
      ].join("|");

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }
  );
}

/*
 * Deterministic ordering, no popularity scoring and no
 * hardcoded city list. Every comparison below uses a
 * value the API returned.
 *
 *   1. Indian settlements before anywhere else
 *   2. exact name, then starts with, then contains
 *   3. stronger feature code (PPLA before PPL)
 *   4. larger reported population
 *   5. name closest in length to the query
 *   6. name, then coordinates, so the order is stable
 */

function compareResults(
  query
) {
  const needle = normalizePlaceName(query);
  const needleLength = needle.length;

  return (a, b) => {
    const nameA = normalizePlaceName(
      a?.name
    );
    const nameB = normalizePlaceName(
      b?.name
    );

    const indiaA = isIndianPlace(a);
    const indiaB = isIndianPlace(b);

    if (indiaA !== indiaB) {
      return indiaA ? -1 : 1;
    }

    const matchRank = (name) => {
      if (!needle) {
        return 2;
      }

      if (name === needle) {
        return 0;
      }

      if (name.startsWith(needle)) {
        return 1;
      }

      return name.includes(needle) ? 2 : 3;
    };

    const matchA = matchRank(nameA);
    const matchB = matchRank(nameB);

    if (matchA !== matchB) {
      return matchA - matchB;
    }

    const featureA = featureRank(a);
    const featureB = featureRank(b);

    if (featureA !== featureB) {
      return featureA - featureB;
    }

    const popA = Number(
      a?.population
    );
    const popB = Number(
      b?.population
    );

    const safePopA =
      Number.isFinite(popA) ? popA : -1;
    const safePopB =
      Number.isFinite(popB) ? popB : -1;

    if (safePopA !== safePopB) {
      return safePopB - safePopA;
    }

    const lengthGapA = Math.abs(
      nameA.length - needleLength
    );
    const lengthGapB = Math.abs(
      nameB.length - needleLength
    );

    if (lengthGapA !== lengthGapB) {
      return lengthGapA - lengthGapB;
    }

    if (nameA !== nameB) {
      return nameA < nameB ? -1 : 1;
    }

    return (
      Number(a?.latitude) -
      Number(b?.latitude)
    );
  };
}

/*
 * The single entry point used by the search box, the
 * Enter shortcut and the recommended city list, so all
 * three order results identically.
 */

function rankSearchResults(
  results,
  query
) {
  const list = Array.isArray(results)
    ? results
    : [];

  const cleaned = dedupeResults(
    keepRealPlaces(
      list.filter(
        (result) =>
          Boolean(
            normalizePlaceName(
              result?.name
            )
          ) && hasUsableCoordinates(result)
      )
    )
  );

  /*
   * The API occasionally returns a place whose name
   * does not contain the query at all, because the
   * match was on a district or township field. Those
   * are dropped whenever a genuine name match exists.
   */
  const needle = normalizePlaceName(
    query
  );

  const nameMatches =
    cleaned.filter(
      (result) =>
        normalizePlaceName(
          result?.name
        ).includes(needle)
    );

  const relevant =
    needle && nameMatches.length
      ? nameMatches
      : cleaned;

  return relevant.sort(
    compareResults(query)
  );
}

/*
 * Recommended cities are resolved through the same
 * geocoding API and the same ranking, so the names are
 * only labels and every latitude and longitude shown is
 * a real API result. Nothing here is a hardcoded
 * coordinate.
 */

const RECOMMENDED_CITY_NAMES = [
  "New Delhi",
  "Mumbai",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Indore",
];

let recommendedCitiesPromise = null;

/*
 * Cached for the lifetime of the page session so
 * focusing the empty search bar never triggers a second
 * round of requests.
 */

function loadRecommendedCities() {
  if (
    !recommendedCitiesPromise
  ) {
    recommendedCitiesPromise =
      Promise.all(
        RECOMMENDED_CITY_NAMES.map(
          async (name) => {
            try {
              const results =
                await searchCity(
                  name,
                  10
                );

              /*
               * Keep only the Indian match for each
               * recommended name, then take the best
               * ranked one.
               */
              const indian =
                rankSearchResults(
                  results,
                  name
                ).filter(
                  isIndianPlace
                );

              return indian[0] || null;
            } catch {
              return null;
            }
          }
        )
      )
        .then((list) =>
          list.filter(Boolean)
        )
        .catch(() => []);
  }

  return recommendedCitiesPromise;
}

/* =====================================================
   TEMPERATURE UNITS
   ===================================================== */

/*
 * The API always returns Celsius. Only the hero
 * and the "feels like" value are converted, so
 * the colour theme and every other section stay
 * on the real Celsius reading.
 */

const convertTemperature = (
  value,
  unit
) => {
  /*
   * Explicit guards first: Number(null) and
   * Number("") are both 0, which would render
   * a fake "32F" when there is no reading.
   */
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return unit === "f"
    ? (parsed * 9) / 5 + 32
    : parsed;
};

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString([], {
        day: "2-digit",
        month: "short",
      })
    : "--";

const formatHour = (value) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "numeric",
      })
    : "--";

const formatDay = (value, index) =>
  index === 0
    ? "Today"
    : index === 1
    ? "Tomorrow"
    : new Date(value).toLocaleDateString([], {
        weekday: "short",
      });

/* =====================================================
   LOCATION DETECTION
   ===================================================== */

function getBrowserPosition({
  enableHighAccuracy,
  timeout,
  maximumAge = 60000,
}) {
  return new Promise(
    (resolve, reject) => {
      if (
        typeof navigator ===
          "undefined" ||
        !navigator.geolocation
      ) {
        reject(
          new Error(
            "Geolocation is not supported by this browser."
          )
        );
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy,
          timeout,
          maximumAge,
        }
      );
    }
  );
}

/*
 * Desktop browsers usually have no GPS, so a
 * high accuracy request times out or errors out.
 * Retry once with a low accuracy (network based)
 * request before giving up.
 */
async function detectBrowserPosition() {
  try {
    return await getBrowserPosition({
      enableHighAccuracy: true,
      timeout: 6000,
    });
  } catch {
    return getBrowserPosition({
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    });
  }
}

/*
 * Last resort: an IP based approximate location
 * so the app can still start without GPS.
 */
async function detectIpLocation() {
  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    8000
  );

  try {
    const response = await fetch(
      IP_LOCATION_URL,
      {
        cache: "no-store",
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(
        "IP lookup failed"
      );
    }

    const data = await response.json();

    const latitude = toNumber(
      data?.latitude,
      NaN
    );

    const longitude = toNumber(
      data?.longitude,
      NaN
    );

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      throw new Error(
        "IP location unavailable"
      );
    }

    return {
      name:
        data.city ||
        data.region ||
        "Approximate Location",

      country: data.country || "",

      admin1: data.region || "",

      latitude,

      longitude,

      approximate: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/*
 * Turns raw coordinates into a full location
 * object. Never throws: a failed name lookup
 * only means a less specific label.
 */
async function resolveLocation(
  latitude,
  longitude
) {
  const place =
    await reverseGeocode(
      latitude,
      longitude
    );

  return {
    ...place,
    latitude,
    longitude,
  };
}

async function reverseGeocode(latitude, longitude) {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&localityLanguage=en`;

  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    10000
  );

  try {
    const response = await fetch(
      url,
      {
        cache: "no-store",
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(
        "Reverse geocoding failed"
      );
    }

    const data = await response.json();

    const administrativeName =
      data.localityInfo?.administrative?.find(
        (item) => item?.order === 8
      )?.name || "";

    return {
      name:
        data.city ||
        data.locality ||
        administrativeName ||
        data.principalSubdivision ||
        "Current Location",

      country: data.countryName || "",

      admin1:
        data.principalSubdivision || "",
    };
  } catch {
    return {
      name: "Current Location",
      country: "",
      admin1: "",
    };
  } finally {
    clearTimeout(timer);
  }
}

export default function Home() {
  const [city, setCity] = useState("");
  const [selectedCity, setSelectedCity] =
    useState(DEFAULT_CITY);

  const [suggestions, setSuggestions] = useState([]);

  const [weather, setWeather] = useState(null);
  const [mlPrediction, setMlPrediction] = useState(null);
  const [history, setHistory] = useState([]);

  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] =
    useState(false);
  const [mlLoading, setMlLoading] = useState(false);
  const [historyLoading, setHistoryLoading] =
    useState(false);
  const [locationLoading, setLocationLoading] =
    useState(false);

  const [error, setError] = useState("");
  const [mlError, setMlError] = useState("");
  const [historyError, setHistoryError] =
    useState("");

  /*
   * Search dropdown state.
   * searchOpen  -> the panel is allowed to be visible
   * activeIndex -> keyboard highlighted row
   */
  const [searchOpen, setSearchOpen] =
    useState(false);
  const [activeIndex, setActiveIndex] =
    useState(-1);
  const [recommendedCities, setRecommendedCities] =
    useState([]);

  /*
   * True until the recommended city list has settled,
   * so focusing an empty search box can show a loading
   * row straight away instead of appearing to do
   * nothing.
   */
  const [recommendationsLoading, setRecommendationsLoading] =
    useState(true);

  /*
   * The query whose search has already finished, used
   * to tell "not searched yet" apart from "searched and
   * found nothing".
   */
  const [searchedQuery, setSearchedQuery] =
    useState("");

  const searchRequestRef = useRef(0);
  const searchBoxRef = useRef(null);
  const activeRowRef = useRef(null);

  /*
   * Location startup states:
   * "prompt"  -> offer to use the current location
   * "notice"  -> an approximate location was used
   */
  const [locationPrompt, setLocationPrompt] =
    useState(false);
  const [locationNotice, setLocationNotice] =
    useState("");

  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedHistoryPoint, setSelectedHistoryPoint] =
    useState(null);

  // Hero temperature unit: "c" or "f"
  const [unit, setUnit] = useState("c");

  const unitSymbol =
    unit === "f" ? "°F" : "°C";

  // Browser notification settings
  const [alertsEnabled, setAlertsEnabled] =
    useState(false);

  const [alertThreshold, setAlertThreshold] =
    useState(60);

  const [notificationStatus, setNotificationStatus] =
    useState("default");

  const [alertMessage, setAlertMessage] =
    useState("");

  const lastRequest = useRef(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(
          "atmos-weather-alerts"
        ) || "null"
      );

      if (saved) {
        setAlertsEnabled(Boolean(saved.enabled));
        setAlertThreshold(
          Number(saved.threshold) || 60
        );
      }
    } catch {}

    if (
      typeof Notification !== "undefined"
    ) {
      setNotificationStatus(
        Notification.permission
      );
    }
  }, []);

  const saveAlertSettings = (
    enabled = alertsEnabled,
    threshold = alertThreshold
  ) => {
    try {
      localStorage.setItem(
        "atmos-weather-alerts",
        JSON.stringify({
          enabled,
          threshold,
        })
      );

      setAlertsEnabled(enabled);
      setAlertThreshold(threshold);
    } catch {}
  };

  const enableAlerts = async () => {
    if (
      typeof Notification === "undefined"
    ) {
      setAlertMessage(
        "This browser does not support notifications."
      );
      return;
    }

    try {
      const permission =
        await Notification.requestPermission();

      setNotificationStatus(permission);

      if (permission === "granted") {
        saveAlertSettings(
          true,
          alertThreshold
        );

        setAlertMessage(
          "Weather alerts enabled on this device."
        );

        new Notification(
          "Atmos Weather Alerts",
          {
            body: `Rain alerts are active for ${selectedCity.name}.`,
            icon: "/favicon.ico",
          }
        );
      } else {
        saveAlertSettings(
          false,
          alertThreshold
        );

        setAlertMessage(
          "Notification permission was not granted."
        );
      }
    } catch {
      setAlertMessage(
        "Unable to enable browser notifications."
      );
    }
  };

  const disableAlerts = () => {
    saveAlertSettings(
      false,
      alertThreshold
    );

    setAlertMessage(
      "Weather alerts turned off."
    );
  };

  const checkRainAlert = (
    prediction,
    location
  ) => {
    if (
      !prediction?.prediction ||
      !alertsEnabled ||
      notificationStatus !== "granted"
    ) {
      return;
    }

    const probability = Number(
      prediction.prediction.rain_probability ?? 0
    );

    if (
      probability <
      Number(alertThreshold)
    ) {
      return;
    }

    const predictionDate =
      prediction.prediction_date ||
      "tomorrow";

    const key =
      `atmos-alert-${location.latitude}-` +
      `${location.longitude}-${predictionDate}-` +
      `${alertThreshold}`;

    try {
      if (localStorage.getItem(key)) {
        return;
      }
    } catch {}

    try {
      new Notification(
        `Rain Alert · ${location.name}`,
        {
          body:
            `Rain probability tomorrow is ` +
            `${Math.round(probability)}%, ` +
            `above your ${alertThreshold}% alert threshold.`,
          icon: "/favicon.ico",
          tag: "atmos-rain-alert",
        }
      );

      try {
        localStorage.setItem(key, "1");
      } catch {}

      setAlertMessage(
        `Rain alert sent for ${location.name}.`
      );
    } catch {}
  };

  async function loadWeather(
    location = selectedCity
  ) {
    const requestId =
      ++lastRequest.current;

    setLoading(true);
    setError("");
    setMlError("");
    setHistoryError("");

    setMlLoading(true);
    setHistoryLoading(true);

    setMlPrediction(null);
    setHistory([]);

    setSelectedDay(0);
    setSelectedHistoryPoint(null);

    try {
      const weatherData =
        await getWeather(
          location.latitude,
          location.longitude
        );

      if (
        requestId !==
        lastRequest.current
      ) {
        return;
      }

      setWeather(weatherData);
      setLastUpdated(new Date());

      getMLRainPrediction(
        location.latitude,
        location.longitude
      )
        .then((data) => {
          if (
            requestId !==
            lastRequest.current
          ) {
            return;
          }

          setMlPrediction(data);

          checkRainAlert(
            data,
            location
          );
        })
        .catch((err) => {
          if (
            requestId ===
            lastRequest.current
          ) {
            setMlError(
              err?.message ||
                "ML prediction unavailable."
            );
          }
        })
        .finally(() => {
          if (
            requestId ===
            lastRequest.current
          ) {
            setMlLoading(false);
          }
        });

      getHistoricalWeather(
        location.latitude,
        location.longitude,
        60
      )
        .then((data) => {
          if (
            requestId !==
            lastRequest.current
          ) {
            return;
          }

          setHistory(
            data?.data || []
          );
        })
        .catch((err) => {
          if (
            requestId ===
            lastRequest.current
          ) {
            setHistoryError(
              err?.message ||
                "Historical weather unavailable."
            );
          }
        })
        .finally(() => {
          if (
            requestId ===
            lastRequest.current
          ) {
            setHistoryLoading(false);
          }
        });
    } catch (err) {
      if (
        requestId ===
        lastRequest.current
      ) {
        setError(
          err?.message ||
            "Unable to load weather information."
        );

        setMlLoading(false);
        setHistoryLoading(false);
      }
    } finally {
      if (
        requestId ===
        lastRequest.current
      ) {
        setLoading(false);
      }
    }
  }

  /*
   * Startup location:
   * no permission popup is ever forced. The app
   * silently opens on the current location only when
   * access was already granted, otherwise it opens on
   * the default city and offers a one tap prompt.
   */
  useEffect(() => {
    const canDetect =
      typeof navigator !==
        "undefined" &&
      Boolean(navigator.geolocation);

    const canQueryPermission =
      typeof navigator !== "undefined" &&
      Boolean(
        navigator.permissions?.query
      );

    if (!canDetect || !canQueryPermission) {
      loadWeather(DEFAULT_CITY);
      return;
    }

    let cancelled = false;

    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled) {
          return;
        }

        if (status.state === "granted") {
          detectLocation();
          return;
        }

        loadWeather(DEFAULT_CITY);

        if (status.state === "prompt") {
          setLocationPrompt(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          loadWeather(DEFAULT_CITY);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Debounced geocoding search.
   *
   * searchRequestRef makes every request carry an id.
   * A response is only applied when it is still the
   * newest one, so a slow earlier request can never
   * overwrite the results of a later keystroke.
   */
  useEffect(() => {
    const value = city.trim();

    if (value.length < 2) {
      // Invalidate any request still in flight.
      searchRequestRef.current += 1;
      setSuggestions([]);
      setSearchLoading(false);
      setActiveIndex(-1);
      setSearchedQuery("");
      return;
    }

    const requestId =
      searchRequestRef.current + 1;

    searchRequestRef.current = requestId;

    const timer = setTimeout(
      async () => {
        try {
          setSearchLoading(true);

          const results = await searchCity(
            value
          );

          if (
            searchRequestRef.current !==
            requestId
          ) {
            return;
          }

          setSuggestions(
            rankSearchResults(
              results,
              value
            )
          );
        } catch {
          if (
            searchRequestRef.current ===
            requestId
          ) {
            setSuggestions([]);
          }
        } finally {
          if (
            searchRequestRef.current ===
            requestId
          ) {
            setSearchLoading(false);
            setSearchedQuery(value);
          }
        }
      },
      300
    );

    return () =>
      clearTimeout(timer);
  }, [city]);

  /*
   * Recommended cities are resolved from the geocoding
   * API once and then cached for the session, so opening
   * the empty dropdown is instant and costs nothing extra.
   */
  useEffect(() => {
    let cancelled = false;

    loadRecommendedCities().then(
      (list) => {
        if (!cancelled) {
          setRecommendedCities(list);
        }
      }
    ).finally(() => {
      if (!cancelled) {
        setRecommendationsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Safety net in case the list has not been asked for
   * yet. loadRecommendedCities caches its promise, so
   * this never issues a second round of requests.
   */
  function ensureRecommendedCities() {
    if (
      recommendedCities.length > 0 ||
      !recommendationsLoading
    ) {
      return;
    }

    loadRecommendedCities().then(
      (list) =>
        setRecommendedCities(list)
    );
  }

  /*
   * Close the dropdown on a click or tap anywhere
   * outside the search box.
   */
  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const handlePointerDown = (
      event
    ) => {
      const node = searchBoxRef.current;

      if (
        node &&
        !node.contains(event.target)
      ) {
        setSearchOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener(
      "mousedown",
      handlePointerDown
    );

    document.addEventListener(
      "touchstart",
      handlePointerDown,
      { passive: true }
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown
      );

      document.removeEventListener(
        "touchstart",
        handlePointerDown
      );
    };
  }, [searchOpen]);

  /*
   * The rows shown in the panel, either the typed
   * results or the recommended cities.
   */
  const trimmedCity = city.trim();
  const showingRecommendations =
    trimmedCity.length < 2;

  const visiblePlaces = useMemo(() => {
    if (showingRecommendations) {
      return recommendedCities;
    }

    return suggestions;
  }, [
    showingRecommendations,
    suggestions,
    recommendedCities,
  ]);

  /*
   * The panel opens on focus for recommendations, and
   * while typing it shows a spinner, then either the
   * results or the empty state. It stays hidden until a
   * search for the current query has actually finished,
   * so the empty state never flashes during the debounce.
   */
  const showPanel =
    searchOpen &&
    (showingRecommendations
      ? recommendationsLoading ||
        recommendedCities.length > 0
      : searchLoading ||
        suggestions.length > 0 ||
        searchedQuery === trimmedCity);

  function closeSearchPanel() {
    setSearchOpen(false);
    setActiveIndex(-1);
  }

  function handleSearchKeyDown(
    event
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearchPanel();
      return;
    }

    if (
      !searchOpen ||
      !visiblePlaces.length
    ) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setActiveIndex(
        (current) =>
          (current + 1) %
          visiblePlaces.length
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setActiveIndex(
        (current) =>
          (current <= 0
            ? visiblePlaces.length
            : current) - 1
      );
      return;
    }

    if (event.key === "Enter") {
      /*
       * Only an explicitly highlighted row is taken
       * here. With nothing highlighted the event falls
       * through to the form, which searches and picks
       * the best match.
       */
      if (
        activeIndex < 0 ||
        activeIndex >= visiblePlaces.length
      ) {
        return;
      }

      const chosen = visiblePlaces[activeIndex];

      if (chosen) {
        event.preventDefault();
        selectCity(chosen);
      }
    }
  }

  /*
   * Keep the keyboard highlighted row inside the
   * scrolling panel.
   */
  useEffect(() => {
    if (
      activeIndex >= 0 &&
      activeRowRef.current
    ) {
      activeRowRef.current.scrollIntoView(
        {
          block: "nearest",
        }
      );
    }
  }, [activeIndex]);

  async function selectCity(result) {
    const location = {
      name:
        result.name || "Unknown",

      latitude:
        result.latitude,

      longitude:
        result.longitude,

      country: result.country || "",

      admin1:
        result.admin1 || "",
    };

    setSelectedCity(location);
    setCity("");
    setSuggestions([]);
    setLocationNotice("");
    setLocationPrompt(false);
    closeSearchPanel();

    await loadWeather(location);
  }

  async function handleSearch(event) {
    event.preventDefault();

    const value = city.trim();

    if (!value) {
      setSearchOpen(true);
      return;
    }

    try {
      setSearchLoading(true);

      const results = await searchCity(
        value
      );

      const ranked = rankSearchResults(
        results,
        value
      );

      if (!ranked.length) {
        setError(
          "Location not found. Try another city."
        );

        closeSearchPanel();
        return;
      }

      await selectCity(ranked[0]);
    } catch (err) {
      setError(
        err?.message ||
          "Unable to search location."
      );
    } finally {
      setSearchLoading(false);
    }
  }


  /*
   * Location resolution chain:
   * 1. browser geolocation (high accuracy)
   * 2. browser geolocation (low accuracy retry)
   * 3. IP based approximate location
   *
   * Detection and loading are kept separate so a
   * weather API failure never gets reported as a
   * location failure.
   */
  async function detectLocation({
    allowIpFallback = true,
  } = {}) {
    setLocationLoading(true);
    setError("");
    setLocationNotice("");
    setLocationPrompt(false);

    let reason = "";
    let detected = null;

    try {
      const position =
        await detectBrowserPosition();

      detected =
        await resolveLocation(
          position.coords.latitude,
          position.coords.longitude
        );
    } catch (err) {
      reason =
        GEOLOCATION_MESSAGES[
          err?.code
        ] || "";
    }

    if (
      !detected &&
      allowIpFallback
    ) {
      try {
        detected =
          await detectIpLocation();
      } catch {}
    }

    if (!detected) {
      setError(
        reason ||
          "Could not detect your location. Search for a city instead."
      );

      setLocationLoading(false);

      return false;
    }

    setSelectedCity(detected);

    setLocationNotice(
      detected.approximate
        ? "Using an approximate location based on your network, because precise location was unavailable."
        : ""
    );

    setLocationLoading(false);

    await loadWeather(detected);

    return true;
  }

  function useMyLocation() {
    detectLocation();
  }

  const current =
    weather?.current;

  const temperature = Number(
    current?.temperature_2m ?? 25
  );

  const theme =
    getTheme(temperature);

  const currentWeather =
    useMemo(
      () =>
        current
          ? {
              ...current,
              ...getWeatherInfo(
                current.weather_code
              ),
            }
          : null,
      [current]
    );

  const hourlyForecast =
    useMemo(() => {
      if (!weather?.hourly) {
        return [];
      }

      const now =
        new Date();

      return weather.hourly.time
        .map((time, index) => ({
          time,

          temperature:
            weather.hourly
              .temperature_2m?.[
              index
            ],

          precipitation:
            weather.hourly
              .precipitation_probability?.[
              index
            ],

          weatherCode:
            weather.hourly
              .weather_code?.[
              index
            ],

          humidity:
            weather.hourly
              .relative_humidity_2m?.[
              index
            ],

          wind:
            weather.hourly
              .wind_speed_10m?.[
              index
            ],
        }))
        .filter(
          (item) =>
            new Date(item.time) >=
            now
        )
        .slice(0, 12);
    }, [weather]);

  const dailyForecast =
    useMemo(() => {
      if (!weather?.daily) {
        return [];
      }

      return weather.daily.time.map(
        (date, index) => ({
          date,

          weatherCode:
            weather.daily
              .weather_code?.[
              index
            ],

          max:
            weather.daily
              .temperature_2m_max?.[
              index
            ],

          min:
            weather.daily
              .temperature_2m_min?.[
              index
            ],

          rain:
            weather.daily
              .precipitation_probability_max?.[
              index
            ],

          precipitation:
            weather.daily
              .precipitation_sum?.[
              index
            ],

          wind:
            weather.daily
              .wind_speed_10m_max?.[
              index
            ],

          sunrise:
            weather.daily
              .sunrise?.[
              index
            ],

          sunset:
            weather.daily
              .sunset?.[
              index
            ],
        })
      );
    }, [weather]);

  const graphData =
    useMemo(
      () =>
        (history || []).map(
          (item) => ({
            date:
              item.date,

            temperature:
              Number(
                item.temp_mean ??
                  0
              ),

            humidity:
              Number(
                item.humidity_mean ??
                  0
              ),

            rain:
              Number(
                item.rain_sum ??
                  0
              ),
          })
        ),
      [history]
    );

  const graphMaxTemp =
    useMemo(() => {
      if (!graphData.length) {
        return 40;
      }

      return Math.max(
        40,
        Math.ceil(
          Math.max(
            ...graphData.map(
              (item) =>
                item.temperature
            )
          ) / 5
        ) * 5
      );
    }, [graphData]);

  const rainProbability = toNumber(
    mlPrediction?.prediction
      ?.rain_probability,
    0
  );

  const noRainProbability = toNumber(
    mlPrediction?.prediction
      ?.no_rain_probability,
    0
  );

  const isRain =
    mlPrediction?.prediction
      ?.prediction === "rain";

  const selectedForecast =
    dailyForecast[selectedDay];

  if (
    loading &&
    !weather
  ) {
    return <LoadingScreen />;
  }

  return (
    <main
      className="min-h-screen overflow-x-hidden text-white transition-colors duration-700"
      style={{
        background:
          `radial-gradient(circle at 10% 0%, ${theme.glow}, transparent 32%), ` +
          `radial-gradient(circle at 90% 80%, ${theme.glow}, transparent 30%), ` +
          theme.secondary,
      }}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-40 -top-40 h-105 w-105 rounded-full blur-[110px]"
          style={{
            background: theme.accent,
            opacity: 0.08,
          }}
          animate={{
            x: [0, 90, -40, 0],
            y: [0, 60, -30, 0],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <motion.div
          className="absolute -right-40 top-[35%] h-105 w-105 rounded-full blur-[120px]"
          style={{
            background: theme.accent,
            opacity: 0.06,
          }}
          animate={{
            x: [0, -70, 30, 0],
            y: [0, -40, 60, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <div
          className="absolute inset-0 opacity-2.5"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)",
            backgroundSize:
              "48px 48px",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-375 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">

        {/* HEADER */}

        <header className="mb-5 flex items-center justify-between sm:mb-8">
          <div className="flex items-center gap-3">
            <motion.div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-11 sm:w-11"
              style={{
                background:
                  theme.accent,
              }}
              animate={{
                boxShadow: [
                  `0 0 18px ${theme.glow}`,
                  `0 0 38px ${theme.glow}`,
                  `0 0 18px ${theme.glow}`,
                ],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
              }}
            >
              <CloudRain size={21} />
            </motion.div>

            <div>
              <h1 className="text-lg font-black tracking-[.16em] sm:text-xl">
                ATMOS
              </h1>

              <p
                className="text-[9px] uppercase tracking-[.22em]"
                style={{
                  color:
                    `${theme.accent}99`,
                }}
              >
                {theme.description}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-[10px] text-white/40 sm:flex">
            <span
              className="h-2 w-2 animate-pulse rounded-full"
              style={{
                background:
                  theme.accent,
              }}
            />

            LIVE ATMOSPHERE
          </div>
        </header>

        {/* SEARCH */}

        <section className="mx-auto mb-5 max-w-4xl sm:mb-7">
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <div
              className="relative min-w-0 flex-1"
              ref={searchBoxRef}
            >
              <div className="relative flex min-h-12 items-center rounded-2xl border border-white/10 bg-white/5.5 backdrop-blur-xl">
                <Search
                  className="ml-4 shrink-0 text-white/35"
                  size={19}
                />

                <input
                  value={city}
                  onChange={(event) => {
                    setCity(
                      event.target.value
                    );
                    setActiveIndex(-1);
                    setSearchOpen(true);
                  }}
                  onFocus={() => {
                    setSearchOpen(true);
                    ensureRecommendedCities();
                  }}
                  /*
                   * Clicking an input that already has
                   * focus fires no focus event, so after
                   * Escape closed the panel a click would
                   * otherwise do nothing.
                   */
                  onClick={() => {
                    setSearchOpen(true);
                    ensureRecommendedCities();
                  }}
                  onKeyDown={
                    handleSearchKeyDown
                  }
                  role="combobox"
                  aria-expanded={showPanel}
                  aria-controls={
                    showPanel
                      ? "atmos-search-results"
                      : undefined
                  }
                  aria-autocomplete="list"
                  aria-activedescendant={
                    activeIndex >= 0
                      ? `atmos-search-option-${activeIndex}`
                      : undefined
                  }
                  placeholder="Search any city..."
                  className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-sm outline-none placeholder:text-white/30"
                />

                {city && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setCity("");
                      setSuggestions([]);
                      setActiveIndex(-1);
                      setSearchedQuery("");
                      setSearchOpen(true);
                    }}
                    className="mr-1 flex h-10 w-10 items-center justify-center text-white/35"
                  >
                    <X size={17} />
                  </button>
                )}

                {searchLoading && (
                  <Loader2
                    size={17}
                    className="mr-3 animate-spin"
                    style={{
                      color:
                        theme.accent,
                    }}
                  />
                )}

                <button
                  type="submit"
                  className="mr-1.5 min-h-10 rounded-xl px-4 text-sm font-bold active:scale-95"
                  style={{
                    background:
                      theme.accent,
                  }}
                >
                  Search
                </button>
              </div>

              <AnimatePresence>
                {showPanel && (
                  <motion.div
                    id="atmos-search-results"
                    role="listbox"
                    aria-label="City search results"
                    initial={{
                      opacity: 0,
                      y: -5,
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                    }}
                    exit={{
                      opacity: 0,
                    }}
                    transition={{
                      duration: 0.16,
                    }}
                    className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#24153b]/95 shadow-2xl backdrop-blur-xl"
                  >
                    {showingRecommendations &&
                    !recommendationsLoading ? (
                      <p className="border-b border-white/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[.18em] text-white/35">
                        Popular in India
                      </p>
                    ) : null}

                    {searchLoading ||
                    (showingRecommendations &&
                      recommendationsLoading) ? (
                      <div className="flex min-h-16 items-center justify-center gap-2 text-sm text-white/45">
                        <Loader2
                          size={15}
                          className="animate-spin"
                          style={{
                            color:
                              theme.accent,
                          }}
                        />
                        {showingRecommendations
                          ? "Finding popular cities..."
                          : "Searching..."}
                      </div>
                    ) : visiblePlaces.length ? (
                      <div className="max-h-[min(22rem,55vh)] overflow-y-auto overscroll-contain">
                        {visiblePlaces.map(
                          (
                            result,
                            index
                          ) => {
                            const isActive =
                              index ===
                              activeIndex;

                            return (
                              <button
                                key={`${result.name}-${result.latitude}-${result.longitude}`}
                                id={`atmos-search-option-${index}`}
                                role="option"
                                aria-selected={
                                  isActive
                                }
                                type="button"
                                ref={
                                  isActive
                                    ? activeRowRef
                                    : null
                                }
                                onMouseEnter={() =>
                                  setActiveIndex(
                                    index
                                  )
                                }
                                onClick={() =>
                                  selectCity(
                                    result
                                  )
                                }
                                className={`flex min-h-14 w-full items-center gap-3 px-4 text-left transition-colors ${
                                  isActive
                                    ? "bg-white/10"
                                    : "active:bg-white/10"
                                }`}
                              >
                                <MapPin
                                  size={17}
                                  className="shrink-0"
                                  style={{
                                    color:
                                      isActive
                                        ? theme.accent
                                        : undefined,
                                    opacity:
                                      isActive
                                        ? 1
                                        : 0.5,
                                  }}
                                />

                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">
                                    {result.name}
                                  </p>

                                  <p className="truncate text-[11px] text-white/35">
                                    {result.admin1
                                      ? `${result.admin1}, `
                                      : ""}
                                    {result.country}
                                  </p>
                                </div>
                              </button>
                            );
                          }
                        )}
                      </div>
                    ) : (
                      <div className="min-h-16 px-4 py-5 text-center text-sm text-white/45">
                        No cities found
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={
                useMyLocation
              }
              disabled={
                locationLoading
              }
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5.5 px-5 text-sm font-semibold backdrop-blur-xl active:scale-[.98] disabled:opacity-60"
            >
              <LocateFixed
                size={17}
                className={
                  locationLoading
                    ? "animate-spin"
                    : ""
                }
                style={{
                  color:
                    theme.accent,
                }}
              />

              {locationLoading
                ? "Detecting..."
                : "Use My Location"}
            </button>
          </form>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">
              <AlertTriangle
                size={15}
                className="mt-0.5 shrink-0"
              />

              {error}
            </div>
          )}

          {locationNotice && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-400/20 bg-sky-400/10 p-3 text-xs text-sky-100">
              <LocateFixed
                size={15}
                className="mt-0.5 shrink-0"
              />

              {locationNotice}
            </div>
          )}

          {locationPrompt && (
            <div
              className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs"
              style={{
                borderColor:
                  `${theme.accent}33`,

                background:
                  `${theme.accent}12`,
              }}
            >
              <span className="flex items-center gap-2 text-white/60">
                <LocateFixed
                  size={14}
                  style={{
                    color:
                      theme.accent,
                  }}
                />

                Start Atmos from where you are?
              </span>

              <button
                type="button"
                onClick={() =>
                  detectLocation()
                }
                disabled={
                  locationLoading
                }
                className="min-h-8 rounded-lg px-3 text-[11px] font-bold text-white active:scale-95 disabled:opacity-60"
                style={{
                  background:
                    theme.accent,
                }}
              >
                {locationLoading
                  ? "Detecting..."
                  : "Use my location"}
              </button>
            </div>
          )}
        </section>

        {/* HERO: CURRENT TEMPERATURE + AI RAIN PREDICTION */}

        <motion.section
          initial={{
            opacity: 0,
            y: 18,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.5,
            ease: "easeOut",
          }}
          className="mb-4 grid grid-cols-1 gap-4 sm:mb-5 lg:grid-cols-2"
        >
          {/* LEFT: CURRENT TEMPERATURE */}

          <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/4.5 p-5 backdrop-blur-xl sm:p-7">
            <div
              className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full blur-3xl"
              style={{
                background:
                  theme.accent,
                opacity: 0.18,
              }}
            />

            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] sm:text-xs sm:tracking-[.18em]"
                  style={{
                    color:
                      theme.accent,
                  }}
                >
                  <MapPin size={14} />
                  Current Temperature
                </div>

                <h2 className="truncate text-xl font-black sm:text-3xl">
                  {selectedCity.name}
                </h2>

                <p className="mt-1 truncate text-[11px] text-white/35 sm:text-xs">
                  {selectedCity.admin1
                    ? `${selectedCity.admin1}, `
                    : ""}
                  {selectedCity.country} ·{" "}
                  {toNumber(
                    selectedCity.latitude
                  ).toFixed(3)}
                  ,{" "}
                  {toNumber(
                    selectedCity.longitude
                  ).toFixed(3)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <UnitToggle
                  unit={unit}
                  onChange={
                    setUnit
                  }
                  accent={
                    theme.accent
                  }
                />

                <button
                  onClick={() =>
                    loadWeather(
                      selectedCity
                    )
                  }
                  className="flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-white/60 active:scale-95"
                >
                  <RefreshCw
                    size={14}
                    className={
                      loading
                        ? "animate-spin"
                        : ""
                    }
                  />

                  <span className="hidden sm:inline">
                    Refresh
                  </span>
                </button>
              </div>
            </div>

            <div className="relative mt-5 sm:mt-7">
              <div className="flex items-start">
                <AnimatedTemperature
                  value={convertTemperature(
                    current?.temperature_2m,
                    unit
                  )}
                  className="text-6xl leading-[.9] sm:text-7xl md:text-8xl lg:text-9xl"
                  glow={theme.glow}
                />

                <span className="mt-1 text-2xl font-bold text-white/40 sm:mt-2 sm:text-3xl lg:text-4xl">
                  {unitSymbol}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mt-5">
                <span className="flex items-center gap-2 text-sm font-bold text-white/80 sm:text-base">
                  <CurrentIcon
                    info={
                      currentWeather
                    }
                    size={18}
                    color={
                      theme.accent
                    }
                  />

                  {currentWeather?.label ||
                    "Reading atmosphere..."}
                </span>

                <span className="text-white/20">
                  ·
                </span>

                <span className="text-xs text-white/40 sm:text-sm">
                  Feels like{" "}
                  {round(
                    convertTemperature(
                      current?.apparent_temperature,
                      unit
                    )
                  )}
                  {unitSymbol}
                </span>
              </div>
            </div>

            {lastUpdated && (
              <p className="relative mt-4 text-[10px] text-white/25 sm:mt-6">
                Updated{" "}
                {lastUpdated.toLocaleTimeString(
                  [],
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
              </p>
            )}
          </div>

          {/* RIGHT: AI RAIN PREDICTION */}

          <RainPredictionCard
            mlLoading={mlLoading}
            mlError={mlError}
            mlPrediction={
              mlPrediction
            }
            theme={theme}
            selectedCity={
              selectedCity
            }
          />
        </motion.section>

        {/* CURRENT DETAILS + BROWSER ALERTS */}

        <section className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_.6fr]">
          <section className="rounded-3xl border border-white/10 bg-white/2.5 p-4 sm:p-6">
            <SectionHeader
              icon={Gauge}
              title="Current Details"
              subtitle="Live conditions at this location"
              accent={
                theme.accent
              }
            />

            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3">
              <StatCard
                icon={Droplets}
                title="Humidity"
                value={`${round(
                  current?.relative_humidity_2m
                )}%`}
                accent={
                  theme.accent
                }
              />

              <StatCard
                icon={Wind}
                title="Wind"
                value={`${round(
                  current?.wind_speed_10m
                )} km/h`}
                accent={
                  theme.accent
                }
              />

              <StatCard
                icon={Gauge}
                title="Pressure"
                value={`${round(
                  current?.pressure_msl
                )} hPa`}
                accent={
                  theme.accent
                }
              />

              <StatCard
                icon={Cloud}
                title="Cloud Cover"
                value={`${round(
                  current?.cloud_cover
                )}%`}
                accent={
                  theme.accent
                }
              />
            </div>
          </section>

          <BrowserAlertCard
            enabled={
              alertsEnabled
            }
            threshold={
              alertThreshold
            }
            permission={
              notificationStatus
            }
            message={
              alertMessage
            }
            onEnable={
              enableAlerts
            }
            onDisable={
              disableAlerts
            }
            onThreshold={(value) => {
              setAlertThreshold(
                value
              );

              saveAlertSettings(
                alertsEnabled,
                value
              );
            }}
            theme={theme}
            rainProbability={
              rainProbability
            }
          />
        </section>

        {/* HOURLY */}

        <section className="mb-5 rounded-3xl border border-white/10 bg-white/2.5 p-4 sm:p-6">
          <SectionHeader
            icon={Activity}
            title="Next 12 Hours"
            subtitle="Temperature and precipitation probability"
            accent={
              theme.accent
            }
          />

          <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-2">
            {hourlyForecast.map(
              (item, index) => {
                const info =
                  getWeatherInfo(
                    item.weatherCode
                  );

                return (
                  <button
                    key={`${item.time}-${index}`}
                    type="button"
                    className="w-26.25 shrink-0 snap-start rounded-2xl border border-white/10 bg-white/[.035] p-3 text-center active:scale-95 sm:w-30"
                  >
                    <p className="text-[10px] text-white/35">
                      {index === 0
                        ? "Now"
                        : formatHour(
                            item.time
                          )}
                    </p>

                    <WeatherIcon
                      icon={info.icon}
                      size={24}
                      className="mx-auto my-3"
                      color={
                        theme.accent
                      }
                    />

                    <p className="text-lg font-black">
                      {round(
                        item.temperature
                      )}
                      °
                    </p>

                    <p className="mt-1 text-[10px] text-white/35">
                      Rain{" "}
                      {round(
                        item.precipitation
                      )}
                      %
                    </p>
                  </button>
                );
              }
            )}
          </div>
        </section>

        {/* 7 DAY */}

        <section className="mb-5 rounded-3xl border border-white/10 bg-white/2.5 p-4 sm:p-6">
          <SectionHeader
            icon={CalendarDays}
            title="7-Day Forecast"
            subtitle="Select a day for detailed conditions"
            accent={
              theme.accent
            }
          />

          <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-2">
            {dailyForecast.map(
              (day, index) => {
                const info =
                  getWeatherInfo(
                    day.weatherCode
                  );

                const active =
                  index ===
                  selectedDay;

                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() =>
                      setSelectedDay(
                        index
                      )
                    }
                    className="min-w-29.5 shrink-0 snap-start rounded-2xl border p-3 text-left transition active:scale-95"
                    style={{
                      borderColor: active
                        ? `${theme.accent}70`
                        : "rgba(255,255,255,.08)",

                      background: active
                        ? `${theme.accent}10`
                        : "rgba(255,255,255,.025)",
                    }}
                  >
                    <p className="text-xs font-bold">
                      {formatDay(
                        day.date,
                        index
                      )}
                    </p>

                    <p className="mt-1 text-[10px] text-white/30">
                      {formatDate(
                        day.date
                      )}
                    </p>

                    <WeatherIcon
                      icon={info.icon}
                      size={25}
                      className="my-3"
                      color={
                        theme.accent
                      }
                    />

                    <p className="font-black">
                      {round(day.max)}°
                      <span className="text-white/30">
                        {" "}
                        /{" "}
                        {round(day.min)}°
                      </span>
                    </p>

                    <p className="mt-1 text-[10px] text-white/35">
                      Rain{" "}
                      {round(day.rain)}
                      %
                    </p>
                  </button>
                );
              }
            )}
          </div>

          {selectedForecast && (
            <AnimatePresence mode="wait">
              <motion.div
                key={
                  selectedForecast.date
                }
                initial={{
                  opacity: 0,
                  y: 8,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                className="mt-5 grid gap-4 rounded-2xl border border-white/10 bg-black/10 p-4 sm:grid-cols-2 lg:grid-cols-5 sm:p-5"
              >
                <Detail
                  label="High / Low"
                  value={`${round(
                    selectedForecast.max
                  )}° / ${round(
                    selectedForecast.min
                  )}°`}
                />

                <Detail
                  label="Rain"
                  value={`${round(
                    selectedForecast.rain
                  )}%`}
                />

                <Detail
                  label="Precipitation"
                  value={`${selectedForecast.precipitation ?? 0} mm`}
                />

                <Detail
                  label="Sunrise"
                  value={
                    selectedForecast.sunrise
                      ? new Date(
                          selectedForecast.sunrise
                        ).toLocaleTimeString(
                          [],
                          {
                            hour: "2-digit",
                            minute:
                              "2-digit",
                          }
                        )
                      : "--"
                  }
                />

                <Detail
                  label="Sunset"
                  value={
                    selectedForecast.sunset
                      ? new Date(
                          selectedForecast.sunset
                        ).toLocaleTimeString(
                          [],
                          {
                            hour: "2-digit",
                            minute:
                              "2-digit",
                          }
                        )
                      : "--"
                  }
                />
              </motion.div>
            </AnimatePresence>
          )}
        </section>

        {/* HISTORY */}

        <section className="mb-5 rounded-3xl border border-white/10 bg-white/2.5 p-4 sm:p-6">
          <SectionHeader
            icon={TrendingUp}
            title="60-Day Weather Pattern"
            subtitle="Historical daily average temperature"
            accent={
              theme.accent
            }
          />

          {historyLoading ? (
            <div className="flex h-56 items-center justify-center text-sm text-white/35">
              <Loader2
                className="mr-2 animate-spin"
                size={18}
              />

              Loading history...
            </div>
          ) : historyError ? (
            <div className="mt-5 rounded-xl bg-red-400/10 p-4 text-xs text-red-200">
              {historyError}
            </div>
          ) : graphData.length ? (
            <InteractiveChart
              data={graphData}
              maxTemp={
                graphMaxTemp
              }
              accent={
                theme.accent
              }
              selectedPoint={
                selectedHistoryPoint
              }
              onSelect={
                setSelectedHistoryPoint
              }
            />
          ) : (
            <p className="mt-5 text-sm text-white/35">
              No historical data available.
            </p>
          )}

          {selectedHistoryPoint && (
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/50">
              <span>
                {formatDate(
                  selectedHistoryPoint.date
                )}
              </span>

              <span>
                Temp{" "}
                {round(
                  selectedHistoryPoint.temperature
                )}
                °C
              </span>

              <span>
                Humidity{" "}
                {round(
                  selectedHistoryPoint.humidity
                )}
                %
              </span>

              <span>
                Rain{" "}
                {Number(
                  selectedHistoryPoint.rain
                ).toFixed(1)}{" "}
                mm
              </span>
            </div>
          )}
        </section>

        {/* ATMOS INSIGHT */}

        <section
          className="mb-5 overflow-hidden rounded-3xl border p-5 sm:p-7"
          style={{
            borderColor:
              `${theme.accent}20`,
            background:
              `linear-gradient(100deg, ${theme.glow}, rgba(255,255,255,.025))`,
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
              style={{
                background:
                  `${theme.accent}15`,
              }}
            >
              <Sparkles
                size={22}
                style={{
                  color:
                    theme.accent,
                }}
              />
            </div>

            <div className="flex-1">
              <p
                className="mb-1 text-xs font-bold uppercase tracking-[.2em]"
                style={{
                  color:
                    theme.accent,
                }}
              >
                Atmos Insight
              </p>

              <p className="text-sm leading-relaxed text-white/60">
                {mlPrediction ? (
                  isRain ? (
                    <>
                      Atmos AI detects a{" "}
                      {round(
                        rainProbability
                      )}
                      % probability of
                      rain for{" "}
                      {
                        selectedCity.name
                      }{" "}
                      tomorrow.
                    </>
                  ) : (
                    <>
                      Atmos AI estimates a{" "}
                      {round(
                        noRainProbability
                      )}
                      % probability of
                      no rain for{" "}
                      {
                        selectedCity.name
                      }{" "}
                      tomorrow.
                    </>
                  )
                ) : (
                  "Atmos combines live weather data, historical observations and machine learning to understand the atmosphere around you."
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-white/35">
              <ShieldCheck
                size={16}
                className="text-emerald-400"
              />

              AI Assisted
            </div>
          </div>
        </section>

        {/* FOOTER */}

        <footer className="flex flex-col items-center justify-between gap-2 py-7 text-[10px] text-white/25 sm:flex-row">
          <p className="text-center sm:text-left">
            © 2026 Atmos — Weather
            Intelligence · Built by Krishna
            Gupta. All Rights Reserved.
          </p>

          <p>
            Real-time data · ML rain analysis · Browser alerts
          </p>
        </footer>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#1E1033] px-5 text-white">
      <div className="text-center">
        <motion.div
          animate={{
            rotate: 360,
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "linear",
          }}
          className="mb-5 inline-flex"
        >
          <RefreshCw
            size={40}
            color={ACCENT}
          />
        </motion.div>

        <h1 className="text-3xl font-black tracking-[.2em]">
          ATMOS
        </h1>

        <p className="mt-2 text-sm text-white/35">
          Reading the atmosphere...
        </p>
      </div>
    </main>
  );
}

function CurrentIcon({
  info,
  size,
  color,
  className = "",
}) {
  return (
    <WeatherIcon
      icon={
        info?.icon || Cloud
      }
      size={size}
      color={color}
      className={
        className
      }
    />
  );
}

function WeatherIcon({
  icon: Icon,
  size,
  color,
  className = "",
}) {
  return (
    <Icon
      size={size}
      className={className}
      style={{
        color,
      }}
    />
  );
}

/* =====================================================
   ANIMATED TEMPERATURE
   ===================================================== */

function AnimatedTemperature({
  value,
  className = "",
  glow = "rgba(255,70,150,.28)",
  duration = 1200,
}) {
  /*
   * The real API value.
   * null / undefined / non numeric input is
   * treated as "no data": nothing is animated
   * and nothing is faked.
   */

  const target =
    value === null ||
    value === undefined ||
    value === ""
      ? null
      : toNumber(value, null);

  const [
    displayValue,
    setDisplayValue,
  ] = useState(0);

  const previousRef = useRef(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (
      frameRef.current !== null
    ) {
      cancelAnimationFrame(
        frameRef.current
      );

      frameRef.current = null;
    }

    if (target === null) {
      previousRef.current = 0;
      setDisplayValue(0);
      return;
    }

    const from =
      previousRef.current ?? 0;

    const difference = target - from;

    if (difference === 0) {
      setDisplayValue(target);
      return;
    }

    const startedAt = performance.now();

    const step = (now) => {
      const progress = Math.min(
        (now - startedAt) / duration,
        1
      );

      const eased =
        1 - Math.pow(1 - progress, 3);

      if (progress >= 1) {
        /* Land exactly on the API value. */
        setDisplayValue(target);
        previousRef.current = target;
        frameRef.current = null;
        return;
      }

      setDisplayValue(
        from + difference * eased
      );

      frameRef.current =
        requestAnimationFrame(step);
    };

    frameRef.current =
      requestAnimationFrame(step);

    return () => {
      if (
        frameRef.current !== null
      ) {
        cancelAnimationFrame(
          frameRef.current
        );

        frameRef.current = null;
      }
    };
  }, [target, duration]);

  return (
    <span
      className={`font-black tracking-tight tabular-nums ${className}`}
      style={{
        textShadow: `0 0 60px ${glow}`,
      }}
    >
      {target === null
        ? "--"
        : formatTempValue(
            displayValue
          )}
    </span>
  );
}

/* =====================================================
   PREDICTION DATE LABEL
   ===================================================== */

function formatPredictionDate(
  value,
  fallback
) {
  if (!value) {
    return `Tomorrow · ${fallback}`;
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return `Tomorrow · ${fallback}`;
  }

  return (
    `Tomorrow · ` +
    date.toLocaleDateString([], {
      day: "2-digit",
      month: "short",
    })
  );
}

/* =====================================================
   TEMPERATURE UNIT TOGGLE
   ===================================================== */

function UnitToggle({
  unit,
  onChange,
  accent,
}) {
  return (
    <div
      role="group"
      aria-label="Temperature unit"
      className="flex min-h-10 items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-1"
    >
      {["c", "f"].map(
        (key) => {
          const active = unit === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() =>
                onChange(key)
              }
              aria-pressed={active}
              aria-label={
                key === "c"
                  ? "Show temperature in Celsius"
                  : "Show temperature in Fahrenheit"
              }
              className="relative flex min-h-8 min-w-9.5 items-center justify-center rounded-lg text-xs font-bold"
            >
              {active && (
                <motion.span
                  layoutId="atmos-unit-pill"
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background:
                      accent,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 32,
                    mass: 0.6,
                  }}
                />
              )}

              <span
                className={`relative z-10 ${
                  active
                    ? "text-white"
                    : "text-white/45"
                }`}
              >
                °{key.toUpperCase()}
              </span>
            </button>
          );
        }
      )}
    </div>
  );
}

/* =====================================================
   AI RAIN PREDICTION CARD
   ===================================================== */

function RainPredictionCard({
  mlLoading,
  mlError,
  mlPrediction,
  theme,
  selectedCity,
}) {
  /*
   * IMPORTANT:
   * Every value is read from the real backend
   * response and converted to a safe number.
   * undefined / NaN can never reach the UI.
   */

  const prediction =
    mlPrediction?.prediction ?? null;

  const rainProbability = toNumber(
    prediction?.rain_probability,
    0
  );

  const noRainProbability = toNumber(
    prediction?.no_rain_probability,
    0
  );

  const confidenceScore = toNumber(
    prediction?.confidence_score,
    0
  );

  const outcome = String(
    prediction?.prediction ?? ""
  );

  const isRain = outcome === "rain";
  const isNoRain = outcome === "no rain";

  const hasData = Boolean(
    prediction && !mlLoading
  );

  const failed = Boolean(
    mlError && !prediction
  );

  const circumference =
    2 * Math.PI * 58;

  const ringOffset =
    circumference -
    (hasData
      ? (clamp(
          rainProbability,
          0,
          100
        ) /
          100) *
        circumference
      : 0);

  const heading = mlLoading
    ? "Analyzing weather..."
    : failed
    ? "Prediction temporarily unavailable."
    : isRain
    ? "Rain Expected"
    : isNoRain
    ? "No Rain Expected"
    : "Prediction ready";

  return (
    <motion.section
      initial={{
        opacity: 0,
        y: 15,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      className="relative flex h-full flex-col overflow-hidden rounded-3xl border p-5 shadow-2xl sm:p-7"
      style={{
        borderColor:
          `${theme.accent}45`,

        background:
          `linear-gradient(135deg, ${theme.accent}14, rgba(255,255,255,.035))`,
      }}
    >
      <div
        className="absolute -right-20 -top-20 h-44 w-44 rounded-full blur-3xl"
        style={{
          background:
            theme.accent,
          opacity: 0.12,
        }}
      />

      <div className="relative flex flex-1 flex-col items-center text-center">
        <div
          className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] sm:text-xs"
          style={{
            color:
              theme.accent,
          }}
        >
          <BrainCircuit size={16} />

          AI Rain Prediction
        </div>

        {/* RING */}

        <div className="relative mx-auto h-37 w-37">
          <svg
            className="h-full w-full -rotate-90"
            viewBox="0 0 140 140"
          >
            <circle
              cx="70"
              cy="70"
              r="58"
              fill="none"
              stroke="rgba(255,255,255,.08)"
              strokeWidth="10"
            />

            <motion.circle
              cx="70"
              cy="70"
              r="58"
              fill="none"
              stroke={
                theme.accent
              }
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={
                circumference
              }
              initial={{
                strokeDashoffset:
                  circumference,
              }}
              animate={{
                strokeDashoffset:
                  ringOffset,
              }}
              transition={{
                duration: 1.3,
                ease: "easeOut",
              }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {mlLoading ? (
              <Loader2
                size={26}
                className="animate-spin"
                style={{
                  color:
                    theme.accent,
                }}
              />
            ) : failed ? (
              <CloudRain
                size={26}
                className="text-white/30"
              />
            ) : (
              <>
                <span className="text-4xl font-black">
                  {round(
                    rainProbability
                  )}
                  %
                </span>

                <span className="text-[9px] uppercase tracking-widest text-white/35">
                  rain
                </span>
              </>
            )}
          </div>
        </div>

        <h2 className="mt-5 max-w-[24ch] text-balance text-xl font-black sm:text-2xl">
          {heading}
        </h2>

        <p className="mt-2 text-xs text-white/35">
          {formatPredictionDate(
            mlPrediction?.prediction_date,
            selectedCity?.name ||
              "Tomorrow"
          )}
        </p>

        {/* METRICS / LOADING / ERROR */}

        {mlLoading ? (
          <div className="mt-5 grid w-full grid-cols-3 gap-2">
            {[0, 1, 2].map(
              (index) => (
                <div
                  key={index}
                  className="h-15.5 animate-pulse rounded-xl bg-white/6"
                />
              )
            )}
          </div>
        ) : failed ? (
          <p className="mt-5 max-w-[34ch] text-xs leading-relaxed text-amber-200/90">
            {mlError}
          </p>
        ) : (
          <div className="mt-5 grid w-full grid-cols-3 gap-2">
            <Metric
              label="Rain"
              value={`${round(
                rainProbability
              )}%`}
            />

            <Metric
              label="No Rain"
              value={`${round(
                noRainProbability
              )}%`}
            />

            <Metric
              label="Confidence"
              value={`${round(
                confidenceScore
              )}%`}
            />
          </div>
        )}
      </div>
    </motion.section>
  );
}

function BrowserAlertCard({
  enabled,
  threshold,
  permission,
  message,
  onEnable,
  onDisable,
  onThreshold,
  theme,
  rainProbability,
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[.035] p-5 backdrop-blur-xl sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em]"
            style={{
              color:
                theme.accent,
            }}
          >
            {enabled ? (
              <BellRing size={16} />
            ) : (
              <Bell size={16} />
            )}

            Weather Alerts
          </div>

          <h3 className="mt-2 text-lg font-black">
            Browser notifications
          </h3>
        </div>

        <div
          className={`h-2.5 w-2.5 rounded-full ${
            enabled &&
            permission ===
              "granted"
              ? "animate-pulse"
              : "bg-white/20"
          }`}
          style={
            enabled &&
            permission ===
              "granted"
              ? {
                  background:
                    theme.accent,
                }
              : undefined
          }
        />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-white/40">
        Get a notification when tomorrow&apos;s
        rain probability reaches your
        chosen threshold.
      </p>

      <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/45">
            Alert threshold
          </span>

          <strong>
            {threshold}%
          </strong>
        </div>

        <input
          aria-label="Rain alert threshold"
          type="range"
          min="10"
          max="90"
          step="5"
          value={threshold}
          onChange={(event) =>
            onThreshold(
              Number(
                event.target.value
              )
            )
          }
          className="mt-4 w-full accent-[#FF4696]"
        />

        <div className="mt-2 flex justify-between text-[9px] text-white/25">
          <span>10%</span>
          <span>90%</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[10px] text-white/30">
          Current rain probability:{" "}
          {round(
            rainProbability
          )}
          %
        </span>

        {enabled ? (
          <button
            onClick={
              onDisable
            }
            className="min-h-10 rounded-xl border border-white/10 px-4 text-xs font-bold active:scale-95"
          >
            Turn Off
          </button>
        ) : (
          <button
            onClick={
              onEnable
            }
            className="flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold active:scale-95"
            style={{
              background:
                theme.accent,
            }}
          >
            <Bell size={14} />
            Enable
          </button>
        )}
      </div>

      {permission ===
        "denied" && (
        <p className="mt-3 text-[10px] text-amber-200">
          Notifications are blocked.
          Allow them from your browser
          site settings.
        </p>
      )}

      {message && (
        <p className="mt-3 flex items-center gap-1.5 text-[10px] text-emerald-300">
          <CheckCircle2 size={13} />
          {message}
        </p>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
}) {
  return (
    <div className="rounded-xl bg-black/10 p-3">
      <p className="text-[9px] uppercase tracking-wider text-white/35">
        {label}
      </p>

      <p className="mt-1 text-lg font-black">
        {value}
      </p>
    </div>
  );
}

function Detail({
  label,
  value,
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/10 p-3">
      <p className="text-[10px] text-white/30">
        {label}
      </p>

      <p className="mt-1 text-sm font-bold">
        {value}
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
  accent,
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{
            background:
              `${accent}12`,
          }}
        >
          <Icon
            size={15}
            style={{
              color:
                accent,
            }}
          />
        </div>

        <span className="text-[9px] uppercase tracking-wider text-white/30">
          {title}
        </span>
      </div>

      <p className="mt-3 text-base font-black sm:text-lg">
        {value}
      </p>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  accent,
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{
          background:
            `${accent}12`,
          border:
            `1px solid ${accent}15`,
        }}
      >
        <Icon
          size={18}
          style={{
            color:
              accent,
          }}
        />
      </div>

      <div className="min-w-0">
        <h3 className="font-bold">
          {title}
        </h3>

        <p className="truncate text-xs text-white/30">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function InteractiveChart({
  data,
  maxTemp,
  accent,
  selectedPoint,
  onSelect,
}) {
  const width = 1200;
  const height = 320;

  const left = 50;
  const right = 25;
  const top = 25;
  const bottom = 45;

  const chartWidth =
    width - left - right;

  const chartHeight =
    height - top - bottom;

  const points = data.map(
    (item, index) => ({
      ...item,

      x:
        left +
        (index /
          Math.max(
            data.length - 1,
            1
          )) *
          chartWidth,

      y:
        top +
        chartHeight -
        (clamp(
          item.temperature,
          0,
          maxTemp
        ) /
          maxTemp) *
          chartHeight,
    })
  );

  const line = points
    .map(
      (point, index) =>
        `${
          index === 0
            ? "M"
            : "L"
        } ${point.x} ${point.y}`
    )
    .join(" ");

  const area =
    `${line} L ` +
    `${left + chartWidth} ${
      top + chartHeight
    } L ${left} ${
      top + chartHeight
    } Z`;

  return (
    <div className="mt-5 overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            id="atmosHistoryGradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor={
                accent
              }
              stopOpacity=".28"
            />

            <stop
              offset="100%"
              stopColor={
                accent
              }
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map(
          (index) => {
            const y =
              top +
              (index / 4) *
                chartHeight;

            return (
              <line
                key={index}
                x1={left}
                x2={
                  width - right
                }
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,.06)"
              />
            );
          }
        )}

        <motion.path
          d={area}
          fill="url(#atmosHistoryGradient)"
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: 1,
          }}
        />

        <motion.path
          d={line}
          fill="none"
          stroke={accent}
          strokeWidth="3"
          strokeLinecap="round"
          initial={{
            pathLength: 0,
          }}
          animate={{
            pathLength: 1,
          }}
          transition={{
            duration: 2,
            ease: "easeInOut",
          }}
        />

        {points.map(
          (point, index) => {
            const active =
              selectedPoint?.date ===
              point.date;

            return (
              <g
                key={`${point.date}-${index}`}
                onClick={() =>
                  onSelect(point)
                }
                className="cursor-pointer"
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={
                    active
                      ? 8
                      : 4
                  }
                  fill={accent}
                  opacity={
                    active
                      ? 1
                      : 0.65
                  }
                />

                {active && (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="14"
                    fill="none"
                    stroke={accent}
                    opacity=".35"
                  />
                )}
              </g>
            );
          }
        )}

        {[0, 1, 2, 3, 4].map(
          (index) => (
            <text
              key={index}
              x="5"
              y={
                top +
                (index / 4) *
                  chartHeight +
                4
              }
              fill="rgba(255,255,255,.3)"
              fontSize="11"
            >
              {Math.round(
                maxTemp -
                  (index / 4) *
                    maxTemp
              )}
              °
            </text>
          )
        )}
      </svg>

      <div className="flex justify-between px-[4%] text-[9px] text-white/25">
        <span>
          {formatDate(
            data[0]?.date
          )}
        </span>

        <span>
          {formatDate(
            data[
              Math.floor(
                data.length / 2
              )
            ]?.date
          )}
        </span>

        <span>
          {formatDate(
            data[
              data.length - 1
            ]?.date
          )}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-white/25">
        <span
          className="h-0.5 w-5 rounded-full"
          style={{
            background:
              accent,
          }}
        />

        Daily average temperature · tap a point
      </div>
    </div>
  );
}