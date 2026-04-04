from __future__ import annotations

import sys
from pathlib import Path
import unittest


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from geometry import normalize_polygon, polygon_area_and_centroid
from schemas import Coordinate


class GeometryTests(unittest.TestCase):
    def test_polygon_area_and_centroid_for_square(self) -> None:
        points = [
            Coordinate(lat=0.0, lon=0.0),
            Coordinate(lat=0.0, lon=0.1),
            Coordinate(lat=0.1, lon=0.1),
            Coordinate(lat=0.1, lon=0.0),
        ]

        area_m2, centroid = polygon_area_and_centroid(points)

        self.assertGreater(area_m2, 120_000_000)
        self.assertLess(area_m2, 130_000_000)
        self.assertAlmostEqual(centroid.lat, 0.05, places=3)
        self.assertAlmostEqual(centroid.lon, 0.05, places=3)

    def test_normalize_polygon_rejects_degenerate_regions(self) -> None:
        with self.assertRaises(ValueError):
            normalize_polygon(
                [
                    Coordinate(lat=10.0, lon=10.0),
                    Coordinate(lat=10.0, lon=10.0),
                    Coordinate(lat=10.0, lon=10.0),
                ]
            )