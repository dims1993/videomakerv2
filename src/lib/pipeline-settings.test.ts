import assert from "node:assert/strict";
import test from "node:test";

import { getChannelProfile } from "@/lib/channels";
import {
  channelSupportsImageLibrary,
  getChannelPipelineDefaults,
  hardcodedPipelineDefaults,
  parsePipelineSettings,
} from "@/lib/pipeline-settings";

test("wealth channel pipeline defaults include Megan voice and hybrid", () => {
  const channel = getChannelProfile("wealth-insights");
  assert.equal(channel.pipelineDefaults?.visualPlan?.mode, "hybrid");
  const defaults = getChannelPipelineDefaults("wealth-insights");
  assert.equal(defaults.visualPlan.mode, "hybrid");
  assert.equal(defaults.script.includeReferenceTranscripts, false);
  assert.equal(
    defaults.voiceover.voiceId,
    channel.pipelineDefaults?.voiceover?.voiceId ??
      channel.voiceoverDefaultVoiceId,
  );
  assert.equal(defaults.voiceover.generateSubtitles, true);
  assert.equal(defaults.render.burnCaptions, true);
  assert.equal(defaults.render.voiceSoundBars, false);
  assert.ok(defaults.voiceover.captionStylePreset);
});

test("all builtin channels default pauseAfterMs null for punctuation pauses", () => {
  for (const key of [
    "wealth-insights",
    "the-gods-word",
    "podcast-english-lessons",
    "christian-life",
  ] as const) {
    const defaults = getChannelPipelineDefaults(key);
    assert.equal(
      defaults.voiceover.pauseAfterMs,
      null,
      `${key} should use punctuation pauses (pauseAfterMs null), got ${defaults.voiceover.pauseAfterMs}`,
    );
  }
});

test("explicit null pauseAfterMs wins over a numeric fallback", () => {
  const fallback = getChannelPipelineDefaults("the-gods-word");
  const withFlat = parsePipelineSettings(
    { voiceover: { pauseAfterMs: 180 } },
    fallback,
  );
  assert.equal(withFlat.voiceover.pauseAfterMs, 180);
  const cleared = parsePipelineSettings(
    { voiceover: { pauseAfterMs: null } },
    withFlat,
  );
  assert.equal(cleared.voiceover.pauseAfterMs, null);
});

test("podcast defaults enable voice sound bars", () => {
  const defaults = getChannelPipelineDefaults("podcast-english-lessons");
  assert.equal(defaults.render.voiceSoundBars, true);
  assert.equal(defaults.render.burnCaptions, true);
  assert.equal(defaults.render.voiceSoundBarsStyle, "bars");
  assert.equal(defaults.voiceover.ttsProvider, "google");
  assert.equal(defaults.voiceover.sectionVoices?.teacher?.voiceId, "en-US-Chirp3-HD-Fenrir");
  assert.equal(defaults.voiceover.sectionVoices?.student?.voiceId, "en-US-Chirp3-HD-Erinome");
  assert.equal(defaults.voiceover.sectionVoices?.student?.speed, 0.9);
});

test("parsePipelineSettings keeps podcast section voices", () => {
  const fallback = getChannelPipelineDefaults("podcast-english-lessons");
  const parsed = parsePipelineSettings(
    {
      voiceover: {
        sectionVoices: {
          teacher: {
            voiceId: "emma-voice",
            voiceName: "Emma",
            provider: "elevenlabs",
          },
          student: {
            voiceId: "leo-voice",
            voiceName: "Leo",
            provider: "elevenlabs",
            speed: 0.85,
          },
        },
      },
    },
    fallback,
  );
  assert.equal(parsed.voiceover.sectionVoices?.teacher?.voiceId, "emma-voice");
  assert.equal(parsed.voiceover.sectionVoices?.student?.voiceId, "leo-voice");
  assert.equal(parsed.voiceover.sectionVoices?.student?.speed, 0.85);
});

test("gods-word default caption style is godsword_style", () => {
  const defaults = getChannelPipelineDefaults("the-gods-word");
  assert.equal(defaults.voiceover.captionStylePreset, "godsword_style");
});

test("library mode only supported for podcast", () => {
  assert.equal(channelSupportsImageLibrary("podcast-english-lessons"), true);
  assert.equal(channelSupportsImageLibrary("the-gods-word"), false);
  const gods = getChannelPipelineDefaults("the-gods-word");
  const forced = parsePipelineSettings(
    {
      ...hardcodedPipelineDefaults(getChannelProfile("the-gods-word")),
      visualPlan: { mode: "library", generationMode: "FULL_VIDEO" },
    },
    gods,
  );
  // resolve path clamps library for non-podcast via getChannelPipelineDefaults;
  // parse alone keeps the value — clamp is in getChannelPipelineDefaults / resolve.
  assert.equal(forced.visualPlan.mode, "library");
  assert.equal(gods.visualPlan.mode, "hybrid");
});

test("pipeline settings include assets.imageOutputFolder default null", () => {
  const defaults = getChannelPipelineDefaults("wealth-insights");
  assert.equal(defaults.assets.imageOutputFolder, null);
});

test("alignmentProvider soft-migrates missing to channel default", () => {
  const fallback = getChannelPipelineDefaults("wealth-insights");
  assert.equal(fallback.voiceover.alignmentProvider, "whisperx");
  const parsed = parsePipelineSettings(
    {
      voiceover: {
        generateSubtitles: true,
        captionStylePreset: fallback.voiceover.captionStylePreset,
      },
    },
    fallback,
  );
  assert.equal(parsed.voiceover.alignmentProvider, "whisperx");
});

test("alignmentProvider accepts whisperx", () => {
  const fallback = getChannelPipelineDefaults("podcast-english-lessons");
  const parsed = parsePipelineSettings(
    {
      voiceover: {
        alignmentProvider: "whisperx",
      },
    },
    fallback,
  );
  assert.equal(parsed.voiceover.alignmentProvider, "whisperx");
});

test("ttsProvider soft-migrates missing to channel default", () => {
  const fallback = getChannelPipelineDefaults("wealth-insights");
  assert.equal(fallback.voiceover.ttsProvider, "google");
  const parsed = parsePipelineSettings(
    {
      voiceover: {
        generateSubtitles: true,
        captionStylePreset: fallback.voiceover.captionStylePreset,
      },
    },
    fallback,
  );
  assert.equal(parsed.voiceover.ttsProvider, "google");
});

test("ttsProvider accepts chatterbox", () => {
  const fallback = getChannelPipelineDefaults("the-gods-word");
  const parsed = parsePipelineSettings(
    {
      voiceover: {
        ttsProvider: "chatterbox",
        voiceId: "clone.wav",
        voiceName: "Clone",
      },
    },
    fallback,
  );
  assert.equal(parsed.voiceover.ttsProvider, "chatterbox");
  assert.equal(parsed.voiceover.voiceId, "clone.wav");
});

test("ttsProvider accepts google", () => {
  const fallback = getChannelPipelineDefaults("wealth-insights");
  const parsed = parsePipelineSettings(
    {
      voiceover: {
        ttsProvider: "google",
        voiceId: "en-US-Neural2-A",
        voiceName: "Neural2 A",
      },
    },
    fallback,
  );
  assert.equal(parsed.voiceover.ttsProvider, "google");
  assert.equal(parsed.voiceover.voiceId, "en-US-Neural2-A");
});

test("ttsProvider accepts fish", () => {
  const fallback = getChannelPipelineDefaults("wealth-insights");
  const parsed = parsePipelineSettings(
    {
      voiceover: {
        ttsProvider: "fish",
        voiceId: "abc123ref",
        voiceName: "Fish Narrator",
      },
    },
    fallback,
  );
  assert.equal(parsed.voiceover.ttsProvider, "fish");
  assert.equal(parsed.voiceover.voiceId, "abc123ref");
});

test("ttsProvider accepts speechify", () => {
  const fallback = getChannelPipelineDefaults("wealth-insights");
  const parsed = parsePipelineSettings(
    {
      voiceover: {
        ttsProvider: "speechify",
        voiceId: "geffen_32",
        voiceName: "Geffen",
      },
    },
    fallback,
  );
  assert.equal(parsed.voiceover.ttsProvider, "speechify");
  assert.equal(parsed.voiceover.voiceId, "geffen_32");
});
