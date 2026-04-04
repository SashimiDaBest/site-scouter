# Catapult 2026 — Renewables Project

> Hackathon: 24-hour build. Model-first. Everything else supports the model.
> Scope: US only. Mode: site scouting within a user-defined radius.

---

## 1. Model Overview (START HERE)

**What it does:**
The user clicks a point on a US map and defines a search radius (default 50 miles).
The model scouts inside that circle to determine:
- Whether **solar** or **wind** is better for this region
- The **best candidate location** within the circle (lat/lon)
- An **energy estimate** for a standard installation at that spot
- A **suitability score** [0–100]

```
Input:  center_lat, center_lon, radius_miles (default 50)

Output:
  recommendation:      "solar" | "wind" | "hybrid"
  best_location:       {lat, lon}          ← pinned on map
  solar_kwh_yr:        float               ← for standard solar farm
  wind_kwh_yr:         float               ← for standard wind farm
  suitability_score:   float [0–100]
  confidence:          "high" | "medium" | "low"
```

**Core strategy:**
1. Find all real solar farms and wind turbines inside the search circle (from datasets)
2. Fetch weather data (GHI + wind speed) from Open-Meteo for the circle center
3. Compute energy potential for each energy type using physics formulas + real installation data
4. Recommend based on energy output; surface the best candidate location

---

## 2. Datasets

| File | Rows | Key columns used |
|------|------|-----------------|
| `solar.csv` | 5,712 | `ylat`, `xlong`, `p_area` (m²), `p_cap_ac` (MW) |
| `wind.csv` | 75,727 | `ylat`, `xlong`, `t_cap` (kW), `t_rd` rotor diameter (m), `t_rsa` rotor swept area (m²), `t_hh` hub height (m) |

Dataset-derived constants (computed from real data):
- Solar power density: **51 W/m²** (whole-farm footprint, real data median)
- Median turbine: **2,000 kW**, **100 m** rotor diameter, **80 m** hub height
- Median rotor swept area: **7,854 m²**

---

## 3. Feature Design

### 3.1 Inside-circle features (from datasets)

For a given `(center_lat, center_lon, radius_miles)`:

| Feature | How computed | Meaning |
|---------|-------------|---------|
| `solar_farms_in_circle` | filter solar.csv by Haversine ≤ radius | Existing farms inside search area |
| `wind_turbines_in_circle` | filter wind.csv by Haversine ≤ radius | Existing turbines inside search area |
| `n_solar` | len(solar_farms_in_circle) | Count of solar farms |
| `n_wind` | len(wind_turbines_in_circle) | Count of wind turbines |
| `solar_cap_mw` | sum(p_cap_ac) for solar in circle | Total installed solar capacity inside circle |
| `wind_cap_mw` | sum(t_cap / 1000) for turbines in circle | Total installed wind capacity inside circle |
| `solar_centroid` | mean lat/lon of solar farms in circle | Best candidate solar location |
| `wind_centroid` | mean lat/lon of wind turbines in circle | Best candidate wind location |

### 3.2 Weather features (Open-Meteo API)

**Endpoint:** `https://archive-api.open-meteo.com/v1/archive`

Query the **center point** with 1-year historical data (2023-01-01 to 2023-12-31):

```
params = {
  latitude:  center_lat,
  longitude: center_lon,
  start_date: "2023-01-01",
  end_date:   "2023-12-31",
  hourly: "shortwave_radiation,wind_speed_100m",
  timezone: "auto"
}
```

| Feature | Derived from | Units | Notes |
|---------|-------------|-------|-------|
| `ghi_annual` | sum(shortwave_radiation) / 1000 | kWh/m²/yr | Global Horizontal Irradiance |
| `wind_speed_mean` | mean(wind_speed_100m) | m/s | Mean at 100m hub height |

**Fallback if API unavailable:**
```python
ghi_annual = max(800, 2000 - 22 * abs(center_lat))   # kWh/m²/yr
wind_speed_mean = 7.0                                  # m/s, US median
```

---

## 4. Energy Estimation Logic

> These formulas estimate energy for a **standard reference installation** — not the full circle area.
> Reference sizes: solar = 100 MW farm, wind = 20-turbine project.

### 4.1 Solar model

**Reference area** for a 100 MW farm at 51 W/m² density:
```python
ref_solar_area_m2 = (100 * 1e6) / 51.0   # ≈ 1,960,784 m²  (~500 acres)
```

**Energy estimate:**
```python
GHI_scale = ghi_annual / 1750             # normalize to US reference irradiance
solar_kwh_yr = 51.0 * GHI_scale * ref_solar_area_m2 * 8760 / 1000
# Simplifies to:
solar_kwh_yr = 100_000 * GHI_scale * 8760  # ≈ 175–210 GWh/yr depending on GHI
```

**Why 51 W/m²?** Median empirical power density from 5,712 real US solar farms. Already encodes panel efficiency, packing ratio, and inverter losses.

### 4.2 Wind model

**Reference installation:** 20 turbines using specs from nearest turbines in circle (or dataset median).

```python
# Turbine specs: use median from wind_turbines_in_circle if n_wind > 0, else dataset defaults
turbine_cap_kw = median(t_cap) if n_wind > 0 else 2000    # kW
rsa_m2         = median(t_rsa) if n_wind > 0 else 7854    # m²
n_turbines     = 20                                         # reference project size

# Capacity factor from wind speed (empirical, validated against real CF data)
CF = min(0.60, max(0.05, 0.35 * (wind_speed_mean / 7.0) ** 2.5))

wind_kwh_yr = n_turbines * turbine_cap_kw * CF * 8760
```

At wind_speed = 7 m/s: `20 × 2000 × 0.35 × 8760 ≈ 122 GWh/yr`

---

## 5. Best Candidate Location

The model must pin a specific lat/lon on the map as the recommended installation site.

```python
if n_solar > 0 and recommendation == "solar":
    best_location = solar_centroid        # center of mass of existing solar farms
elif n_wind > 0 and recommendation == "wind":
    best_location = wind_centroid         # center of mass of existing turbines
else:
    best_location = (center_lat, center_lon)   # fallback: circle center
```

**Rationale:** Existing installations concentrate where terrain, grid access, and solar/wind conditions are already proven. Their centroid is a strong prior for the best new site.

---

## 6. Recommendation Logic

```python
MARGIN = 1.2   # require 20% advantage to avoid calling "hybrid"

if solar_kwh_yr > MARGIN * wind_kwh_yr:
    recommendation = "solar"
elif wind_kwh_yr > MARGIN * solar_kwh_yr:
    recommendation = "wind"
else:
    recommendation = "hybrid"
```

---

## 7. Suitability Score [0–100]

Combines **evidence from existing installations** (historical signal) with **weather quality** (physics signal).

```python
# Evidence: how many real installations exist inside the circle?
solar_evidence = min(1.0, n_solar / 10.0)     # saturates at 10 farms
wind_evidence  = min(1.0, n_wind  / 50.0)     # saturates at 50 turbines

# Weather quality
ghi_score  = min(1.0, ghi_annual / 2100)               # 2100 = desert SW benchmark
wind_score = min(1.0, max(0, (wind_speed_mean - 3) / 9))  # 3 m/s cut-in → 12 m/s excellent

# Combined score for each type
solar_score = 0.5 * solar_evidence + 0.5 * ghi_score
wind_score  = 0.5 * wind_evidence  + 0.5 * wind_score

suitability_score = round(max(solar_score, wind_score) * 100, 1)

# Confidence: how much data did we find?
if n_solar + n_wind > 20:   confidence = "high"
elif n_solar + n_wind > 3:  confidence = "medium"
else:                        confidence = "low"
```

---

## 8. Simplifying Assumptions

| Assumption | Value | Justification |
|------------|-------|---------------|
| Solar power density | 51 W/m² | Empirical median from dataset |
| Reference solar farm size | 100 MW | Typical utility-scale |
| Reference wind project | 20 turbines | Typical small-to-mid project |
| Reference irradiance | 1750 kWh/m²/yr | US average |
| CF at 7 m/s | 35% | Industry standard onshore |
| Weather query | circle center only | At 50-mile scale, weather is spatially uniform |
| US-only scope | — | Datasets cover continental US only |
| Historical year | 2023 | Recent, complete, available in Open-Meteo |

---

## 9. Minimal Data Requirements

**Offline (degraded mode):**
- `solar.csv` ✓ (present)
- `wind.csv` ✓ (present)
- Lat/lon fallback formulas for GHI and wind speed

**Full mode:**
- Above + Open-Meteo API (free, no API key required)

---

## 10. System Architecture

```
[Map click → center_lat, center_lon, radius_miles]
        │
        ├─ [Haversine filter] ──── solar.csv  (BallTree, loaded once at startup)
        │                    └──── wind.csv   (BallTree, loaded once at startup)
        │
        ├─ [Open-Meteo API call] ── ghi_annual, wind_speed_mean (async, 1–2s)
        │
        ├─ [Energy Model] ───────── solar_kwh_yr, wind_kwh_yr
        │
        ├─ [Recommendation + Score + best_location]
        │
        └─ [JSON response → Frontend map]
```

### Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Backend | Python + FastAPI | Fast to build, async for API calls |
| Geospatial KNN | scikit-learn BallTree (Haversine) | Sub-millisecond KNN on 75k points |
| Data | pandas + numpy | CSV loading + vectorized math |
| HTTP client | httpx (async) | Non-blocking Open-Meteo calls |
| Frontend | Leaflet.js (vanilla JS) | Map + circle overlay, no framework needed |
| Hosting | uvicorn (local) | Sufficient for hackathon demo |

---

## 11. Implementation Plan (24-hour hackathon)

| Phase | Hours | Tasks |
|-------|-------|-------|
| **1 — Data + Model core** | 0–5h | Load CSVs into BallTree, implement Haversine filter, build solar + wind energy functions, unit-test 5 known US locations |
| **2 — Weather integration** | 5–8h | Open-Meteo fetch + parse, offline fallback, integrate into model pipeline |
| **3 — FastAPI backend** | 8–11h | `POST /scout` endpoint accepting `{lat, lon, radius_miles}`, return full JSON response |
| **4 — Frontend map UI** | 11–17h | Leaflet map, click-to-center, radius slider, draw circle, show best_location pin + result card |
| **5 — Validation + polish** | 17–22h | Test locations below, edge cases (ocean, no data zones), error handling |
| **6 — Demo prep** | 22–24h | Script, README, demo video/screenshots |

### Validation test cases

| Location | Radius | Expected |
|----------|--------|---------|
| Phoenix, AZ (33.4, -112.1) | 50 mi | Solar, high score |
| Amarillo, TX (35.2, -101.8) | 50 mi | Wind or hybrid |
| North Dakota (47.5, -100.5) | 50 mi | Wind, high score |
| Seattle, WA (47.6, -122.3) | 50 mi | Low score, low confidence |
| Mojave Desert, CA (35.0, -117.5) | 50 mi | Solar, very high score |
| Gulf Coast, TX (27.8, -97.4) | 50 mi | Wind (coastal) |

---

## 12. API Contract

### `POST /scout`

**Request:**
```json
{
  "lat": 33.4,
  "lon": -112.1,
  "radius_miles": 50
}
```

**Response:**
```json
{
  "recommendation": "solar",
  "best_location": { "lat": 33.41, "lon": -112.08 },
  "solar_kwh_yr": 175000000,
  "wind_kwh_yr": 95000000,
  "suitability_score": 84.3,
  "confidence": "high",
  "n_solar_in_circle": 7,
  "n_wind_in_circle": 3,
  "ghi_annual": 2150.0,
  "wind_speed_mean": 6.2,
  "weather_source": "api"
}
```
