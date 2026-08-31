import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTtsVoiceKey,
  getTtsProviderLimits,
  isKnownTtsProvider,
} from "@/lib/tts-provider-limits";
import {
  narrationPlannerSceneFromVoice,
  planNarrationBlocks,
} from "@/lib/narration-planner";

test("getTtsProviderLimits returns known provider limits", () => {
  assert.equal(getTtsProviderLimits("speechify").maxCharsPerRequest, 2000);
  assert.equal(getTtsProviderLimits("google").maxCharsPerRequest, 4500);
  assert.equal(
    getTtsProviderLimits("elevenlabs").supportsInterBlockPreviousText,
    true,
  );
});

test("getTtsProviderLimits falls back for unknown future providers", () => {
  const limits = getTtsProviderLimits("future-tts-engine");
  assert.equal(limits.maxCharsPerRequest, 2800);
  assert.equal(isKnownTtsProvider("future-tts-engine"), false);
});

test("buildTtsVoiceKey includes provider and voice id", () => {
  assert.equal(buildTtsVoiceKey("fish", "ref-abc"), "fish:ref-abc");
});

test("planNarrationBlocks groups same-voice scenes", () => {
  const scenes = [
    narrationPlannerSceneFromVoice({
      sceneId: "s1",
      sortOrder: 1,
      scriptText: "Hello there.",
      spokenText: "Hello there.",
      ttsText: "Hello there.",
      provider: "fish",
      voiceId: "voice-a",
    }),
    narrationPlannerSceneFromVoice({
      sceneId: "s2",
      sortOrder: 2,
      scriptText: "How are you?",
      spokenText: "How are you?",
      ttsText: "How are you?",
      provider: "fish",
      voiceId: "voice-a",
    }),
  ];
  const blocks = planNarrationBlocks(scenes);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.scenes.length, 2);
  assert.match(blocks[0]!.fullText, /Hello there.*How are you/);
});

test("planNarrationBlocks splits on voice change", () => {
  const scenes = [
    narrationPlannerSceneFromVoice({
      sceneId: "s1",
      sortOrder: 1,
      scriptText: "Emma speaks.",
      spokenText: "Emma speaks.",
      ttsText: "Emma speaks.",
      provider: "google",
      voiceId: "emma",
    }),
    narrationPlannerSceneFromVoice({
      sceneId: "s2",
      sortOrder: 2,
      scriptText: "Leo replies.",
      spokenText: "Leo replies.",
      ttsText: "Leo replies.",
      provider: "fish",
      voiceId: "leo",
    }),
  ];
  const blocks = planNarrationBlocks(scenes);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]!.provider, "google");
  assert.equal(blocks[1]!.provider, "fish");
});

test("planNarrationBlocks splits on provider change with same voice id", () => {
  const scenes = [
    narrationPlannerSceneFromVoice({
      sceneId: "s1",
      sortOrder: 1,
      scriptText: "Part one.",
      spokenText: "Part one.",
      ttsText: "Part one.",
      provider: "google",
      voiceId: "shared-id",
    }),
    narrationPlannerSceneFromVoice({
      sceneId: "s2",
      sortOrder: 2,
      scriptText: "Part two.",
      spokenText: "Part two.",
      ttsText: "Part two.",
      provider: "fish",
      voiceId: "shared-id",
    }),
  ];
  const blocks = planNarrationBlocks(scenes);
  assert.equal(blocks.length, 2);
});

test("planNarrationBlocks preserves scene order", () => {
  const scenes = [1, 2, 3].map((order) =>
    narrationPlannerSceneFromVoice({
      sceneId: `s${order}`,
      sortOrder: order,
      scriptText: `Line ${order}.`,
      spokenText: `Line ${order}.`,
      ttsText: `Line ${order}.`,
      provider: "elevenlabs",
      voiceId: "v1",
    }),
  );
  const blocks = planNarrationBlocks(scenes);
  assert.equal(blocks.length, 1);
  assert.deepEqual(
    blocks[0]!.scenes.map((scene) => scene.sortOrder),
    [1, 2, 3],
  );
});

test("planNarrationBlocks skips empty and skipVoiceover scenes", () => {
  const scenes = [
    narrationPlannerSceneFromVoice({
      sceneId: "s1",
      sortOrder: 1,
      scriptText: "Hello.",
      spokenText: "Hello.",
      ttsText: "Hello.",
      provider: "fish",
      voiceId: "v1",
    }),
    narrationPlannerSceneFromVoice({
      sceneId: "s2",
      sortOrder: 2,
      scriptText: "",
      spokenText: "",
      ttsText: "",
      provider: "fish",
      voiceId: "v1",
      skipVoiceover: true,
    }),
    narrationPlannerSceneFromVoice({
      sceneId: "s3",
      sortOrder: 3,
      scriptText: "Again.",
      spokenText: "Again.",
      ttsText: "Again.",
      provider: "fish",
      voiceId: "v1",
    }),
  ];
  const blocks = planNarrationBlocks(scenes);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]!.scenes.length, 1);
  assert.equal(blocks[1]!.scenes.length, 1);
});

test("planNarrationBlocks bridges incomplete sentences", () => {
  const scenes = [
    narrationPlannerSceneFromVoice({
      sceneId: "s1",
      sortOrder: 1,
      scriptText: "When you learn English,",
      spokenText: "When you learn English,",
      ttsText: "When you learn English,",
      provider: "google",
      voiceId: "v1",
    }),
    narrationPlannerSceneFromVoice({
      sceneId: "s2",
      sortOrder: 2,
      scriptText: "you need patience.",
      spokenText: "you need patience.",
      ttsText: "you need patience.",
      provider: "google",
      voiceId: "v1",
    }),
  ];
  const blocks = planNarrationBlocks(scenes);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.scenes.length, 2);
});

test("planNarrationBlocks respects speechify char limit when joining", () => {
  const lineA = "Alpha ".repeat(200).trim() + ".";
  const lineB = "Beta ".repeat(200).trim() + ".";
  assert.ok(lineA.length < 2000);
  assert.ok(lineB.length < 2000);
  assert.ok(lineA.length + lineB.length + 1 > 2000);

  const scenes = [
    narrationPlannerSceneFromVoice({
      sceneId: "s1",
      sortOrder: 1,
      scriptText: lineA,
      spokenText: lineA,
      ttsText: lineA,
      provider: "speechify",
      voiceId: "v1",
    }),
    narrationPlannerSceneFromVoice({
      sceneId: "s2",
      sortOrder: 2,
      scriptText: lineB,
      spokenText: lineB,
      ttsText: lineB,
      provider: "speechify",
      voiceId: "v1",
    }),
  ];
  const blocks = planNarrationBlocks(scenes);
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    assert.ok(
      block.charCount <= getTtsProviderLimits("speechify").maxCharsPerRequest,
    );
  }
});
