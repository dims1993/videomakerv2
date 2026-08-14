import assert from "node:assert/strict";
import { test } from "node:test";

import { validatePodcastEnglishScript } from "@/lib/podcast-english-lessons-script-validate";

function buildMinimalValidScript(options?: {
  parts?: number;
  wordsPad?: string;
  echo?: boolean;
}) {
  const parts = options?.parts ?? 11;
  const pad = options?.wordsPad ?? "This is clear A1 practice English for hungry learners who want real conversation skills today. ";
  const partBlocks = Array.from({ length: parts }, (_, index) => {
    const n = index + 1;
    const title =
      n === parts - 4
        ? "LISTEN AND REPEAT"
        : n === parts - 3
          ? "YOUR TURN"
          : n === parts - 2
            ? "BUILD YOUR OWN"
            : n === parts - 1
              ? "QUICK SPEAKING QUIZ"
              : n === parts
                ? "TODAY'S MISSION"
                : `THEME ${n}`;
    return `[PART ${n} - ${title}]

[EMMA]
${pad}

[PAUSE: 3s]

[LEO]
${options?.echo ? pad : `Okay. I can try this in my own words now. ${pad}`}
`;
  }).join("\n");

  return `[INTRO]

[EMMA]
Leo, quick challenge for restaurant English today.

[LEO]
I am ready, but a little hungry and confused.

[LESSON]

${partBlocks}
[CLOSING]

[EMMA]
Let's recap. You practiced Listen and Repeat, Your Turn, Build Your Own, Quick Speaking Quiz, and Today's Mission. See Day 4 preview tomorrow for shopping English. Subscribe and practice out loud.

[LEO]
Day complete. My stomach says thank you.

[LEO]
Thank you for listening to Podcast English Lessons.

[EMMA]
We hope this conversation helped you feel understood and learn useful natural English for introductions, practice, and everyday speaking.

[FINAL]
`;
}

test("validatePodcastEnglishScript accepts a spine-correct script", () => {
  const script = buildMinimalValidScript();
  const result = validatePodcastEnglishScript(script);
  assert.equal(result.metrics.hasIntro, true);
  assert.equal(result.metrics.hasFinal, true);
  assert.equal(result.metrics.partCount, 11);
  assert.ok(result.metrics.spokenWordCount > 500);
});

test("validatePodcastEnglishScript rejects music cues and INTRODUCTION", () => {
  const bad = `[INTRODUCTION]

[EMMA]
Hi.

[MUSIC: begin]

[LESSON]

[PART 1 - HI]

[EMMA]
Hi.

[CLOSING]

[EMMA]
Bye.

[FINAL]

[EMMA]
Bye.
`;
  const result = validatePodcastEnglishScript(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "intro_alias" || issue.code === "music_cue" || issue.code === "spine_order"));
});

test("validatePodcastEnglishScript detects mechanical Emma→Leo echoes", () => {
  const result = validatePodcastEnglishScript(
    buildMinimalValidScript({ echo: true, parts: 11 }),
  );
  assert.ok(result.errors.some((issue) => issue.code === "mechanical_echo"));
});

test("validatePodcastEnglishScript requires forced thanks then FINAL last", () => {
  const bad = `[INTRO]

[EMMA]
Hi there friend for a longer cold open line.

[LESSON]

${Array.from({ length: 11 }, (_, i) => `[PART ${i + 1} - THEME ${i + 1}]\n\n[EMMA]\nPractice line number ${i + 1} with enough words for the validator word floor to eventually still fail elsewhere.\n\n[PAUSE: 3s]\n\n[LEO]\nI answer with different words every time for part ${i + 1}.\n`).join("\n")}
[CLOSING]

[EMMA]
Recap Listen and Repeat Your Turn Build Your Own Quiz Mission CTA preview.

[FINAL]

[LEO]
Bye from Leo wrongly.
`;
  const result = validatePodcastEnglishScript(bad);
  assert.ok(result.errors.some((issue) => issue.code === "final_not_last"));
  assert.ok(
    result.errors.some((issue) => issue.code === "final_missing_forced_thanks"),
  );
});

function buildMinimalMaxSaraScript(options?: {
  parts?: number;
  includePracticeLanguage?: boolean;
  includeEmma?: boolean;
  pad?: string;
}) {
  const parts = options?.parts ?? 9;
  const pad =
    options?.pad ??
    "We talk about everyday English in a natural way so listeners can follow and learn useful phrases in context today. ";
  const partBlocks = Array.from({ length: parts }, (_, index) => {
    const n = index + 1;
    const title =
      n === parts
        ? "RECAP AND COMMENT QUESTION"
        : n === parts - 1
          ? "USEFUL PHRASES FROM TODAY"
          : `BEAT ${n}`;
    return `[PART ${n} - ${title}]

[MAX]
${pad}

[SARA]
${pad} That makes sense. Can you give me an example?
`;
  }).join("\n");

  const practiceLine = options?.includePracticeLanguage
    ? "Now do Listen and Repeat, then Your Turn, then Today's Mission."
    : "Have you ever had a group chat that made a simple plan more confusing? Write one short sentence in the comments.";

  const castLine = options?.includeEmma
    ? `[EMMA]\nWrong cast line.\n`
    : "";

  return `[INTRO]

[MAX]
Sara, I opened the group chat to check one simple plan.

[SARA]
And you found twenty messages that somehow make the plan less clear?

[LESSON]

${castLine}${partBlocks}
[CLOSING]

[MAX]
So the Group Chat Spiral is when each new maybe, delay, or question makes the plan harder. Useful phrases today: What's the plan, That works for me, I can't make it, Let's decide.

[SARA]
${practiceLine}

[MAX]
Thank you for listening to Podcast English Lessons.

[SARA]
We hope this conversation helped you feel understood and learn useful natural English for group chats, plans, and clear messages.

[FINAL]
`;
}

test("validatePodcastEnglishScript accepts Max & Sara conversation spine", () => {
  const result = validatePodcastEnglishScript(
    buildMinimalMaxSaraScript(),
    "max_sara_conversation",
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.metrics.format, "max_sara_conversation");
  assert.equal(result.metrics.partCount, 9);
  assert.ok(result.metrics.spokenWordCount > 200);
});

test("validatePodcastEnglishScript rejects Emma/Leo and practice language for Max & Sara", () => {
  const withEmma = validatePodcastEnglishScript(
    buildMinimalMaxSaraScript({ includeEmma: true }),
    "max_sara_conversation",
  );
  assert.equal(withEmma.ok, false);
  assert.ok(withEmma.errors.some((issue) => issue.code === "wrong_cast"));

  const withPractice = validatePodcastEnglishScript(
    buildMinimalMaxSaraScript({ includePracticeLanguage: true }),
    "max_sara_conversation",
  );
  assert.equal(withPractice.ok, false);
  assert.ok(
    withPractice.errors.some((issue) => issue.code === "forbidden_practice_beat"),
  );
});

test("validatePodcastEnglishScript rejects learner pauses for Max & Sara", () => {
  const script = buildMinimalMaxSaraScript().replace(
    "[PART 1 - BEAT 1]",
    "[PART 1 - BEAT 1]\n\n[PAUSE: 4s]",
  );
  const result = validatePodcastEnglishScript(script, "max_sara_conversation");
  assert.ok(result.errors.some((issue) => issue.code === "learner_pause"));
});

test("validatePodcastEnglishScript warns on didactic vocab and thin catch-up for Max & Sara", () => {
  const thin = `[INTRO]

[MAX]
Today we will study vocabulary for group chats.

[SARA]
The first vocabulary word is maybe.

[LESSON]

${Array.from({ length: 9 }, (_, i) => `[PART ${i + 1} - ${i === 7 ? "VOCABULARY LIST" : `BEAT ${i + 1}`}]\n\n[MAX]\nWe talk about everyday English in a natural way so listeners can follow and learn useful phrases in context today.\n\n[SARA]\nThat makes sense. Can you give me an example?\n`).join("\n")}
[CLOSING]

[MAX]
So the Group Chat Spiral is when each new maybe makes the plan harder.

[SARA]
Have you ever had a group chat that made a simple plan more confusing? Write one short sentence in the comments.

[MAX]
Thank you for listening to Podcast English Lessons.

[SARA]
We hope this conversation helped you feel understood and learn useful natural English for group chats, plans, and clear messages.

[FINAL]
`;
  const result = validatePodcastEnglishScript(thin, "max_sara_conversation");
  assert.ok(result.warnings.some((issue) => issue.code === "thin_catchup"));
  assert.ok(
    result.warnings.some((issue) => issue.code === "didactic_vocab_framing"),
  );
  assert.ok(
    result.warnings.some((issue) => issue.code === "classroom_vocab_part_title"),
  );
});

test("validatePodcastEnglishScript warns on duplicate phrase-collection PARTs for Max & Sara", () => {
  const pad =
    "We talk about everyday English in a natural way so listeners can follow and learn useful phrases in context today. ";
  const script = `[INTRO]

[MAX]
You looked focused before we started recording.

[SARA]
I was reading the group chat on my phone.

[MAX]
That sounds dangerous.

[SARA]
I needed a map, a calendar, and maybe a lawyer.

[MAX]
A lawyer?

[SARA]
Emotionally, yes.

[MAX]
Welcome back. Today we talk about confusing plans.

[SARA]
Yes, the Group Chat Spiral.

[LESSON]

[PART 1 - THE GROUP CHAT PROBLEM]
[MAX]
${pad}
[SARA]
${pad}

[PART 2 - WHY A SIMPLE PLAN GETS HARDER]
[MAX]
${pad}
[SARA]
${pad}

[PART 3 - THE GROUP CHAT SPIRAL]
[MAX]
${pad}
[SARA]
${pad}

[PART 4 - WHEN EVERYONE ANSWERS]
[MAX]
${pad}
[SARA]
${pad}

[PART 5 - POLITE BUT UNCLEAR]
[MAX]
${pad}
[SARA]
${pad}

[PART 6 - MAXS STORY]
[MAX]
${pad}
[SARA]
${pad}

[PART 7 - SARAS STORY]
[MAX]
${pad}
[SARA]
${pad}

[PART 8 - MESSAGES THAT ACTUALLY HELP]
[MAX]
${pad}
[SARA]
${pad}

[PART 9 - CLEAR PHRASES FROM THE CONVERSATION]
[MAX]
${pad}
[SARA]
${pad}

[CLOSING]
[MAX]
So today we talked about The Group Chat Spiral.
[SARA]
Have you ever had a group chat that made a simple plan more confusing? Write one short sentence in the comments.

[MAX]
Thank you for listening to Podcast English Lessons.

[SARA]
We hope this conversation helped you feel understood and learn useful natural English for group chats, plans, and clear messages.

[FINAL]
`;
  const result = validatePodcastEnglishScript(script, "max_sara_conversation");
  assert.ok(
    result.warnings.some((issue) => issue.code === "duplicate_phrase_collection"),
    JSON.stringify(result.warnings, null, 2),
  );
});

test("resolvePodcastEpisodeFormat prefers Max & Sara for conversational topics", async () => {
  const { resolvePodcastEpisodeFormat } = await import(
    "@/lib/podcast-english-lessons-script-shared"
  );
  assert.equal(
    resolvePodcastEpisodeFormat({
      channelKey: "podcast-english-lessons",
      topicEngine: "conversational_podcast",
      title: "When A Simple Group Chat Becomes Complicated | Natural English Conversation",
      ideaJson: {
        workingTitle:
          "When A Simple Group Chat Becomes Complicated | Natural English Conversation",
        uniqueMechanism: "The Group Chat Spiral",
        seriesConcept: "Natural Daily English Conversations with Max & Sara",
      },
    }),
    "max_sara_conversation",
  );
  assert.equal(
    resolvePodcastEpisodeFormat({
      channelKey: "podcast-english-lessons",
      ideaJson: { podcastEpisodeFormat: "emma_leo_lesson" },
    }),
    "emma_leo_lesson",
  );
});
