import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractVoiceoverSectionRanges,
  normalizeVoiceoverSectionVoices,
} from "@/lib/voiceover-section-voices";

test("normalizeVoiceoverSectionVoices keeps teacher and student voices", () => {
  const normalized = normalizeVoiceoverSectionVoices({
    teacher: {
      voiceId: "voice-emma",
      voiceName: "Emma",
    },
    student: {
      voiceId: "voice-leo",
      voiceName: "Leo",
      speed: 0.8,
      startSortOrder: 2,
      endSortOrder: 40,
    },
  });

  assert.equal(normalized.teacher?.voiceId, "voice-emma");
  assert.equal(normalized.student?.voiceId, "voice-leo");
  assert.equal(normalized.student?.speed, 0.8);
  assert.equal(normalized.student?.startSortOrder, 2);
  assert.equal(normalized.student?.endSortOrder, 40);
});

test("normalizeVoiceoverSectionVoices clamps ElevenLabs speed range", () => {
  const normalized = normalizeVoiceoverSectionVoices({
    student: {
      voiceId: "voice-leo",
      speed: 0.4,
    },
    teacher: {
      voiceId: "voice-emma",
      speed: 1.9,
    },
  });

  assert.equal(normalized.student?.speed, 0.7);
  assert.equal(normalized.teacher?.speed, 1.2);
});

test("normalizeVoiceoverSectionVoices keeps manual scene ranges", () => {
  const normalized = normalizeVoiceoverSectionVoices({
    introduction: {
      voiceId: "voice-a",
      voiceName: "Host",
      startSortOrder: 1,
      endSortOrder: 14,
    },
    lecture: {
      voiceId: "voice-b",
      startSortOrder: "15",
      endSortOrder: 80,
    },
  });

  assert.equal(normalized.introduction?.startSortOrder, 1);
  assert.equal(normalized.introduction?.endSortOrder, 14);
  assert.equal(normalized.lecture?.startSortOrder, 15);
  assert.equal(normalized.lecture?.endSortOrder, 80);
});

test("extractVoiceoverSectionRanges ignores incomplete ranges", () => {
  const ranges = extractVoiceoverSectionRanges({
    introduction: {
      voiceId: "voice-a",
      startSortOrder: 1,
      endSortOrder: 14,
    },
    lecture: {
      voiceId: "voice-b",
      startSortOrder: 15,
    },
  });

  assert.deepEqual(ranges, {
    introduction: { startSortOrder: 1, endSortOrder: 14 },
  });
});
