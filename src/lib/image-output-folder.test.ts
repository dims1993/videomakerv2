import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  displayImageOutputFolder,
  normalizeStoredImageOutputFolder,
  resolveImageOutputFolderAbsolute,
} from "@/lib/image-output-folder";
import { generatedImagesDir } from "@/lib/generated-images-path";
import { getChannelProfile } from "@/lib/channels";
import {
  hardcodedPipelineDefaults,
  parsePipelineSettings,
} from "@/lib/pipeline-settings";

test("normalizeStoredImageOutputFolder keeps repo-relative paths", () => {
  const normalized = normalizeStoredImageOutputFolder(
    "storage/generated-images/storm-images",
  );
  assert.equal(normalized, "storage/generated-images/storm-images");
});

test("normalizeStoredImageOutputFolder converts absolute repo paths", () => {
  const absolute = path.join(
    process.cwd(),
    "storage",
    "generated-images",
    "storm-images",
  );
  const normalized = normalizeStoredImageOutputFolder(absolute);
  assert.equal(normalized, "storage/generated-images/storm-images");
});

test("resolveImageOutputFolderAbsolute falls back to default", () => {
  const resolved = resolveImageOutputFolderAbsolute(null, "vid1", "Storm Title");
  assert.equal(resolved, generatedImagesDir("vid1", "Storm Title"));
});

test("displayImageOutputFolder prefers relative default", () => {
  const display = displayImageOutputFolder(null, "vid1", "Storm Title");
  assert.equal(display, "storage/generated-images/storm-title-images");
});

test("parsePipelineSettings keeps assets.imageOutputFolder", () => {
  const fallback = hardcodedPipelineDefaults(getChannelProfile("the-gods-word"));
  const parsed = parsePipelineSettings(
    {
      assets: {
        imageOutputFolder: "storage/generated-images/custom-images",
      },
    },
    fallback,
  );
  assert.equal(
    parsed.assets.imageOutputFolder,
    "storage/generated-images/custom-images",
  );
  assert.equal(fallback.assets.imageOutputFolder, null);
});
