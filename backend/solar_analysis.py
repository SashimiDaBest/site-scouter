from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from geometry import polygon_area_and_centroid
from schemas import Coordinate, SolarAnalysisRequest, SolarAnalysisResponse


OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
MINIMUM_USEFUL_PANEL_COUNT = 12


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def fetch_annual_solar_intensity(lat: float, lon: float) -> tuple[float, str]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": "2023-01-01",
        "end_date": "2023-12-31",
        "hourly": "shortwave_radiation",
        "timezone": "auto",
    }
    url = f"{OPEN_METEO_ARCHIVE_URL}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})

    try:
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
        hourly = payload.get("hourly", {})
        radiation_values = hourly.get("shortwave_radiation", [])
        if not radiation_values:
            raise ValueError("Open-Meteo response did not include shortwave radiation.")
        return sum(float(value) for value in radiation_values) / 1000.0, "open-meteo"
    except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError):
        fallback = max(900.0, 2_050.0 - 18.0 * abs(lat))
        return fallback, "fallback-proxy"


def analyze_solar_polygon(request: SolarAnalysisRequest) -> SolarAnalysisResponse:
    area_m2, centroid = polygon_area_and_centroid(request.points)
    area_km2 = area_m2 / 1_000_000.0
    sunlight_intensity_kwh_m2_yr, weather_source = fetch_annual_solar_intensity(
        centroid.lat,
        centroid.lon,
    )

    usable_area_m2 = area_m2 * request.packing_efficiency
    panel_count = int(usable_area_m2 // request.panel_area_m2)
    installed_capacity_kw = (panel_count * request.panel_rating_w) / 1000.0
    panel_efficiency = request.panel_rating_w / (1000.0 * request.panel_area_m2)
    estimated_annual_output_kwh = (
        sunlight_intensity_kwh_m2_yr
        * usable_area_m2
        * panel_efficiency
        * request.performance_ratio
    )

    panel_cost_usd = panel_count * request.panel_cost_usd
    construction_cost_usd = area_m2 * request.construction_cost_per_m2_usd
    total_project_cost_usd = panel_cost_usd + construction_cost_usd

    intensity_score = clamp(
        (sunlight_intensity_kwh_m2_yr - 1_000.0) / 700.0 * 100.0,
        0.0,
        100.0,
    )
    capacity_score = clamp(panel_count / 200.0 * 100.0, 0.0, 100.0)
    suitability_score = round(0.7 * intensity_score + 0.3 * capacity_score, 1)

    reasons = []
    if sunlight_intensity_kwh_m2_yr < request.sunlight_threshold_kwh_m2_yr:
        reasons.append("Sunlight intensity is below the recommended threshold.")
    if panel_count < MINIMUM_USEFUL_PANEL_COUNT:
        reasons.append("The region is too small to host a meaningful solar array.")
    if not reasons:
        reasons.append("The region has enough area and sunlight for solar installation.")

    suitable = (
        sunlight_intensity_kwh_m2_yr >= request.sunlight_threshold_kwh_m2_yr
        and panel_count >= MINIMUM_USEFUL_PANEL_COUNT
    )

    return SolarAnalysisResponse(
        area_m2=round(area_m2, 2),
        area_km2=round(area_km2, 4),
        centroid=Coordinate(lat=centroid.lat, lon=centroid.lon),
        sunlight_intensity_kwh_m2_yr=round(sunlight_intensity_kwh_m2_yr, 2),
        weather_source=weather_source,
        panel_count=panel_count,
        installed_capacity_kw=round(installed_capacity_kw, 2),
        estimated_annual_output_kwh=round(estimated_annual_output_kwh, 2),
        panel_cost_usd=round(panel_cost_usd, 2),
        construction_cost_usd=round(construction_cost_usd, 2),
        total_project_cost_usd=round(total_project_cost_usd, 2),
        suitability_score=suitability_score,
        suitable=suitable,
        suitability_reason=" ".join(reasons),
    )