"""Unit tests for WhisperX align helpers (no model load required)."""

from __future__ import annotations

import unittest

from server import build_alignment_segments, postprocess_aligned_words


class BuildAlignmentSegmentsTests(unittest.TestCase):
    def test_short_clip_uses_single_full_duration_segment(self):
        text = "Waiting feels safe. But waiting has a cost. Every month you delay."
        segments = build_alignment_segments(text, duration=12.0)
        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0]["start"], 0.0)
        self.assertEqual(segments[0]["end"], 12.0)
        self.assertIn("Waiting feels safe", segments[0]["text"])

    def test_long_clip_uses_proportional_sentence_windows(self):
        # Force multi-segment path: long duration AND many words (> max thresholds).
        sentences = [
            "One short hook line here.",
            " ".join(["body"] * 70) + ".",
            " ".join(["closing"] * 40) + ".",
        ]
        text = " ".join(sentences)
        duration = 90.0
        segments = build_alignment_segments(text, duration=duration)
        self.assertGreater(len(segments), 1)
        self.assertEqual(segments[0]["start"], 0.0)
        self.assertEqual(segments[-1]["end"], duration)
        # Middle body has more words → should get a longer window than the hook.
        hook_len = segments[0]["end"] - segments[0]["start"]
        body_len = segments[1]["end"] - segments[1]["start"]
        self.assertGreater(body_len, hook_len)
        # Must NOT be equal-time slices.
        equal = duration / len(segments)
        self.assertNotAlmostEqual(hook_len, equal, places=2)

    def test_rejects_empty_text(self):
        with self.assertRaises(Exception):
            build_alignment_segments("   ", duration=5.0)


class PostprocessAlignedWordsTests(unittest.TestCase):
    def test_fixes_overlap_and_expands_tiny_words(self):
        words = [
            {"word": "Hello", "start": 0.0, "end": 0.4},
            {"word": "a", "start": 0.35, "end": 0.36},  # overlap + tiny
            {"word": "world", "start": 0.5, "end": 0.9},
        ]
        out = postprocess_aligned_words(words, duration=1.0, min_word_dur=0.05)
        self.assertEqual([w["word"] for w in out], ["Hello", "a", "world"])
        for index in range(1, len(out)):
            self.assertGreaterEqual(out[index]["start"], out[index - 1]["end"] - 1e-9)
        self.assertGreaterEqual(out[1]["end"] - out[1]["start"], 0.05 - 1e-9)

    def test_clamps_to_duration(self):
        words = [{"word": "End", "start": 9.5, "end": 12.0}]
        out = postprocess_aligned_words(words, duration=10.0, min_word_dur=0.05)
        self.assertEqual(len(out), 1)
        self.assertLessEqual(out[0]["end"], 10.0)
        self.assertGreaterEqual(out[0]["start"], 0.0)


if __name__ == "__main__":
    unittest.main()
