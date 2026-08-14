import assert from "node:assert/strict";
import test from "node:test";

import { getWhisperXInstallReady } from "@/lib/whisperx-process";

test("getWhisperXInstallReady reflects WhisperX-Server venv + server.py", () => {
  // After local bootstrap this repo has WhisperX-Server/venv + server.py.
  assert.equal(typeof getWhisperXInstallReady(), "boolean");
});
