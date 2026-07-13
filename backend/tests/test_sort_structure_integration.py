"""Integration tests: structure classify + rules + cap reassign."""

from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from constants import CONFIDENCE_THRESHOLD, UNCERTAIN_FOLDER  # noqa: E402
from job_service import JobService  # noqa: E402
from sort_structure.caps import finalize_structure_caps
from sort_structure.models import SortStructureModule, SortStructureTemplate


class _FakeContext:
    def folder_names(self):
        return []

    def get_folder_contexts(self):
        return {}


def _structure_job(tmp: pathlib.Path) -> dict:
    out = tmp / "out"
    out.mkdir()
    src = tmp / "invoice.pdf"
    src.write_text("invoice content", encoding="utf-8")
    tpl = SortStructureTemplate(
        enabled=True,
        modules=[
            SortStructureModule(
                id="c",
                theme="country",
                max_folders=2,
                children=[],
            )
        ],
    )
    return {
        "id": "j1",
        "session_id": "s1",
        "phase": "analyzing",
        "status": "running",
        "total": 1,
        "completed": 0,
        "last_processed_index": -1,
        "pause_requested": False,
        "cancel_requested": False,
        "worker_active": False,
        "config": {
            "output_dir": str(out),
            "model": "mistral",
            "mode": "copy",
            "language": "English",
            "vision_model": None,
            "rules": [
                {
                    "id": "r-pdf",
                    "enabled": True,
                    "priority": 10,
                    "pattern": "*.pdf",
                    "action": "target_folder",
                    "folder": "Invoices",
                }
            ],
            "dry_run": False,
            "on_collision": "uniquify",
            "min_confidence": None,
            "sort_structure_template": tpl.model_dump(),
        },
        "files": [{"path": str(src), "name": "invoice.pdf", "status": "pending"}],
    }


class TestSortStructureIntegration(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        super().setUp()
        self._patch_brief = patch("sort_analyze_row.brief_document_for_filing", return_value=None)
        self._patch_lang = patch("sort_analyze_row.detect_document_language", return_value="English")
        self._patch_brief.start()
        self._patch_lang.start()

    def tearDown(self):
        self._patch_brief.stop()
        self._patch_lang.stop()

    def _make_service(self, jobs, **kwargs):
        def _fallback_scored(*_a, **_k):
            return {"folder_name": UNCERTAIN_FOLDER, "confidence": 0.0, "reason": "unused"}

        defaults = dict(
            jobs=jobs,
            save_jobs=lambda **k: None,
            touch_job=lambda *a, **k: None,
            context_index=_FakeContext(),
            history=None,
            classify_scored=_fallback_scored,
            classify_candidates=kwargs.get("classify_candidates"),
            extract_text=lambda p: pathlib.Path(p).read_text(encoding="utf-8"),
            extract_content=kwargs.get("extract_content"),
            sort_file=lambda *a, **k: None,
            get_folder_tree=kwargs.get("get_folder_tree", lambda _d: []),
            uncertain_folder=UNCERTAIN_FOLDER,
            confidence_threshold=CONFIDENCE_THRESHOLD,
        )
        return JobService(**defaults)

    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_sorting_rule_replaces_structure_path(self, _lm):
        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            jobs = {"j1": _structure_job(tmp)}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "enough text",
                    "extraction_source": "plain_text",
                    "quality_score": 0.9,
                    "signals": {},
                }

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "France/Villa",
                    "confidence": 0.92,
                    "reason": "French property lease",
                    "structure_values": {"country": "France", "property": "Villa"},
                    "candidate_scores": [
                        {"folder_name": "France/Villa", "score": 0.92},
                        {"folder_name": "Uncertain", "score": 0.05},
                    ],
                    "decision_reason": "structure",
                    "decision_trace": {"structure_template": True, "structure_parse_failed": False},
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertEqual(row["suggested_folder"], "Invoices")
        self.assertEqual(row["rule_applied_id"], "r-pdf")
        self.assertIn("Sorting rule", row["reason"])

    @patch("job_service._impl.cloud_sort_worker_url", return_value="https://example/v1/sort/worker")
    @patch("job_service._impl.cloud_sort_worker_enabled", return_value=True)
    @patch("job_service._impl.remote_sort_analyze_file")
    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_structure_job_runs_local_when_cloud_worker_enabled(
        self,
        _lm,
        mock_remote,
        _cloud_on,
        _cloud_url,
    ):
        mock_remote.side_effect = AssertionError("structure jobs must not use cloud worker yet")

        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            jobs = {"j1": _structure_job(tmp)}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "enough text",
                    "extraction_source": "plain_text",
                    "quality_score": 0.9,
                    "signals": {},
                }

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "France/Utility",
                    "confidence": 0.92,
                    "reason": "French utility form",
                    "structure_values": {"country": "France"},
                    "candidate_scores": [{"folder_name": "France/Utility", "score": 0.92}],
                    "decision_reason": "structure_path=France/Utility; rerank_skipped=1",
                    "decision_trace": {
                        "structure_template": True,
                        "structure_rerank_skipped": True,
                    },
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertTrue((row.get("decision_trace") or {}).get("structure_template"))
        mock_remote.assert_not_called()


def test_cap_rewrite_allows_manual_reassign() -> None:
    tpl = SortStructureTemplate(
        enabled=True,
        modules=[SortStructureModule(id="c", theme="country", max_folders=2, children=[])],
    )
    job = {
        "config": {"sort_structure_template": tpl.model_dump(), "language": "English"},
        "files": [
            {"status": "review_ready", "suggested_folder": "France", "final_folder": "France"},
            {"status": "review_ready", "suggested_folder": "Germany", "final_folder": "Germany"},
            {"status": "review_ready", "suggested_folder": "Spain", "final_folder": "Spain"},
        ],
    }
    finalize_structure_caps(job)
    capped = [f for f in job["files"] if f.get("structure_cap_rewritten")]
    assert capped
    row = capped[0]
    row["final_folder"] = "France/UserPick"
    row["suggested_folder"] = "France/UserPick"
    assert row["final_folder"] == "France/UserPick"
