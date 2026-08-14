import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveSceneVoiceoverAbsolutePath,
  sceneVoiceoverFileExists,
} from "@/lib/scene-voiceover-audio";

test("sceneVoiceoverFileExists rejects empty path", async () => {
  assert.equal((await sceneVoiceoverFileExists(null)).ok, false);
  assert.equal((await sceneVoiceoverFileExists("")).ok, false);
  assert.equal((await sceneVoiceoverFileExists("   ")).reason, "missing_path");
});

test("resolveSceneVoiceoverAbsolutePath joins cwd for relative paths", () => {
  const resolved = resolveSceneVoiceoverAbsolutePath(
    "storage/voiceovers/demo/scene.mp3",
  );
  assert.match(resolved, /storage\/voiceovers\/demo\/scene\.mp3$/);
});
