"""Tests for ollama_storage partial blob scan and delete."""

import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from ollama_storage import (
    delete_partial_group,
    partial_group_stem,
    scan_partial_groups,
    validate_digest_prefix,
)


def _valid_digest_prefix() -> str:
    return "sha256-" + "a" * 64


class TestOllamaStorage(unittest.TestCase):
    def test_validate_digest_prefix(self):
        self.assertTrue(validate_digest_prefix(_valid_digest_prefix()))
        self.assertFalse(validate_digest_prefix("sha256-short"))
        self.assertFalse(validate_digest_prefix("../etc/passwd"))
        self.assertFalse(validate_digest_prefix(""))

    def test_partial_group_stem(self):
        d = _valid_digest_prefix()
        self.assertEqual(partial_group_stem(f"{d}-partial"), d)
        self.assertEqual(partial_group_stem(f"{d}-partial-12"), d)
        self.assertIsNone(partial_group_stem("sha256-not64hex-partial"))
        self.assertIsNone(partial_group_stem(f"{d}-complete"))

    def test_scan_partial_groups(self):
        d = _valid_digest_prefix()
        with tempfile.TemporaryDirectory() as tmp:
            b = pathlib.Path(tmp) / "blobs"
            b.mkdir()
            (b / f"{d}-partial").write_bytes(b"x" * 100)
            (b / f"{d}-partial-1").write_bytes(b"y" * 50)
            (b / f"{d}-nope").write_bytes(b"z")  # not partial — ignored
            rows = scan_partial_groups(b)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["digest_prefix"], d)
        self.assertEqual(rows[0]["total_bytes"], 150)
        self.assertEqual(rows[0]["file_count"], 2)

    def test_delete_partial_group(self):
        d = _valid_digest_prefix()
        with tempfile.TemporaryDirectory() as tmp:
            b = pathlib.Path(tmp) / "blobs"
            b.mkdir()
            (b / f"{d}-partial").write_bytes(b"a" * 10)
            (b / f"{d}-partial-2").write_bytes(b"b" * 5)
            removed, freed = delete_partial_group(b, d)
            self.assertEqual(removed, 2)
            self.assertEqual(freed, 15)
            self.assertFalse((b / f"{d}-partial").exists())

    def test_delete_invalid_prefix_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            b = pathlib.Path(tmp) / "blobs"
            b.mkdir()
            with self.assertRaises(ValueError):
                delete_partial_group(b, "not-a-digest")
