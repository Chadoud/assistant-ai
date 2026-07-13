"""Tests for path_expand.expand_input_paths."""

import pathlib
import sys
import tempfile
import unittest

# Allow importing backend modules when run from repo root or backend/
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from path_expand import expand_input_paths, expand_input_paths_capped


class TestExpandInputPaths(unittest.TestCase):
    def test_file_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "out"
            out.mkdir()
            f = pathlib.Path(tmp) / "a.txt"
            f.write_text("hi", encoding="utf-8")
            expanded, err = expand_input_paths([str(f)], str(out))
            self.assertIsNone(err)
            self.assertEqual(expanded, [str(f.resolve())])

    def test_nested_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "out"
            out.mkdir()
            sub = pathlib.Path(tmp) / "root" / "nested"
            sub.mkdir(parents=True)
            f1 = sub / "one.txt"
            f1.write_text("a", encoding="utf-8")
            f2 = pathlib.Path(tmp) / "root" / "two.txt"
            f2.write_text("b", encoding="utf-8")
            root = pathlib.Path(tmp) / "root"
            expanded, err = expand_input_paths([str(root)], str(out))
            self.assertIsNone(err)
            self.assertEqual(len(expanded), 2)
            self.assertEqual(set(expanded), {str(f1.resolve()), str(f2.resolve())})

    def test_skips_ds_store_and_os_junk(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "out"
            out.mkdir()
            root = pathlib.Path(tmp) / "folder"
            root.mkdir()
            (root / ".DS_Store").write_bytes(b"\x00")
            (root / "Thumbs.db").write_bytes(b"\x00")
            good = root / "real.txt"
            good.write_text("ok", encoding="utf-8")
            expanded, err = expand_input_paths([str(root)], str(out))
            self.assertIsNone(err)
            self.assertEqual(expanded, [str(good.resolve())])

    def test_skips_node_modules(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "out"
            out.mkdir()
            nm = pathlib.Path(tmp) / "proj" / "node_modules" / "pkg"
            nm.mkdir(parents=True)
            bad = nm / "bad.js"
            bad.write_text("x", encoding="utf-8")
            good = pathlib.Path(tmp) / "proj" / "ok.txt"
            good.write_text("y", encoding="utf-8")
            proj = pathlib.Path(tmp) / "proj"
            expanded, err = expand_input_paths([str(proj)], str(out))
            self.assertIsNone(err)
            self.assertEqual(expanded, [str(good.resolve())])

    def test_excludes_files_under_output_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "sorted"
            out.mkdir()
            inside = out / "already.txt"
            inside.write_text("z", encoding="utf-8")
            outside = pathlib.Path(tmp) / "inbox" / "new.txt"
            outside.parent.mkdir(parents=True)
            outside.write_text("n", encoding="utf-8")
            inbox = pathlib.Path(tmp) / "inbox"
            expanded, err = expand_input_paths([str(inbox), str(inside)], str(out))
            self.assertIsNone(err)
            self.assertEqual(expanded, [str(outside.resolve())])

    def test_max_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "out"
            out.mkdir()
            d = pathlib.Path(tmp) / "many"
            d.mkdir()
            for i in range(5):
                (d / f"f{i}.txt").write_text("x", encoding="utf-8")
            expanded, err = expand_input_paths([str(d)], str(out), max_files=3)
            self.assertIsNotNone(err)
            self.assertIn("Too many", err)
            self.assertEqual(expanded, [])

    def test_capped_truncates_instead_of_erroring(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "out"
            out.mkdir()
            d = pathlib.Path(tmp) / "many"
            d.mkdir()
            for i in range(5):
                (d / f"f{i}.txt").write_text("x", encoding="utf-8")
            expanded, truncated = expand_input_paths_capped([str(d)], str(out), max_files=3)
            self.assertTrue(truncated)
            self.assertEqual(len(expanded), 3)

    def test_capped_not_truncated_when_under_cap(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "out"
            out.mkdir()
            d = pathlib.Path(tmp) / "few"
            d.mkdir()
            for i in range(2):
                (d / f"f{i}.txt").write_text("x", encoding="utf-8")
            expanded, truncated = expand_input_paths_capped([str(d)], str(out), max_files=5)
            self.assertFalse(truncated)
            self.assertEqual(len(expanded), 2)

    def test_skips_connector_import_staging_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "out"
            out.mkdir()
            root = pathlib.Path(tmp) / "Documents"
            root.mkdir()
            # Import byproducts left in the home tree by previous Gmail/cloud sorts.
            gmail_staging = root / ".exosites_gmail_stream" / "abc"
            gmail_staging.mkdir(parents=True)
            (gmail_staging / "message.txt").write_text("mail", encoding="utf-8")
            drive_staging = root / "drive_sort_staging" / "def"
            drive_staging.mkdir(parents=True)
            (drive_staging / "doc.pdf").write_text("drive", encoding="utf-8")
            # A genuine user document that should still be sorted.
            good = root / "resume.txt"
            good.write_text("ok", encoding="utf-8")
            expanded, err = expand_input_paths([str(root)], str(out))
            self.assertIsNone(err)
            self.assertEqual(expanded, [str(good.resolve())])

    def test_deduplicate(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "out"
            out.mkdir()
            f = pathlib.Path(tmp) / "x.txt"
            f.write_text("a", encoding="utf-8")
            expanded, err = expand_input_paths([str(f), str(f)], str(out))
            self.assertIsNone(err)
            self.assertEqual(len(expanded), 1)


if __name__ == "__main__":
    unittest.main()
