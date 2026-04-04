import torch
from torch.utils.data import random_split
from torch.utils.data import Dataset, DataLoader

class SolarDataset(Dataset):
    def __init__(self, data: dict):
        hourly = data["hourly"]
        
        self.times = hourly["time"]
        self.features = torch.tensor([
            [
                hourly["temperature_2m"][i],
                hourly["relative_humidity_2m"][i],
                hourly["rain"][i],
                hourly["showers"][i],
                hourly["snowfall"][i],
                hourly["cloud_cover"][i],
                hourly["cloud_cover_low"][i],
                hourly["cloud_cover_mid"][i],
                hourly["cloud_cover_high"][i],
                hourly["shortwave_radiation"][i],
                hourly["direct_radiation"][i],
                hourly["diffuse_radiation"][i],
                hourly["global_tilted_irradiance"][i],
            ]
            for i in range(len(self.times))
        ], dtype=torch.float32)

def get_data():


# area
#weatherstuff... from lat long, date
