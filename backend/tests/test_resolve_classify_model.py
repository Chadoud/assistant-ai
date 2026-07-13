"""Tests for resolving the classify model against installed Ollama models."""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from classifier_ollama import resolve_classify_model


class TestResolveClassifyModel(unittest.TestCase):
    def test_exact_match_wins(self):
        models = ["qwen2.5:3b", "mistral-nemo:latest"]
        self.assertEqual(resolve_classify_model(models, "qwen2.5:3b"), "qwen2.5:3b")

    def test_latest_tag_is_ignored_on_match(self):
        self.assertEqual(
            resolve_classify_model(["mistral-nemo:latest"], "mistral-nemo"),
            "mistral-nemo:latest",
        )

    def test_family_match_maps_default_mistral_to_installed_nemo(self):
        # The hardcoded "mistral" default should resolve to the user's mistral-nemo.
        models = ["llava:13b", "moondream:latest", "mistral-nemo:latest", "qwen2.5:3b"]
        self.assertEqual(resolve_classify_model(models, "mistral"), "mistral-nemo:latest")

    def test_falls_back_to_first_non_vision_model(self):
        # Preferred not present and no family match → skip vision-only models.
        models = ["llava:13b", "moondream:latest", "qwen2.5:3b"]
        self.assertEqual(resolve_classify_model(models, "mistral"), "qwen2.5:3b")

    def test_uses_any_model_when_only_vision_installed(self):
        models = ["llava:13b", "moondream:latest"]
        self.assertEqual(resolve_classify_model(models, "mistral"), "llava:13b")

    def test_none_when_nothing_installed(self):
        self.assertIsNone(resolve_classify_model([], "mistral"))


if __name__ == "__main__":
    unittest.main()
