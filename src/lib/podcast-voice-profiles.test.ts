import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PODCAST_MAX_VOICE_ID,
  PODCAST_SARA_VOICE_ID,
  getPodcastSectionDelivery,
  isPodcastWordTourPartTitle,
  mapScenesToPodcastDeliveryModes,
  resolvePodcastHostFromVoiceId,
  resolvePodcastHostKey,
  resolvePodcastSectionSpeakingRate,
} from "@/lib/podcast-voice-profiles";

test("voice IDs preserve Chirp3 case-sensitive catalog format", () => {
  assert.equal(PODCAST_MAX_VOICE_ID, "en-US-Chirp3-HD-Iapetus");
  assert.equal(PODCAST_SARA_VOICE_ID, "en-US-Chirp3-HD-Erinome");
  assert.equal(resolvePodcastHostFromVoiceId(PODCAST_MAX_VOICE_ID), "max");
  assert.equal(resolvePodcastHostFromVoiceId(PODCAST_SARA_VOICE_ID), "sara");
});

test("resolvePodcastHostKey prefers voiceId then speaker slot", () => {
  assert.equal(
    resolvePodcastHostKey({
      voiceId: PODCAST_SARA_VOICE_ID,
      sectionKind: "teacher",
    }),
    "sara",
  );
  assert.equal(
    resolvePodcastHostKey({ voiceId: null, sectionKind: "teacher" }),
    "max",
  );
  assert.equal(
    resolvePodcastHostKey({ voiceId: null, sectionKind: "student" }),
    "sara",
  );
});

test("isPodcastWordTourPartTitle matches branded Word Tour titles", () => {
  assert.equal(isPodcastWordTourPartTitle("WORD TOUR"), true);
  assert.equal(
    isPodcastWordTourPartTitle("WORDS FROM TODAY'S CONVERSATION"),
    true,
  );
  assert.equal(isPodcastWordTourPartTitle("WHY THE SECOND START FEELS HEAVIER"), false);
});

test("mapScenesToPodcastDeliveryModes follows INTRO → LESSON → Word Tour → CLOSING", () => {
  const modes = mapScenesToPodcastDeliveryModes([
    { sortOrder: 1, visualIdea: "SECTION_CLIP | INTRO: episode intro bumper", scriptText: "" },
    { sortOrder: 2, visualIdea: "TEACHER_EMMA | studio", scriptText: "My shoes no longer trust me." },
    { sortOrder: 3, visualIdea: "STUDENT_LEO | studio", scriptText: "Trust issues?" },
    { sortOrder: 4, visualIdea: "SECTION_CLIP | LESSON: lesson section bumper", scriptText: "" },
    { sortOrder: 5, visualIdea: "TEACHER_EMMA | studio", scriptText: "Have you ever stopped?" },
    {
      sortOrder: 6,
      visualIdea: "PART_COVER | COMP_PART_COVER: WORDS FROM TODAY'S CONVERSATION",
      scriptText: "Part 8. Words from today's conversation.",
    },
    { sortOrder: 7, visualIdea: "STUDENT_LEO | studio", scriptText: "Begin again means start again." },
    {
      sortOrder: 8,
      visualIdea: "PART_COVER | COMP_PART_COVER: WHAT WE TAKE FROM TODAY",
      scriptText: "Part 10. What we take from today.",
    },
    { sortOrder: 9, visualIdea: "SECTION_CLIP | CLOSING: closing bumper", scriptText: "" },
    { sortOrder: 10, visualIdea: "TEACHER_EMMA | studio", scriptText: "Thank you for listening." },
  ]);

  assert.equal(modes.get(2), "intro");
  assert.equal(modes.get(3), "intro");
  assert.equal(modes.get(5), "main");
  assert.equal(modes.get(7), "wordTour");
  assert.equal(modes.get(8), "main");
  assert.equal(modes.get(10), "closing");
});

test("section speaking rates: intro faster than closing; Sara closing softest", () => {
  const maxIntro = resolvePodcastSectionSpeakingRate({
    host: "max",
    mode: "intro",
  });
  const maxMain = resolvePodcastSectionSpeakingRate({
    host: "max",
    mode: "main",
  });
  const maxClosing = resolvePodcastSectionSpeakingRate({
    host: "max",
    mode: "closing",
  });
  const saraClosing = resolvePodcastSectionSpeakingRate({
    host: "sara",
    mode: "closing",
  });
  const saraWordTour = resolvePodcastSectionSpeakingRate({
    host: "sara",
    mode: "wordTour",
  });

  assert.ok(maxIntro > maxMain);
  assert.ok(maxMain > maxClosing);
  assert.ok(saraClosing < saraWordTour);
  assert.equal(
    resolvePodcastSectionSpeakingRate({
      host: "max",
      mode: "intro",
      explicitSpeed: 0.85,
    }),
    0.85,
  );
  assert.match(getPodcastSectionDelivery("sara", "intro").tone, /bright|curious|playful/i);
});

test("Max long intro lines get a vivacity rate boost", () => {
  const short = resolvePodcastSectionSpeakingRate({
    host: "max",
    mode: "intro",
    spokenText: "They have been through a lot.",
  });
  const long = resolvePodcastSectionSpeakingRate({
    host: "max",
    mode: "intro",
    spokenText:
      "Yes. Beginning again after you stopped. Starting English again after a long break. Going back to exercise. Opening an old notebook. Returning to a project. Trying again when part of you feels embarrassed.",
  });
  assert.ok(long > short);
  assert.ok(long >= 1.12);
  assert.equal(
    resolvePodcastSectionSpeakingRate({
      host: "sara",
      mode: "intro",
      spokenText:
        "Yes. Beginning again after you stopped. Starting English again after a long break. Going back to exercise. Opening an old notebook.",
    }),
    getPodcastSectionDelivery("sara", "intro").speakingRate,
  );
});
