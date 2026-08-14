import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildYoutubeChaptersFromScenes } from "./youtube-chapters";

describe("youtube-chapters podcast structure", () => {
  it("maps SECTION_CLIP and PART_COVER scenes to timed chapters", () => {
    const { chapters } = buildYoutubeChaptersFromScenes({
      script: "Legacy script without CHAPTER markers.",
      videoTitle: "Day 1",
      scenes: [
        {
          sortOrder: 1,
          scriptText: "",
          visualPurpose: null,
          visualIdea: "SECTION_CLIP | INTRO: episode intro bumper",
          duration: 10,
          voiceoverDuration: 10,
          pauseAfterMs: 0,
        },
        {
          sortOrder: 2,
          scriptText: "Hello.",
          visualPurpose: null,
          visualIdea: "TEACHER_EMMA | studio",
          duration: 5,
          voiceoverDuration: 5,
          pauseAfterMs: 0,
        },
        {
          sortOrder: 3,
          scriptText: "",
          visualPurpose: null,
          visualIdea: "SECTION_CLIP | LESSON: lesson section bumper",
          duration: 8,
          voiceoverDuration: 8,
          pauseAfterMs: 0,
        },
        {
          sortOrder: 4,
          scriptText: "Part 1. Saying your name.",
          visualPurpose: null,
          visualIdea: "PART_COVER | COMP_PART_COVER: PART 1 — SAYING YOUR NAME",
          duration: 4,
          voiceoverDuration: 4,
          pauseAfterMs: 0,
        },
        {
          sortOrder: 5,
          scriptText: "My name is Emma.",
          visualPurpose: null,
          visualIdea: "TEACHER_EMMA | studio",
          duration: 6,
          voiceoverDuration: 6,
          pauseAfterMs: 0,
        },
        {
          sortOrder: 6,
          scriptText: "",
          visualPurpose: null,
          visualIdea: "SECTION_CLIP | CLOSING: closing bumper",
          duration: 5,
          voiceoverDuration: 5,
          pauseAfterMs: 0,
        },
        {
          sortOrder: 7,
          scriptText: "",
          visualPurpose: null,
          visualIdea: "SECTION_CLIP | FINAL: final thanks bumper",
          duration: 6,
          voiceoverDuration: 6,
          pauseAfterMs: 0,
        },
      ],
    });

    assert.deepEqual(
      chapters.map((chapter) => ({
        timestamp: chapter.timestamp,
        title: chapter.title,
        source: chapter.source,
      })),
      [
        { timestamp: "0:00", title: "Intro", source: "section_clip" },
        { timestamp: "0:15", title: "Lesson", source: "section_clip" },
        {
          timestamp: "0:23",
          title: "Part 1 — Saying Your Name",
          source: "part_cover",
        },
        { timestamp: "0:33", title: "Closing", source: "section_clip" },
        { timestamp: "0:38", title: "Final", source: "section_clip" },
      ],
    );
  });
});
