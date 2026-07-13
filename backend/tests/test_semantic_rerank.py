"""Semantic rerank helpers (Ollama embeddings)."""

import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import semantic_rerank as sr  # noqa: E402


class TestSemanticRerank(unittest.TestCase):
    def setUp(self):
        # Reset the process-wide embedding-availability probe so a real 404 in an
        # earlier test can't short-circuit the embedding calls these tests mock.
        sr._embeddings_available = None

    def test_cosine_orthogonal(self):
        self.assertAlmostEqual(sr._cosine([1.0, 0.0], [0.0, 1.0]), 0.0, places=5)

    def test_cosine_identical(self):
        self.assertAlmostEqual(sr._cosine([0.6, 0.8], [0.6, 0.8]), 1.0, places=5)

    @patch.object(sr, "_embed")
    def test_blend_returns_false_when_query_embed_fails(self, mock_embed):
        mock_embed.return_value = None
        scores = [{"folder_name": "A", "score": 0.8}, {"folder_name": "B", "score": 0.2}]
        out, ok = sr.blend_with_semantic_scores(
            scores,
            query_text="any",
            primary_purpose=None,
            folder_contexts={},
            model="m",
        )
        self.assertFalse(ok)
        self.assertEqual(out, scores)

    @patch.object(sr, "_embed")
    def test_blend_keeps_multisegment_folder_names(self, mock_embed):
        """Embedding labels may contain slashes; output rows preserve folder_name keys."""

        def fake_embed(_model: str, prompt: str):
            # Deterministic pseudo-embedding from prompt length
            n = min(8, max(1, len(prompt) % 8))
            return [1.0 if i == n else 0.1 for i in range(8)]

        mock_embed.side_effect = fake_embed
        scores = [
            {"folder_name": "Career/Job Applications", "score": 0.5},
            {"folder_name": "Finance/Bank Statements", "score": 0.4},
        ]
        out, ok = sr.blend_with_semantic_scores(
            scores,
            query_text="resume cover letter",
            primary_purpose="job application",
            folder_contexts={
                "Career/Job Applications": {"keywords": ["cv"], "samples": []},
            },
            model="m",
        )
        self.assertTrue(ok)
        names = {row["folder_name"] for row in out}
        self.assertEqual(names, {"Career/Job Applications", "Finance/Bank Statements"})


if __name__ == "__main__":
    unittest.main()
