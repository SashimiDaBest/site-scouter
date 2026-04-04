from __future__ import annotations

import hashlib
import math

from geometry import normalize_polygon, polygon_area_and_centroid, polygon_self_intersects
from schemas import (
    BoundingBox,
    CandidateRegion,
    Coordinate,
    InfrastructureAnalysisRequest,
    InfrastructureAnalysisResponse,
    InfrastructureDataSources,
)


def _bbox(points: list[Coordinate]) -> BoundingBox:
    return BoundingBox(
        min_lat=min(point.lat for point in points),
        min_lon=min(point.lon for point in points),
        max_lat=max(point.lat for point in points),
        max_lon=max(point.lon for point in points),
    )


def _point_in_polygon(lat: float, lon: float, polygon: list[Coordinate]) -> bool:
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        yi = polygon[i].lat
        xi = polygon[i].lon
        yj = polygon[j].lat
        xj = polygon[j].lon

        intersects = ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def _pseudo(lat: float, lon: float, salt: str) -> float:
    digest = hashlib.sha256(f"{lat:.6f}:{lon:.6f}:{salt}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _solar_irradiance_proxy(lat: float) -> float:
    return max(1000.0, 2050.0 - 18.0 * abs(lat))


def _wind_speed_proxy(lat: float, lon: float) -> float:
    speed = 5.6
    if 35 < lat < 50 and -105 < lon < -85:
        speed += 2.0
    if lat > 45:
        speed += 0.8
    if lon < -115 or lon > -75:
        speed += 0.5
    return speed


def _grid_cells(
    polygon: list[Coordinate],
    bbox: BoundingBox,
    cell_size_m: float,
) -> list[dict]:
    lat_step = cell_size_m / 111_320.0
    center_lat = (bbox.min_lat + bbox.max_lat) / 2.0
    lon_step = cell_size_m / (111_320.0 * max(0.25, math.cos(math.radians(center_lat))))
    cell_area_m2 = cell_size_m * cell_size_m

    cells: list[dict] = []
    lat = bbox.min_lat + lat_step / 2.0
    while lat < bbox.max_lat:
        lon = bbox.min_lon + lon_step / 2.0
        while lon < bbox.max_lon:
            if _point_in_polygon(lat, lon, polygon):
                half_lat = lat_step / 2.0
                half_lon = lon_step / 2.0
                cell_polygon = [
                    Coordinate(lat=lat - half_lat, lon=lon - half_lon),
                    Coordinate(lat=lat - half_lat, lon=lon + half_lon),
                    Coordinate(lat=lat + half_lat, lon=lon + half_lon),
                    Coordinate(lat=lat + half_lat, lon=lon - half_lon),
                ]

                built_ratio = 0.1 + 0.55 * _pseudo(lat, lon, "built")
                vegetation_ratio = 0.15 + 0.5 * _pseudo(lat, lon, "veg")
                water_ratio = 0.03 * _pseudo(lat, lon, "water")
                slope_deg = 0.2 + 9.0 * _pseudo(lat, lon, "slope")
                shading_factor = 0.15 + 0.45 * _pseudo(lat, lon, "shade")
                road_distance_m = 150 + 2_000 * _pseudo(lat, lon, "road")

                rooftop_area_m2 = cell_area_m2 * built_ratio * 0.55
                open_land_area_m2 = max(
                    0.0,
                    cell_area_m2 * (1.0 - built_ratio - vegetation_ratio * 0.2 - water_ratio),
                )
                unobstructed_ratio = _clamp(1.0 - built_ratio * 0.8 - vegetation_ratio * 0.25, 0.0, 1.0)

                cells.append(
                    {
                        "center_lat": lat,
                        "center_lon": lon,
                        "polygon": cell_polygon,
                        "area_m2": cell_area_m2,
                        "rooftop_area_m2": rooftop_area_m2,
                        "open_land_area_m2": open_land_area_m2,
                        "slope_deg": slope_deg,
                        "shading_factor": shading_factor,
                        "road_distance_m": road_distance_m,
                        "unobstructed_ratio": unobstructed_ratio,
                    }
                )
            lon += lon_step
        lat += lat_step

    return cells


def _solar_candidate(cell: dict, idx: int) -> CandidateRegion | None:
    irradiance = _solar_irradiance_proxy(cell["center_lat"])
    usable_solar_area = cell["rooftop_area_m2"] + 0.4 * cell["open_land_area_m2"]
    if usable_solar_area < 2_500:
        return None

    panel_area = 2.0
    panel_rating_w = 420.0
    panel_count = int(usable_solar_area * 0.72 // panel_area)
    if panel_count < 24:
        return None

    installed_kw = panel_count * panel_rating_w / 1000.0
    annual_kwh = irradiance * usable_solar_area * (panel_rating_w / (1000 * panel_area)) * 0.8
    cost = panel_count * 260.0 + usable_solar_area * 120.0

    flatness_score = _clamp((8.0 - cell["slope_deg"]) / 8.0, 0.0, 1.0)
    shade_score = _clamp(1.0 - cell["shading_factor"], 0.0, 1.0)
    area_score = _clamp(usable_solar_area / 12_000.0, 0.0, 1.0)
    irradiance_score = _clamp((irradiance - 1_150.0) / 900.0, 0.0, 1.0)
    score = round(100 * (0.35 * area_score + 0.3 * irradiance_score + 0.2 * shade_score + 0.15 * flatness_score), 1)

    if score < 55:
        return None

    return CandidateRegion(
        id=f"solar-{idx}",
        use_type="solar",
        polygon=cell["polygon"],
        area_m2=round(usable_solar_area, 2),
        feasibility_score=score,
        reasoning=[
            "High usable rooftop/open-surface area.",
            "Irradiance proxy supports viable solar generation.",
            "Slope and shading are within acceptable limits.",
        ],
        estimated_annual_output_kwh=round(annual_kwh, 2),
        estimated_installation_cost_usd=round(cost, 2),
        metadata={
            "panel_count": panel_count,
            "installed_capacity_kw": round(installed_kw, 2),
            "irradiance_kwh_m2_yr": round(irradiance, 2),
            "slope_deg": round(cell["slope_deg"], 2),
        },
    )


def _wind_candidate(cell: dict, idx: int) -> CandidateRegion | None:
    open_land = cell["open_land_area_m2"] * cell["unobstructed_ratio"]
    if open_land < 18_000:
        return None

    wind_speed = _wind_speed_proxy(cell["center_lat"], cell["center_lon"])
    turbine_count = max(0, int(open_land // 45_000))
    if turbine_count < 1:
        return None

    cf = _clamp(0.35 * (wind_speed / 7.0) ** 2.5, 0.05, 0.6)
    annual_kwh = turbine_count * 2_000 * 8_760 * cf
    cost = turbine_count * 1_850_000 + open_land * 16.0

    land_score = _clamp(open_land / 120_000.0, 0.0, 1.0)
    wind_score = _clamp((wind_speed - 5.0) / 4.0, 0.0, 1.0)
    obstruction_score = _clamp(cell["unobstructed_ratio"], 0.0, 1.0)
    slope_score = _clamp((9.0 - cell["slope_deg"]) / 9.0, 0.0, 1.0)
    score = round(100 * (0.4 * wind_score + 0.25 * land_score + 0.2 * obstruction_score + 0.15 * slope_score), 1)

    if score < 58:
        return None

    return CandidateRegion(
        id=f"wind-{idx}",
        use_type="wind",
        polygon=cell["polygon"],
        area_m2=round(open_land, 2),
        feasibility_score=score,
        reasoning=[
            "Open and unobstructed land supports turbine spacing.",
            "Wind-speed proxy indicates strong wind potential.",
            "Terrain slope remains in practical build range.",
        ],
        estimated_annual_output_kwh=round(annual_kwh, 2),
        estimated_installation_cost_usd=round(cost, 2),
        metadata={
            "turbine_count": turbine_count,
            "wind_speed_100m_mps": round(wind_speed, 2),
            "capacity_factor": round(cf, 3),
            "slope_deg": round(cell["slope_deg"], 2),
        },
    )


def _data_center_candidate(cell: dict, idx: int) -> CandidateRegion | None:
    open_land = cell["open_land_area_m2"]
    if open_land < 8_000:
        return None

    flatness_score = _clamp((5.5 - cell["slope_deg"]) / 5.5, 0.0, 1.0)
    access_score = _clamp(1.0 - cell["road_distance_m"] / 2200.0, 0.0, 1.0)
    area_score = _clamp(open_land / 60_000.0, 0.0, 1.0)
    score = round(100 * (0.5 * flatness_score + 0.3 * area_score + 0.2 * access_score), 1)

    if score < 52:
        return None

    it_load_mw = max(0.3, open_land / 18_000.0)
    capex = open_land * 280.0 + it_load_mw * 4_500_000

    return CandidateRegion(
        id=f"dc-{idx}",
        use_type="data_center",
        polygon=cell["polygon"],
        area_m2=round(open_land, 2),
        feasibility_score=score,
        reasoning=[
            "Sufficient contiguous flat land for campus footprint.",
            "Road-proximity proxy indicates practical logistics access.",
            "Buildability supports phased infrastructure deployment.",
        ],
        estimated_annual_output_kwh=None,
        estimated_installation_cost_usd=round(capex, 2),
        metadata={
            "estimated_it_load_mw": round(it_load_mw, 2),
            "road_distance_m": round(cell["road_distance_m"], 1),
            "slope_deg": round(cell["slope_deg"], 2),
        },
    )


def analyze_infrastructure_polygon(
    request: InfrastructureAnalysisRequest,
) -> InfrastructureAnalysisResponse:
    polygon = normalize_polygon(request.points)
    if polygon_self_intersects(polygon):
        raise ValueError("Polygon is self-intersecting. Provide a simple non-intersecting polygon.")

    area_m2, centroid = polygon_area_and_centroid(polygon)
    bbox = _bbox(polygon)

    cells = _grid_cells(polygon, bbox, request.cell_size_m)
    candidates: list[CandidateRegion] = []

    for index, cell in enumerate(cells, start=1):
        solar = _solar_candidate(cell, index)
        if solar is not None:
            candidates.append(solar)

        wind = _wind_candidate(cell, index)
        if wind is not None:
            candidates.append(wind)

        data_center = _data_center_candidate(cell, index)
        if data_center is not None:
            candidates.append(data_center)

    candidates.sort(key=lambda candidate: candidate.feasibility_score, reverse=True)
    candidates = candidates[:80]

    imagery_source = (
        f"{request.imagery_provider}-placeholder" if request.imagery_provider != "none" else "not-requested"
    )

    notes = [
        "Pipeline currently uses deterministic spatial heuristics for segmentation and suitability.",
        "Imagery/OSM/DEM connectors are represented as integration points and can be replaced with live providers.",
        "Subregions are grid-derived cells centered inside the input polygon for stable repeatable scoring.",
    ]

    if not candidates:
        notes.append("No subregions exceeded feasibility thresholds for the configured cell size.")

    return InfrastructureAnalysisResponse(
        area_m2=round(area_m2, 2),
        bbox=bbox,
        centroid=centroid,
        subdivisions_evaluated=len(cells),
        candidates=candidates,
        data_sources=InfrastructureDataSources(
            imagery=imagery_source,
            vector_data="osm-placeholder",
            segmentation="rule-based-heuristics",
            terrain="proxy-slope",
        ),
        pipeline_notes=notes,
    )
