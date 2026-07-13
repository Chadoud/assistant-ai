"""Weather summary via Open-Meteo (no API key)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_WMO_LABELS: dict[int, str] = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Fog",
    51: "Light drizzle",
    61: "Rain",
    80: "Rain showers",
    95: "Thunderstorm",
}


def weather_report(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Parameters:
        city: place name for geocoding (preferred if latitude/longitude absent)
        latitude: optional float
        longitude: optional float
    """
    logger.debug("[action] weather_report called args=%r", parameters)
    city = str(parameters.get("city", "")).strip()
    lat_raw = parameters.get("latitude")
    lon_raw = parameters.get("longitude")

    try:
        if lat_raw is not None and lon_raw is not None:
            lat = float(lat_raw)
            lon = float(lon_raw)
            label = city or f"{lat:.2f},{lon:.2f}"
        else:
            if not city:
                return {"ok": False, "error": "Provide city or latitude and longitude"}
            with httpx.Client(timeout=12.0) as client:
                geo = client.get(
                    "https://geocoding-api.open-meteo.com/v1/search",
                    params={"name": city, "count": 1},
                )
            geo.raise_for_status()
            gdata = geo.json()
            results = gdata.get("results") or []
            if not results:
                return {"ok": False, "error": f"No location found for {city!r}"}
            hit = results[0]
            lat = float(hit["latitude"])
            lon = float(hit["longitude"])
            label = str(hit.get("name") or city)

        with httpx.Client(timeout=12.0) as client:
            fc = client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                    "wind_speed_unit": "kmh",
                },
            )
        fc.raise_for_status()
        data = fc.json()
        cur = data.get("current") or {}
        temp = cur.get("temperature_2m")
        rh = cur.get("relative_humidity_2m")
        code = int(cur.get("weather_code") or 0)
        wind = cur.get("wind_speed_10m")
        desc = _WMO_LABELS.get(code, "Weather")

        parts = [f"{label}: {desc}"]
        if temp is not None:
            parts.append(f"{float(temp):.0f}°C")
        if rh is not None:
            parts.append(f"humidity {int(rh)}%")
        if wind is not None:
            parts.append(f"wind {float(wind):.0f} km/h")

        summary = ", ".join(parts)
        return {
            "ok": True,
            "data": {
                "summary": summary,
                "latitude": lat,
                "longitude": lon,
                "temperature_c": temp,
                "weather_code": code,
            },
        }
    except httpx.HTTPError as exc:
        logger.warning("weather HTTP error: %s", exc)
        return {"ok": False, "error": f"Weather service error: {exc}"}
    except Exception as exc:
        logger.exception("weather_report")
        return {"ok": False, "error": str(exc)}
