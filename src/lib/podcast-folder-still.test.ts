import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { isPodcastFlowOnlyScene, isPodcastSectionClipScene } from "@/lib/podcast-image-library-shared";

test("folder still eligibility skips Flow covers and section clips only", () => {
  const spoken = { visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST: smile", scriptText: "hi" };
  const music = { visualIdea: "MUSIC_BED | COMP_MUSIC_BED: soft", scriptText: "" };
  const part = { visualIdea: "PART_COVER | COMP_PART_COVER: PART 1 — NAME", scriptText: "" };
  const intro = { visualIdea: "SECTION_CLIP | INTRO", scriptText: "" };

  assert.equal(isPodcastFlowOnlyScene(spoken), false);
  assert.equal(isPodcastSectionClipScene(spoken), false);
  assert.equal(isPodcastFlowOnlyScene(music), false);
  assert.equal(isPodcastSectionClipScene(music), false);
  assert.equal(isPodcastFlowOnlyScene(part), true);
  assert.equal(isPodcastSectionClipScene(intro), true);
});

test("temp folder with one png is listable for still attach", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "podcast-still-"));
  try {
    await writeFile(path.join(dir, "hero.png"), Buffer.from([1, 2, 3, 4]));
    const { readdir } = await import("node:fs/promises");
    const names = await readdir(dir);
    assert.ok(names.includes("hero.png"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
