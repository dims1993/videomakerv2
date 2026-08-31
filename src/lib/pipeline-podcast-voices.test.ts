import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultPodcastPipelineSectionVoices,
  isPodcastPipelineChannel,
  mergePipelineSectionVoicesForVideo,
  primaryPipelineTtsProvider,
} from "@/lib/pipeline-podcast-voices";

test("isPodcastPipelineChannel matches podcast channel key", () => {
  assert.equal(isPodcastPipelineChannel("podcast-english-lessons"), true);
  assert.equal(isPodcastPipelineChannel("wealth-insights"), false);
});

test("defaultPodcastPipelineSectionVoices seeds teacher and student", () => {
  const voices = defaultPodcastPipelineSectionVoices("google");
  assert.equal(voices.teacher?.voiceId, "en-US-Chirp3-HD-Fenrir");
  assert.equal(voices.student?.voiceId, "en-US-Chirp3-HD-Erinome");
  assert.equal(voices.student?.speed, 0.9);
});

test("primaryPipelineTtsProvider prefers teacher then student", () => {
  assert.equal(
    primaryPipelineTtsProvider(
      {
        teacher: { voiceId: "a", provider: "fish" },
        student: { voiceId: "b", provider: "google" },
      },
      "elevenlabs",
    ),
    "fish",
  );
  assert.equal(
    primaryPipelineTtsProvider(
      { student: { voiceId: "b", provider: "google" } },
      "elevenlabs",
    ),
    "google",
  );
  assert.equal(primaryPipelineTtsProvider(undefined, "elevenlabs"), "elevenlabs");
});

test("mergePipelineSectionVoicesForVideo prefers pipeline over video", () => {
  const merged = mergePipelineSectionVoicesForVideo({
    pipelineSectionVoices: {
      teacher: {
        voiceId: "pipeline-emma",
        voiceName: "Pipeline Emma",
        provider: "elevenlabs",
      },
    },
    videoSectionVoices: {
      teacher: {
        voiceId: "video-emma",
        voiceName: "Video Emma",
        provider: "elevenlabs",
      },
      student: {
        voiceId: "video-leo",
        voiceName: "Video Leo",
        provider: "elevenlabs",
      },
    },
    ttsProvider: "elevenlabs",
  });
  assert.equal(merged.teacher?.voiceId, "pipeline-emma");
  assert.equal(merged.student?.voiceId, "video-leo");
});
