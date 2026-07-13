"""Tests for unified recall search."""

from __future__ import annotations

import importlib
import os
import tempfile
import unittest

import assistant_memory
import conversation_store
import recall_search
import tasks_store


class TestUnifiedRecallSearch(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp(prefix="recall-search-")
        os.environ["EXOSITES_DATA_DIR"] = self.tmp
        importlib.reload(assistant_memory)
        importlib.reload(conversation_store)
        importlib.reload(tasks_store)
        importlib.reload(recall_search)

    def test_empty_query_returns_results(self) -> None:
        assistant_memory.update_memory("notes", "launch", "Ship in June", conversation_id=None)
        tasks_store.create_task("Review launch deck", source="manual")
        hits = recall_search.unified_search("", limit=10)
        self.assertGreaterEqual(len(hits), 1)

    def test_task_match(self) -> None:
        tasks_store.create_task("Prepare Q3 budget", source="manual")
        hits = recall_search.unified_search("budget", limit=10)
        sources = {h["source"] for h in hits}
        self.assertIn("task", sources)
