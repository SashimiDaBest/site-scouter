from __future__ import annotations

import sys
from pathlib import Path
import unittest


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from infrastructure_pipeline import analyze_infrastructure_polygon
from schemas import Coordinate, InfrastructureAnalysisRequest


class InfrastructurePipelineTests(unittest.TestCase):
    def test_pipeline_returns_ranked_candidates(self) -> None:
        request = InfrastructureAnalysisRequest(
            points=[
                Coordinate(lat=33.0, lon=-112.0),
                Coordinate(lat=33.0, lon=-111.95),
                Coordinate(lat=33.03, lon=-111.95),
                Coordinate(lat=33.03, lon=-112.0),
            ],
            cell_size_m=500,
        )

        result = analyze_infrastructure_polygon(request)

        self.assertGreater(result.area_m2, 0)
        self.assertGreater(result.subdivisions_evaluated, 0)
        self.assertGreater(len(result.candidates), 0)
        self.assertIn(result.candidates[0].use_type, {"solar", "wind", "data_center"})

    def test_pipeline_rejects_self_intersecting_polygon(self) -> None:
        request = InfrastructureAnalysisRequest(
            points=[
                Coordinate(lat=0.0, lon=0.0),
                Coordinate(lat=1.0, lon=1.0),
                Coordinate(lat=0.0, lon=1.0),
                Coordinate(lat=1.0, lon=0.0),
            ],
            cell_size_m=400,
        )

        with self.assertRaises(ValueError):
            analyze_infrastructure_polygon(request)
