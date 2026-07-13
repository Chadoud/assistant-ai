"""Tests for phonetic/fuzzy contact name resolution."""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from actions.contact_matching import (
    Candidate,
    jaro_winkler,
    name_similarity,
    rank_candidates,
    soundex,
    tokenize_name,
)


class TestPrimitives(unittest.TestCase):
    def test_tokenize_drops_short_and_punctuation(self):
        self.assertEqual(tokenize_name("Chády  Kassab!"), ["chady", "kassab"])
        self.assertEqual(tokenize_name("J. R. Tolkien"), ["tolkien"])

    def test_jaro_winkler_bounds(self):
        self.assertEqual(jaro_winkler("kassab", "kassab"), 1.0)
        self.assertEqual(jaro_winkler("", "x"), 0.0)
        self.assertGreater(jaro_winkler("chady", "shady"), 0.8)

    def test_soundex_matches_homophones(self):
        self.assertEqual(soundex("kassab"), soundex("kassab"))
        # Same trailing consonants encode alike regardless of vowels.
        self.assertEqual(soundex("robert"), soundex("rupert"))


class TestNameSimilarity(unittest.TestCase):
    def test_misheard_first_name_still_matches(self):
        # "Shady" (misheard) vs real "Chady", surname spelled the same.
        self.assertGreater(name_similarity("Shady Kassab", "Chady Kassab"), 0.86)

    def test_unrelated_name_scores_below_medium(self):
        # Stays under the medium-confidence cutoff so it is never auto-sent or
        # confidently suggested, even though "Shady"/"Shannon" share a prefix.
        self.assertLess(name_similarity("Shady Kassab", "Shannon Vaeao"), 0.70)

    def test_partial_query_matches_full_name(self):
        # User only said the surname.
        self.assertGreater(name_similarity("Kassab", "Chady Kassab"), 0.86)


class TestRankCandidates(unittest.TestCase):
    def _candidates(self):
        return [
            Candidate(name="Shannon Vaeao", email="shannon@spring.example", frequency=2),
            Candidate(name="Chady Kassab", email="chadykassab@gmail.com", frequency=5),
            Candidate(name="Century Finance", email="news@century.example", frequency=9),
        ]

    def test_best_match_is_phonetic_winner(self):
        ranked = rank_candidates("Shady Kassab", self._candidates())
        self.assertEqual(ranked[0].email, "chadykassab@gmail.com")
        self.assertEqual(ranked[0].confidence, "high")

    def test_matches_email_local_part_without_display_name(self):
        cands = [Candidate(name="", email="chady.kassab@gmail.com", frequency=1)]
        ranked = rank_candidates("Chady Kassab", cands)
        self.assertEqual(ranked[0].email, "chady.kassab@gmail.com")
        self.assertGreaterEqual(ranked[0].score, 0.86)

    def test_dedupes_and_respects_limit(self):
        cands = [
            Candidate(name="Chady Kassab", email="chadykassab@gmail.com"),
            Candidate(name="Chady K", email="ChadyKassab@gmail.com"),
        ]
        ranked = rank_candidates("Chady", cands, limit=5)
        self.assertEqual(len(ranked), 1)


if __name__ == "__main__":
    unittest.main()
