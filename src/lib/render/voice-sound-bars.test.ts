import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCleanPulseDriveAudioFilter,
  buildVoiceSoundBarsFilterComplex,
  DEFAULT_VOICE_SOUND_BARS_STYLE,
  shouldAttachVoiceSoundBars,
  VOICE_SOUND_BARS_CENTER_Y_OFFSET,
  VOICE_SOUND_BARS_HEIGHT,
  VOICE_SOUND_BARS_VIS_RATE,
  VOICE_SOUND_BARS_WIDTH,
  waveVisualizerFilter,
} from "@/lib/render/voice-sound-bars";

test("shouldAttachVoiceSoundBars requires enabled still with spoken VO", () => {
  assert.equal(
    shouldAttachVoiceSoundBars({
      voiceSoundBarsEnabled: true,
      mediaKind: "image",
      scriptText: "Hello Emma.",
      voiceoverLocalPath: "storage/voiceovers/x/scenes/a.mp3",
      isMusicBed: false,
    }),
    true,
  );
});

test("shouldAttachVoiceSoundBars skips clips, beds, PART covers, empty script, and disabled", () => {
  const base = {
    voiceSoundBarsEnabled: true,
    mediaKind: "image" as const,
    scriptText: "Hello.",
    voiceoverLocalPath: "storage/voiceovers/x/scenes/a.mp3",
    isMusicBed: false,
  };

  assert.equal(
    shouldAttachVoiceSoundBars({ ...base, voiceSoundBarsEnabled: false }),
    false,
  );
  assert.equal(
    shouldAttachVoiceSoundBars({ ...base, mediaKind: "video" }),
    false,
  );
  assert.equal(
    shouldAttachVoiceSoundBars({ ...base, isMusicBed: true }),
    false,
  );
  assert.equal(
    shouldAttachVoiceSoundBars({ ...base, isPartCover: true }),
    false,
  );
  assert.equal(
    shouldAttachVoiceSoundBars({ ...base, scriptText: "  " }),
    false,
  );
  assert.equal(
    shouldAttachVoiceSoundBars({ ...base, voiceoverLocalPath: null }),
    false,
  );
});

test("clean-pulse drive filter compresses and gates speech", () => {
  const af = buildCleanPulseDriveAudioFilter(4.5);
  assert.match(af, /atrim=0:4\.500/);
  assert.match(af, /apad=whole_dur=4\.500/);
  assert.match(af, /highpass=f=120/);
  assert.match(af, /lowpass=f=4200/);
  assert.match(af, /acompressor=/);
  assert.match(af, /agate=/);
});

test("buildVoiceSoundBarsFilterComplex trims both legs to duration", () => {
  assert.equal(DEFAULT_VOICE_SOUND_BARS_STYLE, "bars");
  const filter = buildVoiceSoundBarsFilterComplex({
    fitFilter: "scale=1920:1080",
    fps: 30,
    durationSec: 4.2,
    style: "cline",
  });
  assert.match(
    filter,
    /\[0:v\]scale=1920:1080,fps=30,trim=duration=4\.200,setpts=PTS-STARTPTS,format=rgba\[bg\]/,
  );
  assert.match(
    filter,
    new RegExp(
      `showwaves=s=${VOICE_SOUND_BARS_WIDTH}x${VOICE_SOUND_BARS_HEIGHT}:mode=cline:colors=white:rate=${VOICE_SOUND_BARS_VIS_RATE}:scale=cbrt`,
    ),
  );
  assert.match(filter, /trim=duration=4\.200,setpts=PTS-STARTPTS\[wv\]/);
  assert.doesNotMatch(filter, /shortest=1/);
  assert.match(
    filter,
    new RegExp(
      `overlay=\\(W-w\\)/2:\\(H-h\\)/2-${VOICE_SOUND_BARS_CENTER_Y_OFFSET}`,
    ),
  );
  assert.match(filter, /\[vout\]$/);
});

test("waveVisualizerFilter supports cline; bars/bars2 are envelope-only", () => {
  assert.throws(
    () =>
      waveVisualizerFilter(
        "bars",
        VOICE_SOUND_BARS_WIDTH,
        VOICE_SOUND_BARS_HEIGHT,
      ),
    /envelope overlay path/,
  );
  assert.throws(
    () =>
      waveVisualizerFilter(
        "bars2",
        VOICE_SOUND_BARS_WIDTH,
        VOICE_SOUND_BARS_HEIGHT,
      ),
    /envelope overlay path/,
  );
  assert.throws(
    () =>
      buildVoiceSoundBarsFilterComplex({
        fitFilter: "scale=1920:1080",
        fps: 30,
        durationSec: 2,
        style: "bars",
      }),
    /renderEnvelopeBarsOverlay/,
  );

  const cline = waveVisualizerFilter(
    "cline",
    VOICE_SOUND_BARS_WIDTH,
    VOICE_SOUND_BARS_HEIGHT,
  );
  assert.match(
    cline,
    new RegExp(`rate=${VOICE_SOUND_BARS_VIS_RATE}:scale=cbrt`),
  );
});
