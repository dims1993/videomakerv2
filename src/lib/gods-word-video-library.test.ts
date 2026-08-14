import assert from "node:assert/strict";
import test from "node:test";

import { godsWordScriptHasStructuralMarkers } from "@/lib/the-gods-word-script-prompt";
import {
  GODS_WORD_VIDEO_LIBRARY_RELATIVE_DIR,
  resolveGodsWordFinalLibraryFile,
} from "@/lib/gods-word-video-library";

test("godsWordScriptHasStructuralMarkers requires plain [FINAL] bumper", () => {
  const withoutBumper = `
[HOOK]
Tension.
[END HOOK]

[CHAPTER 1 — THE DELAY]
Body.

[FINAL — RETURN]
Hope.
`;
  assert.equal(godsWordScriptHasStructuralMarkers(withoutBumper), false);

  const withBumper = `${withoutBumper.trim()}\n\n[FINAL]\n`;
  assert.equal(godsWordScriptHasStructuralMarkers(withBumper), true);
});

test("godsWordScriptHasStructuralMarkers does not treat [FINAL — TITLE] as bumper", () => {
  const titledOnly = `
[HOOK]
A.
[END HOOK]
[CHAPTER 1 — ONE]
B.
[FINAL — CLOSE]
C.
`;
  assert.equal(godsWordScriptHasStructuralMarkers(titledOnly), false);
});

test("resolveGodsWordFinalLibraryFile points at channel library dir", async () => {
  assert.match(
    GODS_WORD_VIDEO_LIBRARY_RELATIVE_DIR,
    /the-gods-word[\\/]+video-library$/,
  );
  // File may be missing until the user drops FINAL.mp4 — null is ok.
  const resolved = await resolveGodsWordFinalLibraryFile();
  assert.ok(resolved === null || resolved.fileName.toLowerCase().startsWith("final"));
});
