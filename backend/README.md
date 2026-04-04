# Backend

FastAPI service for polygon-based solar site analysis.

## Responsibilities

The backend accepts a polygon region and returns:

- polygon area in square meters and square kilometers
- estimated solar panel count for the available area
- solar intensity at the polygon centroid
- estimated installed capacity in kW
- estimated annual energy output in kWh
- panel, construction, and total project costs
- suitability score, verdict, and explanation

## Module Layout

- [backend.py](backend.py): FastAPI app, CORS setup, and route wiring
- [schemas.py](schemas.py): request and response models
- [geometry.py](geometry.py): polygon normalization, projection, area, and centroid math
- [solar_analysis.py](solar_analysis.py): weather lookup and solar feasibility calculations
- [tests/](tests): unit tests for geometry and solar analysis

## Install

```bash
cd backend
pip install -r requirements.txt
```

## Run

```bash
cd backend
uvicorn backend:app --reload
```

## Test

```bash
cd backend
python -m unittest discover -s tests
```

## API

### `POST /solar/analyze`

Request body:

```json
{
  "points": [
    { "lat": 33.4, "lon": -112.1 },
    { "lat": 33.4, "lon": -112.0 },
    { "lat": 33.3, "lon": -112.0 },
    { "lat": 33.3, "lon": -112.1 }
  ]
}
```

Optional overrides:

- `panel_area_m2`
- `panel_rating_w`
- `panel_cost_usd`
- `construction_cost_per_m2_usd`
- `packing_efficiency`
- `performance_ratio`
- `sunlight_threshold_kwh_m2_yr`

## Frontend Integration

The frontend calls this backend through [frontend/src/lib/solarAnalysisApi.js](../frontend/src/lib/solarAnalysisApi.js).

Set `VITE_BACKEND_URL` in the frontend environment if the API is not running on `http://127.0.0.1:8000`.

## Notes

- Sunlight intensity is fetched from Open-Meteo for the polygon centroid.
- If the weather API is unavailable, the service falls back to a latitude-based proxy.
