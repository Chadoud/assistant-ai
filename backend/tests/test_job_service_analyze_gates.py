"""Integration-style tests for JobService.analyze_files classification gates."""

import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import analyze_policy as analyze_policy_mod  # noqa: E402
from constants import (  # noqa: E402
    CANDIDATE_MARGIN_THRESHOLD,
    CONFIDENCE_THRESHOLD,
    EMPTY_FOLDER,
    LLM_TRUST_FOR_WEAK_RERANK,
    NEW_FOLDER_MIN_QUALITY,
    RERANK_WEAK_FLOOR,
    UNCERTAIN_FOLDER,
)
from job_service import JobService  # noqa: E402


class _FakeContext:
    def folder_names(self):
        return []

    def get_folder_contexts(self):
        return {}


def _base_job(tmp: pathlib.Path, *, min_confidence=None):
    out = tmp / "out"
    out.mkdir()
    (out / "HR").mkdir()
    src = tmp / "doc.txt"
    src.write_text("some content for classification", encoding="utf-8")
    cfg = {
        "output_dir": str(out),
        "model": "mistral",
        "mode": "copy",
        "language": "English",
        "vision_model": None,
        "rules": [],
        "dry_run": False,
        "on_collision": "uniquify",
        "min_confidence": min_confidence,
    }
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
        "config": cfg,
        "files": [
            {
                "path": str(src),
                "name": "doc.txt",
                "status": "pending",
            }
        ],
    }


class TestJobServiceAnalyzeGates(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        super().setUp()
        self._patch_brief = patch("sort_analyze_row.brief_document_for_filing", return_value=None)
        self._patch_lang = patch("sort_analyze_row.detect_document_language", return_value="English")
        self._patch_cloud = patch("cloud_sort.config.cloud_sort_worker_enabled", return_value=False)
        self._patch_brief.start()
        self._patch_lang.start()
        self._patch_cloud.start()

    def tearDown(self):
        self._patch_brief.stop()
        self._patch_lang.stop()
        self._patch_cloud.stop()
        super().tearDown()
    def _make_service(self, jobs: dict, **kwargs):
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
            get_folder_tree=kwargs.get("get_folder_tree", lambda d: []),
            uncertain_folder=UNCERTAIN_FOLDER,
            confidence_threshold=CONFIDENCE_THRESHOLD,
        )
        return JobService(**defaults)

    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_low_extraction_quality_files_to_empty(self, _lm):
        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            job = _base_job(tmp)
            jobs = {"j1": job}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "enough text",
                    "extraction_source": "plain_text",
                    "quality_score": 0.1,
                    "signals": {},
                }

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "HR",
                    "confidence": 0.95,
                    "reason": "HR terms",
                    "candidate_scores": [
                        {"folder_name": "HR", "score": 0.95},
                        {"folder_name": "Uncertain", "score": 0.1},
                    ],
                    "decision_reason": "ok",
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
                get_folder_tree=lambda d: [{"name": "HR", "path": str(pathlib.Path(d) / "HR"), "files": []}],
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertEqual(row["suggested_folder"], EMPTY_FOLDER)
        self.assertIn("Empty", row["reason"])

    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_ambiguous_margin_forces_uncertain(self, _lm):
        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            job = _base_job(tmp)
            (pathlib.Path(job["config"]["output_dir"]) / "Invoices").mkdir()
            jobs = {"j1": job}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "enough text",
                    "extraction_source": "plain_text",
                    "quality_score": 0.9,
                    "signals": {},
                }

            close_a = 0.51
            close_b = 0.50
            self.assertLess(abs(close_a - close_b), CANDIDATE_MARGIN_THRESHOLD)

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "HR",
                    "confidence": 0.95,
                    "reason": "tie",
                    "candidate_scores": [
                        {"folder_name": "HR", "score": close_a},
                        {"folder_name": "Invoices", "score": close_b},
                    ],
                    "decision_reason": "margin small",
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
                get_folder_tree=lambda d: [
                    {"name": "HR", "path": str(pathlib.Path(d) / "HR"), "files": []},
                    {"name": "Invoices", "path": str(pathlib.Path(d) / "Invoices"), "files": []},
                ],
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertEqual(row["suggested_folder"], UNCERTAIN_FOLDER)
        self.assertIn("Ambiguous", row["reason"])

    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_ambiguous_margin_keeps_confident_llm_pick(self, _lm):
        """Tight top-2 margin but model is confident → file to LLM folder instead of Uncertain."""
        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            job = _base_job(tmp)
            (pathlib.Path(job["config"]["output_dir"]) / "Invoices").mkdir()
            jobs = {"j1": job}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "enough text",
                    "extraction_source": "plain_text",
                    "quality_score": 0.9,
                    "signals": {},
                }

            close_a = 0.51
            close_b = 0.50
            self.assertLess(abs(close_a - close_b), CANDIDATE_MARGIN_THRESHOLD)

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "HR",
                    "confidence": 0.95,
                    "reason": "tie",
                    "llm_folder_name": "Invoices",
                    "llm_confidence": LLM_TRUST_FOR_WEAK_RERANK + 0.02,
                    "rerank_top_score": close_a,
                    "candidate_scores": [
                        {"folder_name": "HR", "score": close_a},
                        {"folder_name": "Invoices", "score": close_b},
                    ],
                    "decision_reason": "margin small",
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
                get_folder_tree=lambda d: [
                    {"name": "HR", "path": str(pathlib.Path(d) / "HR"), "files": []},
                    {"name": "Invoices", "path": str(pathlib.Path(d) / "Invoices"), "files": []},
                ],
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertEqual(row["suggested_folder"], "Invoices")
        self.assertNotIn("Ambiguous folder match", row["reason"])

    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_low_extraction_strong_filename_keeps_ai_folder(self, _lm):
        """Thin body text but filename clearly signals category → still sort (UX: no manual OCR fix)."""
        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            job = _base_job(tmp)
            bank = tmp / "01Relevé_bancaire - ChadyKassab.jpeg"
            bank.write_bytes(b"\xff\xd8\xff placeholder")
            job["files"][0]["path"] = str(bank)
            job["files"][0]["name"] = bank.name
            jobs = {"j1": job}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "almost nothing",
                    "extraction_source": "image_ocr",
                    "quality_score": 0.12,
                    "signals": {},
                }

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "Bank Statements",
                    "confidence": 0.9,
                    "reason": "releve",
                    "llm_folder_name": "Bank Statements",
                    "llm_confidence": 0.92,
                    "rerank_top_score": 0.2,
                    "candidate_scores": [
                        {"folder_name": "Bank Statements", "score": 0.2},
                        {"folder_name": "HR", "score": 0.05},
                    ],
                    "decision_reason": "x",
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
                get_folder_tree=lambda d: [{"name": "HR", "path": str(pathlib.Path(d) / "HR"), "files": []}],
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertEqual(row["suggested_folder"], "Bank Statements")
        self.assertNotIn("No usable extracted content", row["reason"])

    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_ambiguous_weak_rerank_trusts_llm_folder(self, _lm):
        """Tight top-2 margin but weak lexical scores → keep LLM pick if confident."""
        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            job = _base_job(tmp)
            out_dir = pathlib.Path(job["config"]["output_dir"])
            (out_dir / "Finance").mkdir()
            (out_dir / "EmploymentRecords").mkdir()
            jobs = {"j1": job}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "enough text",
                    "extraction_source": "plain_text",
                    "quality_score": 0.9,
                    "signals": {},
                }

            close_a = 0.22
            close_b = 0.21
            self.assertLess(abs(close_a - close_b), CANDIDATE_MARGIN_THRESHOLD)
            self.assertLess(close_a, RERANK_WEAK_FLOOR)

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "EmploymentRecords",
                    "confidence": 0.22,
                    "reason": "transactions",
                    "llm_folder_name": "Finance",
                    "llm_confidence": 0.92,
                    "rerank_top_score": close_a,
                    "candidate_scores": [
                        {"folder_name": "EmploymentRecords", "score": close_a},
                        {"folder_name": "Finance", "score": close_b},
                    ],
                    "decision_reason": "tie weak",
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
                get_folder_tree=lambda d: [
                    {"name": "EmploymentRecords", "path": str(pathlib.Path(d) / "EmploymentRecords"), "files": []},
                    {"name": "Finance", "path": str(pathlib.Path(d) / "Finance"), "files": []},
                ],
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertEqual(row["suggested_folder"], "Finance")
        self.assertNotIn("Ambiguous", row["reason"])

    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_min_confidence_job_config_forces_uncertain(self, _lm):
        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            job = _base_job(tmp, min_confidence=0.95)
            jobs = {"j1": job}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "enough text",
                    "extraction_source": "plain_text",
                    "quality_score": 0.9,
                    "signals": {},
                }

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "HR",
                    "confidence": 0.7,
                    "reason": "ok",
                    "candidate_scores": [
                        {"folder_name": "HR", "score": 0.95},
                        {"folder_name": "X", "score": 0.1},
                    ],
                    "decision_reason": "clear",
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
                get_folder_tree=lambda d: [{"name": "HR", "path": str(pathlib.Path(d) / "HR"), "files": []}],
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertEqual(row["suggested_folder"], UNCERTAIN_FOLDER)
        self.assertIn("Low confidence", row["reason"])

    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_new_folder_blocked_when_quality_below_new_folder_min(self, _lm):
        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            job = _base_job(tmp)
            jobs = {"j1": job}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "enough text",
                    "extraction_source": "plain_text",
                    "quality_score": 0.5,
                    "signals": {},
                }
            self.assertLess(0.5, NEW_FOLDER_MIN_QUALITY)

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "NovelCategory",
                    "confidence": 0.99,
                    "reason": "new",
                    "candidate_scores": [
                        {"folder_name": "NovelCategory", "score": 0.99},
                        {"folder_name": "HR", "score": 0.1},
                    ],
                    "decision_reason": "clear",
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
                get_folder_tree=lambda d: [{"name": "HR", "path": str(pathlib.Path(d) / "HR"), "files": []}],
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertEqual(row["suggested_folder"], UNCERTAIN_FOLDER)
        self.assertIn("New folder blocked", row["reason"])

    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_sorting_rule_target_folder_overrides_ai(self, _lm):
        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            job = _base_job(tmp)
            job["config"]["rules"] = [
                {
                    "id": "r-pay",
                    "enabled": True,
                    "priority": 10,
                    "pattern": "doc.txt",
                    "action": "target_folder",
                    "folder": "Payroll",
                }
            ]
            jobs = {"j1": job}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "enough text",
                    "extraction_source": "plain_text",
                    "quality_score": 0.9,
                    "signals": {},
                }

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "HR",
                    "confidence": 0.92,
                    "reason": "HR",
                    "candidate_scores": [
                        {"folder_name": "HR", "score": 0.92},
                        {"folder_name": "Uncertain", "score": 0.05},
                    ],
                    "decision_reason": "clear",
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
                get_folder_tree=lambda d: [{"name": "HR", "path": str(pathlib.Path(d) / "HR"), "files": []}],
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertEqual(row["suggested_folder"], "Payroll")
        self.assertEqual(row["rule_applied_id"], "r-pay")
        self.assertIn("Sorting rule", row["reason"])
        self.assertGreaterEqual(row["confidence"], 0.95)

    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_sorting_rule_skip_forces_uncertain(self, _lm):
        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            job = _base_job(tmp)
            job["config"]["rules"] = [
                {
                    "id": "r-skip",
                    "enabled": True,
                    "priority": 10,
                    "pattern": "doc.txt",
                    "action": "skip",
                }
            ]
            jobs = {"j1": job}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "enough text",
                    "extraction_source": "plain_text",
                    "quality_score": 0.9,
                    "signals": {},
                }

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "HR",
                    "confidence": 0.99,
                    "reason": "clear",
                    "candidate_scores": [
                        {"folder_name": "HR", "score": 0.99},
                        {"folder_name": "X", "score": 0.1},
                    ],
                    "decision_reason": "clear",
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
                get_folder_tree=lambda d: [{"name": "HR", "path": str(pathlib.Path(d) / "HR"), "files": []}],
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertEqual(row["suggested_folder"], UNCERTAIN_FOLDER)
        self.assertEqual(row["rule_applied_id"], "r-skip")
        self.assertIn("skip (manual review)", row["reason"])

    @patch.object(analyze_policy_mod, "CONFIDENCE_GATE_MIN_WHEN_DISAGREE", True)
    @patch("job_service_analyze_runtime.list_models", return_value=[])
    async def test_confidence_min_blend_when_llm_disagrees(self, _lm):
        with tempfile.TemporaryDirectory() as raw:
            tmp = pathlib.Path(raw)
            job = _base_job(tmp)
            jobs = {"j1": job}

            def extract_content(_path, _vm, _tesseract_lang=None, _tesseract_langs=None, _tesseract_auto=True):
                return {
                    "text": "enough text for quality",
                    "extraction_source": "plain_text",
                    "quality_score": 0.9,
                    "signals": {},
                }

            def classify_candidates(*_a, **_k):
                return {
                    "folder_name": "HR",
                    "confidence": 0.92,
                    "reason": "overlap",
                    "classification_disagree": True,
                    "llm_confidence": 0.4,
                    "rerank_top_score": 0.93,
                    "candidate_scores": [
                        {"folder_name": "HR", "score": 0.93},
                        {"folder_name": "X", "score": 0.1},
                    ],
                    "decision_reason": "disagree",
                }

            svc = self._make_service(
                jobs,
                extract_content=extract_content,
                classify_candidates=classify_candidates,
                get_folder_tree=lambda d: [{"name": "HR", "path": str(pathlib.Path(d) / "HR"), "files": []}],
            )
            await svc.analyze_files("j1", False, False)

        row = jobs["j1"]["files"][0]
        self.assertEqual(row["suggested_folder"], UNCERTAIN_FOLDER)
        self.assertIn("Low confidence", row["reason"])
        self.assertAlmostEqual(row["llm_confidence"], 0.4, places=2)
        self.assertAlmostEqual(row["rerank_top_score"], 0.93, places=2)


if __name__ == "__main__":
    unittest.main()
