import requests
from collections import defaultdict
from datetime import datetime
import pandas as pd
import os
from dotenv import load_dotenv
load_dotenv()

def get_eia_generation_batch(eia_ids):
    base_url = "https://api.eia.gov/v2/electricity/facility-fuel/data/"
    api_key = os.getenv("EIA_API_KEY")
    
    payload = {
        "facets": {"plantCode": [str(eid) for eid in eia_ids]},
        "data": ["generation"],
        "frequency": "annual",
        "sort": [{"column": "period", "direction": "desc"}],
        "length": 5000
    }
    
    response = requests.post(f"{base_url}?api_key={api_key}", json=payload)
    if response.status_code == 200:
        return response.json()["response"]["data"]
    print("Failed:", response.status_code, response.text)
    return None

def get_all_generation(eia_ids, years_per_plant=10, chunk_size=None):
    if chunk_size is None:
        chunk_size = 5000 // years_per_plant

    all_records = []
    for i in range(0, len(eia_ids), chunk_size):
        chunk = eia_ids[i:i + chunk_size]
        print(f"Fetching plants {i} to {i + len(chunk)}...")
        records = get_eia_generation_batch(chunk)
        if records:
            all_records.extend(records)

    df = pd.DataFrame(all_records)

    if df.empty:
        return df

    df["generation"] = pd.to_numeric(df["generation"], errors="coerce")
    df["period"] = pd.to_numeric(df["period"], errors="coerce")

    df = (
        df.sort_values("period", ascending=False)
        .groupby("plantCode")
        .head(years_per_plant)
    )
    avg_df = (
        df.groupby("plantCode", as_index=False)["generation"]
        .mean()
        .rename(columns={"generation": "avg_annual_generation"})
    )
    avg_df["plantCode"] = avg_df["plantCode"].astype(int)
    avg_df.to_csv("data/avg_eia_solar_gen.csv", index=False)

    return avg_df

def get_solar_weather_features():
    features = [
        "rain",
        "showers",
        "snowfall",
        "temperature_2m",
        "relative_humidity_2m",
        "cloud_cover",
        "cloud_cover_low",
        "cloud_cover_high",
        "cloud_cover_mid",
        "shortwave_radiation",
        "direct_radiation",
        "diffuse_radiation",
        "global_tilted_irradiance",
    ]
    return features

def get_wind_weather_features():
    features = [
        "rain",
        "showers",
        "snowfall",
        "temperature_2m",
        "relative_humidity_2m",
        "wind_speed_10m",
        "wind_speed_80m",
        "wind_gusts_10m",
        "wind_direction_10m",
        "wind_direction_80m",
    ]
    return features

def get_solar_weather_data(lat, long, date):

    date = date.strftime("%Y-%m-%d")

    url = f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={long}&start_date={date}&end_date={date}&hourly=rain,showers,snowfall,temperature_2m,relative_humidity_2m,cloud_cover,cloud_cover_low,cloud_cover_high,cloud_cover_mid,shortwave_radiation,direct_radiation,diffuse_radiation,global_tilted_irradiance"

    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()["hourly"]
        output = []
        for element in get_solar_weather_features():
            output.append(data[element][12])
        return output
    else:
        print(f"Error {response.status_code}: {response.text}")

def get_wind_weather_data(lat, long, date):

    date = date.strftime("%Y-%m-%d")
    
    url = f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={long}&start_date={date}&end_date={date}&hourly=rain,showers,snowfall,temperature_2m,relative_humidity_2m,wind_speed_10m,wind_speed_80m,wind_gusts_10m,wind_direction_10m,wind_direction_80m"

    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()["hourly"]
        output = []
        for element in get_wind_weather_features():
            output.append(data[element][12])
        return output
    else:
        print(f"Error {response.status_code}: {response.text}")


def _fetch_and_aggregate(latitude: float, longitude: float, hourly_vars: list[str]) -> dict:
    """
    Internal helper: fetches 1991–2020 hourly data from Open-Meteo and
    aggregates it into monthly climate normals.
    """
    BASE_URL = "https://archive-api.open-meteo.com/v1/archive"

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": "1991-01-01",
        "end_date": "2020-12-31",
        "hourly": hourly_vars,
        "timezone": "auto",
    }

    response = requests.get(BASE_URL, params=params)
    response.raise_for_status()
    data = response.json()

    hourly = data["hourly"]
    timestamps = hourly["time"]  # "YYYY-MM-DDTHH:MM"

    # Bucket every hourly reading by month
    monthly_buckets: dict[int, dict[str, list]] = defaultdict(lambda: defaultdict(list))

    for i, ts in enumerate(timestamps):
        month = int(ts[5:7])
        for var in hourly_vars:
            val = hourly.get(var, [None])[i]
            if val is not None:
                monthly_buckets[month][var].append(val)

    def avg(lst):
        return round(sum(lst) / len(lst), 2) if lst else None

    monthly_normals = []
    for month in range(1, 13):
        b = monthly_buckets[month]
        entry = {"month": month}
        for var in hourly_vars:
            entry[var] = avg(b[var])
        monthly_normals.append(entry)

    return {
        "location": {"latitude": latitude, "longitude": longitude},
        "climate_normal_period": "1991–2020 (WMO standard)",
        "monthly_climate_normals": monthly_normals,
    }



SOLAR_VARS = [
    "rain",
    "showers",
    "snowfall",
    "temperature_2m",
    "relative_humidity_2m",
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "shortwave_radiation",
    "direct_radiation",
    "diffuse_radiation",
    "global_tilted_irradiance",
]

def get_solar_climate_data(latitude: float, longitude: float) -> dict:
    """
    Fetch solar-focused climate normals (1991–2020 monthly averages).

    Captures radiation components, cloud cover layers, and atmospheric
    conditions that directly influence solar energy potential.
    Args:
        latitude:  Decimal degrees  e.g. 37.7749
        longitude: Decimal degrees  e.g. -122.4194

    Returns:
        dict with location, normal period, and monthly_climate_normals list.
    """
    return _fetch_and_aggregate(latitude, longitude, SOLAR_VARS)



WIND_VARS = [
    "rain",
    "showers",
    "snowfall",
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_speed_80m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "wind_direction_80m",
]

def get_wind_climate_data(latitude: float, longitude: float) -> dict:
    """
    Fetch wind-focused climate normals (1991–2020 monthly averages).

    Captures wind speeds and directions at two hub heights alongside
    atmospheric conditions relevant to wind energy assessment.
    Args:
        latitude:  Decimal degrees  e.g. 52.5200
        longitude: Decimal degrees  e.g. 13.4050

    Returns:
        dict with location, normal period, and monthly_climate_normals list.
    """
    return _fetch_and_aggregate(latitude, longitude, WIND_VARS)



if __name__ == "__main__":
    import json

    print("=== Solar Climate — San Francisco ===")
    solar = get_solar_climate_data(latitude=37.7749, longitude=-122.4194)
    print(json.dumps(solar, indent=2))

    print("\n=== Wind Climate — Berlin ===")
    wind = get_wind_climate_data(latitude=52.5200, longitude=13.4050)
    print(json.dumps(wind, indent=2))