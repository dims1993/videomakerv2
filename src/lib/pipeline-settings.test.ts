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
  assert.equal(
    channel.voiceProfiles?.[0]?.voiceId,
    "Hh0rE70WfnSFN80K8uJC",
  );
  const defaults = getChannelPipelineDefaults("wealth-insights");
  assert.equal(defaults.visualPlan.mode, "hybrid");
  assert.equal(defaults.script.includeReferenceTranscripts, false);
  assert.equal(defaults.voiceover.voiceId, "Hh0rE70WfnSFN80K8uJC");
  assert.equal(defaults.voiceover.generateSubtitles, true);
  assert.equal(defaults.render.burnCaptions, true);
  assert.equal(defaults.render.voiceSoundBars, false);
  assert.ok(defaults.voiceover.captionStylePreset);
});

test("podcast defaults enable voice sound bars", () => {
  const defaults = getChannelPipelineDefaults("podcast-english-lessons");
  assert.equal(defaults.render.voiceSoundBars, true);
  assert.equal(defaults.render.burnCaptions, true);
  assert.equal(defaults.render.voiceSoundBarsStyle, "bars");
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

test("alignmentProvider soft-migrates missing to elevenlabs", () => {
  const fallback = getChannelPipelineDefaults("wealth-insights");
  assert.equal(fallback.voiceover.alignmentProvider, "elevenlabs");
  const parsed = parsePipelineSettings(
    {
      voiceover: {
        generateSubtitles: true,
        captionStylePreset: fallback.voiceover.captionStylePreset,
      },
    },
    fallback,
  );
  assert.equal(parsed.voiceover.alignmentProvider, "elevenlabs");
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

test("ttsProvider soft-migrates missing to elevenlabs", () => {
  const fallback = getChannelPipelineDefaults("wealth-insights");
  assert.equal(fallback.voiceover.ttsProvider, "elevenlabs");
  const parsed = parsePipelineSettings(
    {
      voiceover: {
        generateSubtitles: true,
        captionStylePreset: fallback.voiceover.captionStylePreset,
      },
    },
    fallback,
  );
  assert.equal(parsed.voiceover.ttsProvider, "elevenlabs");
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
