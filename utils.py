import requests
from datetime import datetime, date

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


def get_solar_c_data(lat, long, date):

    date = date.strftime("%Y-%m-%d")
    url = f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={long}&start_date={date}&end_date={date}&hourly={",".join(get_solar_weather_features())}"

    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        return data["hourly"]
    else:
        print(f"Error {response.status_code}: {response.text}")

def get_wind_climate_data(lat, long, data):
    
    date = date.strftime("%Y-%m-%d")
    url = f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={long}&start_date={date}&end_date={date}&daily={",".join(get_wind_weather_features())}"

    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        return data["hourly"]
    else:
        print(f"Error {response.status_code}: {response.text}")


print(get_solar_c_data(45, 90, date.today()))