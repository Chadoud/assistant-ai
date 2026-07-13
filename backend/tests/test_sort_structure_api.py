"""API tests for sort_structure_template on analyze and structure-summary."""

from __future__ import annotations

import pathlib
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import main
from tests.path_helpers import home_safe_tempdir

VALID_TEMPLATE = {
    "version": 1,
    "enabled": True,
    "modules": [
        {
            "id": "c",
            "theme": "country",
            "max_folders": None,
            "overflow_policy": "merge_into_other",
            "children": [
                {
                    "id": "p",
                    "theme": "property",
                    "max_folders": None,
                    "overflow_policy": "merge_into_other",
                    "children": [],
                }
            ],
        }
    ],
}


class TestSortStructureApi(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        main.jobs.clear()

    @patch(
        "main.classify_candidates",
        return_value={
            "folder_name": "France/Villa",
            "confidence": 0.9,
            "reason": "lease",
            "structure_values": {"country": "France", "property": "Villa"},
            "structure_path_provisional": "France/Villa",
            "candidate_scores": [
                {"folder_name": "France/Villa", "score": 0.9},
                {"folder_name": "Uncertain", "score": 0.1},
            ],
            "decision_reason": "structure",
            "decision_trace": {"structure_template": True, "structure_parse_failed": False},
        },
    )
    @patch(
        "main.extract_content",
        return_value={
            "text": "French property lease",
            "extraction_source": "plain_text",
            "quality_score": 0.9,
            "signals": {},
        },
    )
    def test_analyze_accepts_template_and_persists_config(self, _extract, _classify):
        with home_safe_tempdir() as tmp:
            in_dir = pathlib.Path(tmp) / "in"
            out_dir = pathlib.Path(tmp) / "out"
            in_dir.mkdir()
            out_dir.mkdir()
            src = in_dir / "lease.pdf"
            src.write_text("lease", encoding="utf-8")

            resp = self.client.post(
                "/analyze",
                json={
                    "file_paths": [str(src)],
                    "output_dir": str(out_dir),
                    "model": "mistral",
                    "mode": "copy",
                    "language": "English",
                    "sort_structure_template": VALID_TEMPLATE,
                },
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            job_id = resp.json()["job_id"]

            job = self.client.get(f"/job/{job_id}").json()
            cfg = job.get("config") or {}
            tpl = cfg.get("sort_structure_template") or {}
            self.assertTrue(tpl.get("enabled"))
            self.assertEqual(len(tpl.get("modules") or []), 1)

            summary = self.client.get(f"/job/{job_id}/structure-summary")
            self.assertEqual(summary.status_code, 200)
            body = summary.json()
            self.assertEqual(body["job_id"], job_id)
            self.assertIn("distinct_roots", body)
            self.assertEqual(body["distinct_roots"], 1)

    @patch(
        "main.classify_candidates",
        return_value={
            "folder_name": "Finance",
            "confidence": 0.9,
            "reason": "budget",
            "candidate_scores": [
                {"folder_name": "Finance", "score": 0.9},
                {"folder_name": "Uncertain", "score": 0.1},
            ],
            "decision_reason": "ok",
        },
    )
    @patch(
        "main.extract_content",
        return_value={
            "text": "budget",
            "extraction_source": "plain_text",
            "quality_score": 0.9,
            "signals": {},
        },
    )
    def test_analyze_without_template_omits_config_field(self, _extract, _classify):
        with home_safe_tempdir() as tmp:
            in_dir = pathlib.Path(tmp) / "in"
            out_dir = pathlib.Path(tmp) / "out"
            in_dir.mkdir()
            out_dir.mkdir()
            src = in_dir / "a.txt"
            src.write_text("hello", encoding="utf-8")

            resp = self.client.post(
                "/analyze",
                json={
                    "file_paths": [str(src)],
                    "output_dir": str(out_dir),
                    "model": "mistral",
                    "mode": "copy",
                    "language": "English",
                },
            )
            self.assertEqual(resp.status_code, 200)
            job_id = resp.json()["job_id"]
            cfg = self.client.get(f"/job/{job_id}").json().get("config") or {}
            self.assertIsNone(cfg.get("sort_structure_template"))

    def test_analyze_rejects_invalid_template_depth(self):
        with home_safe_tempdir() as tmp:
            out_dir = pathlib.Path(tmp) / "out"
            out_dir.mkdir()
            src = pathlib.Path(tmp) / "a.txt"
            src.write_text("x", encoding="utf-8")
            too_deep = {
                "version": 1,
                "enabled": True,
                "modules": [
                    {
                        "id": "a",
                        "theme": "country",
                        "max_folders": None,
                        "overflow_policy": "merge_into_other",
                        "children": [
                            {
                                "id": "b",
                                "theme": "property",
                                "max_folders": None,
                                "overflow_policy": "merge_into_other",
                                "children": [
                                    {
                                        "id": "c",
                                        "theme": "project",
                                        "max_folders": None,
                                        "overflow_policy": "merge_into_other",
                                        "children": [
                                            {
                                                "id": "d",
                                                "theme": "work",
                                                "max_folders": None,
                                                "overflow_policy": "merge_into_other",
                                                "children": [],
                                            }
                                        ],
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
            resp = self.client.post(
                "/analyze",
                json={
                    "file_paths": [str(src)],
                    "output_dir": str(out_dir),
                    "model": "mistral",
                    "mode": "copy",
                    "language": "English",
                    "sort_structure_template": too_deep,
                },
            )
            self.assertEqual(resp.status_code, 422)


if __name__ == "__main__":
    unittest.main()
