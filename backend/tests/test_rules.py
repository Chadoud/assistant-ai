import unittest

from rules import UserRule, first_matching_rule


class TestRules(unittest.TestCase):
    def test_priority_wins(self):
        rules = [
            UserRule(id="a", enabled=True, priority=1, pattern="*.pdf", action="target_folder", folder="Low"),
            UserRule(id="b", enabled=True, priority=10, pattern="*.pdf", action="target_folder", folder="High"),
        ]
        m = first_matching_rule("/tmp/x/invoice.pdf", [r.model_dump() for r in rules])
        self.assertIsNotNone(m)
        assert m is not None
        self.assertEqual(m.folder, "High")

    def test_skip(self):
        rules = [UserRule(id="s", enabled=True, priority=5, pattern="secret*", action="skip", folder=None)]
        m = first_matching_rule("/x/secret_note.txt", [r.model_dump() for r in rules])
        self.assertIsNotNone(m)
        assert m is not None
        self.assertTrue(m.skip)

    def test_disabled_ignored(self):
        rules = [
            UserRule(id="off", enabled=False, priority=99, pattern="*.txt", action="target_folder", folder="X"),
        ]
        self.assertIsNone(first_matching_rule("/a/b.txt", [r.model_dump() for r in rules]))


if __name__ == "__main__":
    unittest.main()
