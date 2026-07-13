"""Tests for desktop sort defaults sync and voice merge."""

from __future__ import annotations

import pathlib
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import main
from actions.start_local_sort import _build_voice_sort_request
from sort_desktop_defaults import SortDesktopDefaults, clear_sort_desktop_defaults_for_tests
from sort_structure.models import SortStructureModule, SortStructureTemplate


class TestSortDesktopDefaults(unittest.TestCase):
    def setUp(self):
        clear_sort_desktop_defaults_for_tests()
        self.client = TestClient(main.app)

    def tearDown(self):
        clear_sort_desktop_defaults_for_tests()

    def test_post_accepts_structure_template(self) -> None:
        tpl = SortStructureTemplate(
            enabled=True,
            modules=[SortStructureModule(id="c", theme="country", children=[])],
        )
        resp = self.client.post(
            "/sort/desktop-defaults",
            json={
                "output_dir": "/tmp/out",
                "language": "English",
                "sort_structure_template": tpl.model_dump(),
            },
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get("ok"))

    def test_build_voice_sort_request_merges_defaults(self) -> None:
        tpl = SortStructureTemplate(
            enabled=True,
            modules=[SortStructureModule(id="c", theme="country", children=[])],
        )
        defaults = SortDesktopDefaults(
            output_dir="/Users/me/Sorted",
            language="French",
            sort_structure_template=tpl,
            sort_system_prompt="Prefer Swiss labels",
        )
        req = _build_voice_sort_request(
            file_paths=["/Users/me/doc.pdf"],
            output_dir="",
            model="mistral",
            defaults=defaults,
        )
        self.assertEqual(req.output_dir, "/Users/me/Sorted")
        self.assertEqual(req.language, "French")
        self.assertIsNotNone(req.sort_structure_template)
        assert req.sort_structure_template is not None
        self.assertTrue(req.sort_structure_template.enabled)
        self.assertEqual(req.sort_system_prompt, "Prefer Swiss labels")

    def test_voice_output_dir_param_overrides_default(self) -> None:
        defaults = SortDesktopDefaults(output_dir="/Users/me/Sorted")
        req = _build_voice_sort_request(
            file_paths=["/Users/me/doc.pdf"],
            output_dir="/Users/me/Other",
            model="mistral",
            defaults=defaults,
        )
        self.assertEqual(req.output_dir, "/Users/me/Other")


class TestStartLocalSortUsesDefaults(unittest.TestCase):
    @patch("actions.start_local_sort.expand_input_paths_uncapped", return_value=["/Users/x/a.pdf"])
    @patch("actions.start_local_sort.enqueue_analyze_job_core", return_value={"job_id": "j1"})
    @patch("actions.start_local_sort.get_voice_job_enqueue_runtime")
    @patch("actions.start_local_sort._resolve_voice_sort_model", return_value="mistral")
    @patch("actions.start_local_sort.is_remote_mode", return_value=False)
    @patch("actions.start_local_sort.list_models", return_value=["mistral"])
    def test_start_local_sort_applies_synced_template(
        self,
        _models,
        _remote,
        _resolve,
        runtime,
        enqueue,
        _expand,
    ):
        import asyncio

        from actions import start_local_sort
        from sort_desktop_defaults import set_sort_desktop_defaults

        runtime.return_value = ({}, lambda **k: None, object(), asyncio.new_event_loop())
        tpl = SortStructureTemplate(
            enabled=True,
            modules=[SortStructureModule(id="c", theme="country", children=[])],
        )
        set_sort_desktop_defaults(
            SortDesktopDefaults(output_dir=str(pathlib.Path.home() / "Sorted"), sort_structure_template=tpl)
        )
        home = pathlib.Path.home()
        sample = str(home / "Documents" / "a.pdf")
        result = start_local_sort.start_local_file_sort({"file_paths": [sample]})
        self.assertTrue(result["ok"])
        _req = enqueue.call_args[0][3]
        self.assertIsNotNone(_req.sort_structure_template)
        assert _req.sort_structure_template is not None
        self.assertTrue(_req.sort_structure_template.enabled)


if __name__ == "__main__":
    unittest.main()
