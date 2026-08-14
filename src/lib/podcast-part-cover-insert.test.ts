import assert from "node:assert/strict";
import test from "node:test";

import { planPodcastPartCoverInserts } from "@/lib/podcast-part-cover-insert";

const SCRIPT = `## COLD OPEN
[MUSIC: begin]
[EMMA]
Welcome to day one.
PART 1 — SAYING YOUR NAME
[EMMA]
When you meet someone for the first time, begin with a greeting.
[LEO]
Hello.
PART 2 — SAYING WHERE YOU ARE FROM
[MUSIC: fade]
[EMMA]
To ask about someone’s country, say where are you from.
`;

test("planPodcastPartCoverInserts finds insert points without empty-script false matches", () => {
  const plan = planPodcastPartCoverInserts({
    script: SCRIPT,
    scenes: [
      {
        sortOrder: 1,
        scriptText: "",
        visualIdea: "MUSIC_BED | COMP_MUSIC_BED: soft begin",
      },
      {
        sortOrder: 2,
        scriptText: "Welcome to day one.",
        visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST",
      },
      {
        sortOrder: 3,
        scriptText:
          "When you meet someone for the first time, begin with a greeting.",
        visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST",
      },
      {
        sortOrder: 4,
        scriptText: "Hello.",
        visualIdea: "STUDENT_LEO | COMP_LEO_STUDENT",
      },
      {
        sortOrder: 5,
        scriptText: "",
        visualIdea: "MUSIC_BED | COMP_MUSIC_BED: soft fade",
      },
      {
        sortOrder: 6,
        scriptText: "To ask about someone’s country, say where are you from.",
        visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST",
      },
    ],
  });

  assert.equal(plan.unmatched.length, 0);
  assert.equal(plan.items.length, 2);
  // Applied high-to-low; contents still encode correct targets.
  const byTitle = Object.fromEntries(
    plan.items.map((item) => [item.displayTitle, item]),
  );
  assert.equal(
    byTitle["PART 1 — SAYING YOUR NAME"]?.insertBeforeSortOrder,
    3,
  );
  assert.equal(
    byTitle["PART 2 — SAYING WHERE YOU ARE FROM"]?.insertBeforeSortOrder,
    5,
  );
  assert.equal(
    byTitle["PART 1 — SAYING YOUR NAME"]?.spokenText,
    "Part 1. Saying your name.",
  );
});

test("planPodcastPartCoverInserts skips existing covers", () => {
  const plan = planPodcastPartCoverInserts({
    script: SCRIPT,
    scenes: [
      {
        sortOrder: 1,
        scriptText: "Part 1. Saying your name.",
        visualIdea: "PART_COVER | COMP_PART_COVER: PART 1 — SAYING YOUR NAME",
      },
      {
        sortOrder: 2,
        scriptText:
          "When you meet someone for the first time, begin with a greeting.",
        visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST",
      },
      {
        sortOrder: 3,
        scriptText: "",
        visualIdea: "MUSIC_BED | COMP_MUSIC_BED",
      },
      {
        sortOrder: 4,
        scriptText: "To ask about someone’s country, say where are you from.",
        visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST",
      },
    ],
  });

  assert.ok(plan.skippedExisting.includes("PART 1 — SAYING YOUR NAME"));
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0]?.displayTitle, "PART 2 — SAYING WHERE YOU ARE FROM");
});
