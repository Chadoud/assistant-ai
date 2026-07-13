"""Spreadsheet extraction: multi-sheet xlsx, row budget, quality heuristic."""

from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import ingestor
from constants import EXTRACTION_UNCERTAIN_QUALITY, MAX_CHARS
from ingest_common import estimate_spreadsheet_quality


class TestIngestorSpreadsheet(unittest.TestCase):
    def test_xlsx_multisheet_includes_second_sheet_name(self) -> None:
        pd = __import__("pandas")

        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp) / "book.xlsx"
            with pd.ExcelWriter(p, engine="openpyxl") as w:
                pd.DataFrame({"cola": [1, 2], "colb": ["alpha", "bravo"]}).to_excel(
                    w, sheet_name="Summary", index=False
                )
                pd.DataFrame({"amount": [100.0], "note": ["totals here"]}).to_excel(
                    w, sheet_name="Details", index=False
                )
            text = ingestor._extract_spreadsheet(str(p), ".xlsx")
            self.assertIn("Summary", text)
            self.assertIn("Details", text)
            self.assertIn("alpha", text)
            self.assertIn("totals", text.lower())
            self.assertLessEqual(len(text), MAX_CHARS)

    def test_xlsx_all_numeric_columns_formats_without_join_error(self) -> None:
        """Regression: openpyxl/pandas can leave floats in rows; join() requires str parts."""
        pd = __import__("pandas")

        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp) / "floats.xlsx"
            with pd.ExcelWriter(p, engine="openpyxl") as w:
                pd.DataFrame({"q1": [100.0, 200.5], "q2": [0.0, 1.25]}).to_excel(w, sheet_name="Data", index=False)
            text = ingestor._extract_spreadsheet(str(p), ".xlsx")
            self.assertIn("Data", text)
            self.assertIn("100", text)

    def test_spreadsheet_numeric_heuristic_not_always_subfloor(self) -> None:
        """Many digits + pipes should still score above the uncertain gate when rows exist."""
        body = "=== s1 ===\n" + "a | b | c\n" + "\n".join(f"{i} | {i * 2} | x{i}" for i in range(30))
        q = estimate_spreadsheet_quality(body)
        self.assertGreaterEqual(q, EXTRACTION_UNCERTAIN_QUALITY)


if __name__ == "__main__":
    unittest.main()
