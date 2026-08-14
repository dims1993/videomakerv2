import assert from "node:assert/strict";
import test from "node:test";

import {
  isPodcastFlowOnlyScene,
  libraryTagForRole,
  PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
} from "@/lib/podcast-image-library-shared";
import {
  assetScenarioId,
  filterLibraryAssetsByScenario,
  normalizePodcastLibraryScenarioId,
  scenarioLabelFromId,
  summarizePodcastImageLibrary,
  type PodcastImageLibraryAsset,
} from "@/lib/podcast-image-library";
import { inferPodcastImagePromptRole } from "@/lib/podcast-english-lessons-image-prompt-contract";

test("isPodcastFlowOnlyScene catches PART and episode covers only", () => {
  assert.equal(
    isPodcastFlowOnlyScene({
      visualIdea: "PART_COVER | COMP_PART_COVER: PART 1 — NAME",
    }),
    true,
  );
  assert.equal(
    isPodcastFlowOnlyScene({
      visualIdea: "EPISODE_COVER | COMP_EPISODE_COVER: Day 1",
    }),
    true,
  );
  assert.equal(
    isPodcastFlowOnlyScene({
      visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST: smile",
    }),
    false,
  );
  assert.equal(
    isPodcastFlowOnlyScene({
      visualIdea: "MUSIC_BED | COMP_MUSIC_BED: soft begin",
    }),
    false,
  );
});

test("libraryTagForRole maps emma/leo/music", () => {
  assert.equal(libraryTagForRole("emma"), "emma");
  assert.equal(libraryTagForRole("leo"), "leo");
  assert.equal(libraryTagForRole("music"), "music");
  assert.equal(libraryTagForRole("part"), null);
  assert.equal(
    libraryTagForRole(
      inferPodcastImagePromptRole({
        visualIdea: "STUDENT_LEO | COMP_LEO_STUDENT",
      }),
    ),
    "leo",
  );
});

test("scenario helpers normalize and filter library pools", () => {
  assert.equal(normalizePodcastLibraryScenarioId("Shopping Mall"), "shopping-mall");
  assert.equal(normalizePodcastLibraryScenarioId("all"), null);
  assert.equal(normalizePodcastLibraryScenarioId("default"), "default");
  assert.equal(scenarioLabelFromId("shopping-mall"), "Shopping Mall");
  assert.equal(assetScenarioId({}), "default");
  assert.equal(assetScenarioId({ scenario: "cafe" }), "cafe");

  const assets: PodcastImageLibraryAsset[] = [
    {
      id: "1",
      tag: "emma",
      relativePath: "data/image-library/podcast-english-lessons/emma/a.png",
      fileName: "a.png",
    },
    {
      id: "2",
      tag: "emma",
      scenario: "shopping-mall",
      relativePath:
        "data/image-library/podcast-english-lessons/emma/shopping-mall/b.png",
      fileName: "b.png",
    },
    {
      id: "3",
      tag: "leo",
      scenario: "shopping-mall",
      relativePath:
        "data/image-library/podcast-english-lessons/leo/shopping-mall/c.png",
      fileName: "c.png",
    },
  ];

  assert.equal(filterLibraryAssetsByScenario(assets, "all").length, 3);
  assert.equal(filterLibraryAssetsByScenario(assets, "default").length, 1);
  assert.equal(filterLibraryAssetsByScenario(assets, "shopping-mall").length, 2);

  const summary = summarizePodcastImageLibrary({
    version: 1,
    channelKey: PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
    updatedAt: new Date().toISOString(),
    assets,
  });
  assert.equal(summary.total, 3);
  assert.equal(summary.scenarios.length, 2);
  assert.equal(
    summary.scenarios.find((s) => s.id === "shopping-mall")?.counts.emma,
    1,
  );
});
