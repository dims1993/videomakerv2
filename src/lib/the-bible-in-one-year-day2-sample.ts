/**
 * Day 2 golden sample request + scenes for Bible in One Year compact-flow.
 */

import {
  BIBLE_ONE_YEAR_REFLECTION_OPENER,
  buildBibleOneYearCoverBeatDirectives,
  prepareBibleOneYearCompactScript,
} from "@/lib/the-bible-in-one-year-compact-script";
import {
  BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_STYLE_LOCK_COVER,
  BIBLE_ONE_YEAR_STYLE_LOCK_EPISODE_COVER,
  BIBLE_ONE_YEAR_OPEN_BIBLE_PAGE_GUARD,
  BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT,
  BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR,
  BIBLE_ONE_YEAR_STYLE_LOCK_INSERT,
  BIBLE_ONE_YEAR_STYLE_LOCK_INTERIOR,
  BIBLE_ONE_YEAR_VISIBLE_TEXT_NONE,
} from "@/lib/the-bible-in-one-year-final-image-prompt-contract";
import {
  buildBibleOneYearGenerationModeInstructions,
  buildBibleOneYearOutputRequirementsSection,
  buildBibleOneYearTimingRules,
  buildBibleOneYearVisualBrief,
} from "@/lib/the-bible-in-one-year-visual-brief";

export const DAY2_SCRIPT = `[INTRODUCTION]

The Bible in One Year — Day 2.

Welcome to Day 2 of The Bible in One Year.

I'm truly glad you are here as we continue this journey through God's Word together.

And if, after today's reading, you can carry with you just one thought that speaks to your life, then the time we have spent together will already have been worthwhile.

Today, we will read Genesis 3–4.

Let us begin.

[CHAPTER COVER — GENESIS 3]

Genesis, chapter 3.

When the woman saw that the tree was good for food, she took some of its fruit, and ate.

[CHAPTER COVER — GENESIS 4]

Genesis, chapter 4.

Cain told Abel, his brother.

[CHAPTER COVER — GENESIS 5]

Genesis, chapter 5.

This is the book of the generations of Adam.

[REFLECTION AND PRAYER]

${BIBLE_ONE_YEAR_REFLECTION_OPENER}

Sin separates, but God still calls people back to Himself.

Pray with me.

Father, soften our hearts.

In Jesus' name, amen.

[CLOSING]

Thank you for joining Day 2 of The Bible in One Year.

To mark your progress, comment "Day 2 complete" below.

If one verse or thought stayed with you, you are welcome to share it.

We will continue with Genesis 5–7.

May God's Word remain with you.

[FINAL]`;

export function parchmentEpisodeCoverPrompt(title: string) {
  return `${BIBLE_ONE_YEAR_STYLE_LOCK_EPISODE_COVER} Waist-up view of ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK} standing at one side of the parchment title, one gently open hand presenting the title without covering it. Large classical dark-brown serif title in the upper half with tiny symmetrical flourishes. Lower half shows sunrise over calm water above an open Bible. ${BIBLE_ONE_YEAR_OPEN_BIBLE_PAGE_GUARD} visible text limited to: ${title}. No other readable writing, captions, letters, numbers, logos, or words. ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`;
}

export function parchmentChapterCoverPrompt(title: string, lower: string) {
  return `${BIBLE_ONE_YEAR_STYLE_LOCK_COVER} Large classical dark-brown serif title in the upper half with tiny symmetrical flourishes. Lower half: ${lower} above an open Bible. ${BIBLE_ONE_YEAR_OPEN_BIBLE_PAGE_GUARD} visible text limited to: ${title}. No other readable writing, captions, letters, numbers, logos, or words. ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`;
}

/** Golden sample scenes for Day 2 acceptance checks (schema unchanged). */
export const DAY2_SAMPLE_SCENES = [
  {
    order: 1,
    scriptText: "The Bible in One Year — Day 2.",
    sceneType: "insert" as const,
    visualPurpose: "Open the episode",
    visualIdea: "Chapter cover: THE BIBLE IN ONE YEAR — DAY 2, parchment episode cover with pastor",
    duration: 6,
    imagePrompt: parchmentEpisodeCoverPrompt("THE BIBLE IN ONE YEAR — DAY 2"),
    status: "planned" as const,
  },
  {
    order: 2,
    scriptText: "Welcome to Day 2 of The Bible in One Year.",
    sceneType: "avatar" as const,
    visualPurpose: "Personal welcome",
    visualIdea: "Narrative scene: Pastor beside open Bible inviting toward empty chair",
    duration: 5,
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR} Medium view of ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK} standing beside an open Bible, gently inviting the listener toward an empty chair. Keep the welcome restrained rather than theatrical. One focal relationship. ${BIBLE_ONE_YEAR_OPEN_BIBLE_PAGE_GUARD} ${BIBLE_ONE_YEAR_VISIBLE_TEXT_NONE} ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`,
    status: "planned" as const,
  },
  {
    order: 3,
    scriptText: "When the woman saw that the tree was good for food,",
    sceneType: "avatar" as const,
    visualPurpose: "Eve observes the fruit",
    visualIdea: "Narrative scene: Eve observing the fruit",
    duration: 4,
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR} Medium view of Eve as a dignified first woman: youthful adult, long dark hair, warm olive-tan complexion, calm features, simple unadorned biblical-era wrap, respectful non-erotic framing with natural modesty, watercolor-and-ink storybook treatment, looking intently at fruit on the tree. One focal action. ${BIBLE_ONE_YEAR_VISIBLE_TEXT_NONE} ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`,
    status: "planned" as const,
  },
  {
    order: 4,
    scriptText: "she took some of its fruit, and ate.",
    sceneType: "avatar" as const,
    visualPurpose: "Eve takes and eats",
    visualIdea: "Narrative scene: Eve reaching for fruit",
    duration: 4,
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR} Close view of Eve reaching for and taking fruit from the branch, one continuous action of taking. Keep the gesture deliberate rather than sensational. One focal action. ${BIBLE_ONE_YEAR_VISIBLE_TEXT_NONE} ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`,
    status: "planned" as const,
  },
  {
    order: 5,
    scriptText: BIBLE_ONE_YEAR_REFLECTION_OPENER,
    sceneType: "insert" as const,
    visualPurpose: "Open reflection",
    visualIdea: "Chapter cover: REFLECT AND PRAY, parchment reflection cover",
    duration: 7,
    imagePrompt: parchmentChapterCoverPrompt(
      "REFLECT AND PRAY",
      "open Bible, reflection slip, pencil, calm water and distant hills communicating completion and transition",
    ),
    status: "planned" as const,
  },
  {
    order: 6,
    scriptText: "Pray with me.",
    sceneType: "avatar" as const,
    visualPurpose: "Invite prayer",
    visualIdea: "Narrative scene: Pastor bows beside open Bible",
    duration: 4,
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR} Medium view of ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK} bowing beside the open Bible while an empty chair remains visible. The posture should read as prayer rather than performance. One focal action. ${BIBLE_ONE_YEAR_OPEN_BIBLE_PAGE_GUARD} ${BIBLE_ONE_YEAR_VISIBLE_TEXT_NONE} ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`,
    status: "planned" as const,
  },
  {
    order: 7,
    scriptText: "In Jesus' name, amen.",
    sceneType: "avatar" as const,
    visualPurpose: "Close prayer",
    visualIdea: "Narrative scene: Pastor lifts his head after prayer",
    duration: 4,
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR} Medium view of ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK} lifting his head slightly after prayer with a peaceful expression. One focal action. visible text limited to: AMEN. No other readable writing, captions, letters, numbers, logos, or words. ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`,
    status: "planned" as const,
  },
  {
    order: 8,
    scriptText: "Thank you for joining Day 2 of The Bible in One Year.",
    sceneType: "avatar" as const,
    visualPurpose: "Thank the listener",
    visualIdea: "Narrative scene: Pastor thanks listener beside closed Bible",
    duration: 5,
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR} Medium view of ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK} thanking the listener beside a closed Bible with ribbon visible. One focal relationship. visible text limited to: THANK YOU. No other readable writing, captions, letters, numbers, logos, or words. ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`,
    status: "planned" as const,
  },
  {
    order: 9,
    scriptText: 'To mark your progress, comment "Day 2 complete" below.',
    sceneType: "insert" as const,
    visualPurpose: "Invite progress comment",
    visualIdea: "Object/detail insert: Day 2 complete progress note",
    duration: 4,
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_INSERT} Overhead close view of a parchment-like progress slip beside a Bible ribbon. visible text limited to: DAY 2 COMPLETE. No other readable writing, captions, letters, numbers, logos, or words. ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`,
    status: "planned" as const,
  },
  {
    order: 10,
    scriptText: "We will continue with Genesis 5–7.",
    sceneType: "insert" as const,
    visualPurpose: "Preview next reading",
    visualIdea: "Object/detail insert: Ribbon moving to next passage",
    duration: 4,
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_INSERT} Close view of a Bible ribbon moving to the next passage marker. visible text limited to: NEXT — GENESIS 5–7. No other readable writing, captions, letters, numbers, logos, or words. ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`,
    status: "planned" as const,
  },
  {
    order: 11,
    scriptText: "May God's Word remain with you.",
    sceneType: "space" as const,
    visualPurpose: "Final blessing",
    visualIdea: "Atmosphere/space: Quiet interior with Bible in soft light",
    duration: 5,
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_INTERIOR} Elevated wide view of a quiet interior where a closed Bible remains in soft light on a simple surface. No pastor required. The stillness should feel restful rather than empty. One focal environment. ${BIBLE_ONE_YEAR_VISIBLE_TEXT_NONE} ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`,
    status: "planned" as const,
  },
  {
    order: 12,
    scriptText: "",
    sceneType: "insert" as const,
    visualPurpose: "Video-library FINAL bumper (empty scriptText; exclusive clip audio).",
    visualIdea: "SECTION_CLIP | FINAL: end bumper",
    duration: 5,
    imagePrompt: "",
    status: "planned" as const,
  },
];

export function buildDay2SampleChatGptRequest() {
  const prepared = prepareBibleOneYearCompactScript(DAY2_SCRIPT);
  return [
    "# ChatGPT Scene Generation Request",
    "",
    "* requestFormat: compact-flow",
    "* categoryFormat: bible-in-one-year",
    "* generationMode: FULL_VIDEO",
    "",
    "## Generation Mode",
    "",
    buildBibleOneYearGenerationModeInstructions("FULL_VIDEO"),
    "",
    buildBibleOneYearVisualBrief(),
    "",
    buildBibleOneYearTimingRules(),
    "",
    buildBibleOneYearCoverBeatDirectives(prepared),
    "",
    "## Compact Video Context",
    "",
    prepared,
    "",
    buildBibleOneYearOutputRequirementsSection(),
  ].join("\n");
}
