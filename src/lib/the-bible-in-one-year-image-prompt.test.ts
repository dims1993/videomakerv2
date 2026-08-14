import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BIBLE_ONE_YEAR_STYLE_LOCK_BASE,
  buildBibleOneYearImagePromptsForScenes,
  compileBibleOneYearImagePrompt,
  compileBibleOneYearImportedScenes,
  compileBibleOneYearSceneImagePrompt,
  extractAuthorizedVisibleTitle,
  getBibleOneYearNegativeLock,
  getBibleOneYearStyleLock,
  isLegacyBibleOneYearImagePrompt,
} from "@/lib/the-bible-in-one-year-image-prompt";

const ANY_PROMPT =
  "Any free-form prompt the editor or Visual Planner wrote. No required locks.";

test("style lock reference still documents 16:9 watercolor and ink", () => {
  const lock = getBibleOneYearStyleLock("avatar", null);
  assert.match(lock, /16:9/);
  assert.match(lock, /watercolor and ink/i);
});

test("negative lock reference distinguishes authorized title vs no text", () => {
  assert.match(getBibleOneYearNegativeLock(null), /No readable writing/);
  assert.match(
    getBibleOneYearNegativeLock("GENESIS 1"),
    /visible text limited to: GENESIS 1/,
  );
});

test("passthrough preserves narrative fields and exact free-form imagePrompt", () => {
  const before = {
    order: 1,
    scriptText: "Genesis, chapter 1.",
    sceneType: "insert",
    visualPurpose: "Open the chapter",
    visualIdea: "Chapter cover: GENESIS 1, with a restrained open-Bible composition",
    duration: 5,
    imagePrompt: ANY_PROMPT,
    status: "planned",
  };

  const after = compileBibleOneYearSceneImagePrompt(before);
  assert.equal(after.scriptText, before.scriptText);
  assert.equal(after.visualIdea, before.visualIdea);
  assert.equal(after.imagePrompt, before.imagePrompt);
  assert.deepEqual(after.imagePrompt, ANY_PROMPT);
});

test("compile never rewrites prompts; advisory validation may flag short prompts", () => {
  const short = "Warm watercolor of dark waters.";
  const result = compileBibleOneYearImagePrompt({
    scriptText: "In the beginning, God created the heavens and the earth.",
    sceneType: "space",
    visualIdea: "Atmosphere/space: Dark waters",
    originalImagePrompt: short,
  });

  assert.equal(result.imagePrompt, short);
  assert.equal(result.isLegacy, false);
  assert.equal(Array.isArray(result.validationErrors), true);
});

test("import stores prompts exactly; batch sends the same string", () => {
  const planned = [
    {
      id: "s1",
      sortOrder: 1,
      scriptText: "Welcome to Day 1 of The Bible in One Year.",
      sceneType: "insert",
      visualPurpose: "Open the day",
      visualIdea: "Chapter cover: THE BIBLE IN ONE YEAR — DAY 1",
      imagePrompt: ANY_PROMPT,
      duration: 4,
      status: "planned",
    },
  ];

  const imported = compileBibleOneYearImportedScenes(planned);
  assert.equal(imported[0]?.imagePrompt, planned[0]?.imagePrompt);

  const batchPrompts = buildBibleOneYearImagePromptsForScenes(
    imported.map((scene) => ({
      id: scene.id,
      sortOrder: scene.sortOrder,
      scriptText: scene.scriptText,
      sceneType: scene.sceneType,
      visualIdea: scene.visualIdea,
      visualPurpose: scene.visualPurpose,
      imagePrompt: scene.imagePrompt,
    })),
  );

  assert.equal(batchPrompts.get("s1")?.imagePrompt, ANY_PROMPT);
});

test("end-to-end: promptAfterImport equals promptSentToProvider for any text", () => {
  const sceneFromVisualPlanner = {
    id: "vp-1",
    sortOrder: 1,
    scriptText: "Genesis, chapter 1.",
    sceneType: "insert",
    visualPurpose: "Open the chapter",
    visualIdea: "Chapter cover: GENESIS 1",
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_BASE} Or just any free text.`,
    duration: 5,
    status: "planned" as const,
  };

  const importedScene = compileBibleOneYearImportedScenes([
    sceneFromVisualPlanner,
  ])[0]!;
  const batchMap = buildBibleOneYearImagePromptsForScenes([
    {
      id: importedScene.id,
      sortOrder: importedScene.sortOrder,
      scriptText: importedScene.scriptText,
      sceneType: importedScene.sceneType,
      visualIdea: importedScene.visualIdea,
      visualPurpose: importedScene.visualPurpose,
      imagePrompt: importedScene.imagePrompt,
    },
  ]);
  const batchScene = batchMap.get(importedScene.id)!;

  assert.equal(batchScene.imagePrompt, sceneFromVisualPlanner.imagePrompt);
  assert.equal(importedScene.scriptText, sceneFromVisualPlanner.scriptText);
  assert.equal(importedScene.visualIdea, sceneFromVisualPlanner.visualIdea);
});

test("authorized title extraction uses REFLECT AND PRAY and thank-you titles", () => {
  assert.equal(
    extractAuthorizedVisibleTitle("Genesis, chapter 2.", "Chapter cover: GENESIS 2"),
    "GENESIS 2",
  );
  assert.equal(
    extractAuthorizedVisibleTitle(
      "You've completed today's reading. Well done. Now let's take a little time to reflect and pray.",
    ),
    "REFLECT AND PRAY",
  );
  assert.equal(
    extractAuthorizedVisibleTitle(
      "Thank you for joining Day 2 of The Bible in One Year.",
    ),
    "THANK YOU",
  );
});

test("legacy detector remains informational only", () => {
  assert.equal(isLegacyBibleOneYearImagePrompt("short prompt"), true);
  assert.equal(
    isLegacyBibleOneYearImagePrompt("watercolor aesthetic without ratio"),
    true,
  );
  assert.equal(
    isLegacyBibleOneYearImagePrompt(
      "16:9 horizontal hand-painted watercolor-and-ink biblical illustration",
    ),
    false,
  );
});
