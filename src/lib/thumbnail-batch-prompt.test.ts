import assert from "node:assert/strict";
import test from "node:test";

import {
  buildThumbnailImageGeneratePrompt,
  buildThumbnailResolvePrompt,
  extractResolvedThumbnailPrompt,
  parseVideoThumbnailMasterSelection,
} from "@/lib/thumbnail-batch-prompt";

test("buildThumbnailResolvePrompt includes title and master", () => {
  const prompt = buildThumbnailResolvePrompt({
    masterPrompt: "Host holds {{SYMBOL}} about {{TOPIC}}",
    videoTitle: "Why Jesus Waited",
  });
  assert.match(prompt, /Why Jesus Waited/);
  assert.match(prompt, /Host holds \{\{SYMBOL\}\}/);
  assert.match(prompt, /resolvedPrompt/);
});

test("extractResolvedThumbnailPrompt reads JSON", () => {
  const parsed = extractResolvedThumbnailPrompt(
    '{"resolvedPrompt":"A dramatic open tomb","notes":"ok"}',
  );
  assert.equal(parsed.resolvedPrompt, "A dramatic open tomb");
  assert.equal(parsed.notes, "ok");
});

test("extractResolvedThumbnailPrompt accepts plain text fallback", () => {
  const parsed = extractResolvedThumbnailPrompt(
    "A long enough plain prompt describing a YouTube thumbnail with bold text.",
  );
  assert.match(parsed.resolvedPrompt, /YouTube thumbnail/);
});

test("buildThumbnailImageGeneratePrompt wraps resolved prompt", () => {
  const prompt = buildThumbnailImageGeneratePrompt("Bold face, open tomb, 16:9");
  assert.match(prompt, /Generate a single YouTube thumbnail/);
  assert.match(prompt, /Bold face, open tomb/);
});

test("parseVideoThumbnailMasterSelection", () => {
  assert.equal(parseVideoThumbnailMasterSelection(null), null);
  assert.deepEqual(
    parseVideoThumbnailMasterSelection({
      kind: "master",
      masterId: "tpm_1",
      masterName: "Main",
    }),
    { kind: "master", masterId: "tpm_1", masterName: "Main" },
  );
});
