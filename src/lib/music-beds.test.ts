import assert from "node:assert/strict";
import { test } from "node:test";

import { pickFreesoundPreviewUrl } from "@/lib/freesound";
import {
  inferMusicBedCueKind,
  suggestMusicBedPresetId,
  MUSIC_BED_LIBRARY_RELATIVE_DIR,
  MUSIC_BED_PROVIDER,
} from "@/lib/music-beds";

test("provider is freesound (Pixabay has no music API)", () => {
  assert.equal(MUSIC_BED_PROVIDER, "freesound");
  assert.match(MUSIC_BED_LIBRARY_RELATIVE_DIR, /freesound/);
});

test("inferMusicBedCueKind maps begin / fade / outro wording", () => {
  assert.equal(
    inferMusicBedCueKind({ visualIdea: "MUSIC_BED: soft begin intro lights" }),
    "begin",
  );
  assert.equal(
    inferMusicBedCueKind({ visualIdea: "MUSIC_BED: waveform fade out" }),
    "fade",
  );
  assert.equal(
    inferMusicBedCueKind({ visualIdea: "MUSIC_BED: outro soft landing" }),
    "outro",
  );
});

test("suggestMusicBedPresetId picks catalog beds by cue", () => {
  assert.equal(
    suggestMusicBedPresetId({ visualIdea: "MUSIC_BED: begin" }),
    "soft_begin",
  );
  assert.equal(
    suggestMusicBedPresetId({ visualIdea: "MUSIC_BED: fade" }),
    "soft_fade",
  );
  assert.equal(
    suggestMusicBedPresetId({ visualIdea: "MUSIC_BED: outro-soft" }),
    "outro_soft",
  );
});

test("pickFreesoundPreviewUrl prefers hq mp3", () => {
  assert.equal(
    pickFreesoundPreviewUrl({
      id: 1,
      name: "x",
      tags: [],
      username: "u",
      license: "cc0",
      duration: 3,
      previews: {
        "preview-lq-mp3": "http://example/lq.mp3",
        "preview-hq-mp3": "http://example/hq.mp3",
      },
    }),
    "http://example/hq.mp3",
  );
});
