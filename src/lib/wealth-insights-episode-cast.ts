/**
 * Episode cast lock for Wealth Insights default mode.
 * App-owned recurring story-character descriptors so fill chunks stay consistent.
 */

import { stripStructuralMarkers } from "@/lib/visual-plan-script";

export const WEALTH_INSIGHTS_STORY_VISUAL_IDEA_PREFIXES = [
  "MAIN HOST:",
  "MAIN HOST + STORY:",
  "STORY_CHARACTER:",
  "STORY_PAIR:",
] as const;

export type WealthEpisodeCastMember = {
  /** Display name as it appears in the script (e.g. Ryan). */
  name: string;
  /** Stable visual descriptor reused every time this character appears. */
  descriptor: string;
  /** Mentions found in the spoken script. */
  mentionCount: number;
};

export type WealthEpisodeCastLock = {
  characters: WealthEpisodeCastMember[];
};

const NAME_STOPWORDS = new Set(
  [
    "The",
    "This",
    "That",
    "These",
    "Those",
    "There",
    "Then",
    "When",
    "What",
    "Why",
    "How",
    "Who",
    "Where",
    "Which",
    "After",
    "Before",
    "While",
    "During",
    "Until",
    "Since",
    "Because",
    "Although",
    "Though",
    "However",
    "Therefore",
    "Meanwhile",
    "Instead",
    "And",
    "But",
    "For",
    "With",
    "From",
    "Into",
    "Onto",
    "Over",
    "Under",
    "About",
    "After",
    "Again",
    "Also",
    "Even",
    "Just",
    "Like",
    "More",
    "Most",
    "Much",
    "Only",
    "Other",
    "Same",
    "Such",
    "Than",
    "Very",
    "Well",
    "Real",
    "Wealth",
    "Money",
    "Cash",
    "Debt",
    "Rent",
    "Home",
    "House",
    "Car",
    "Bank",
    "Stock",
    "Market",
    "Month",
    "Year",
    "Today",
    "Tomorrow",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
    "God",
    "Lord",
    "Jesus",
    "Bible",
    "America",
    "American",
    "English",
    "YouTube",
    "They",
    "Them",
    "Their",
    "Theirs",
    "She",
    "Her",
    "Hers",
    "He",
    "Him",
    "His",
    "You",
    "Your",
    "Yours",
    "We",
    "Our",
    "Ours",
    "Us",
    "It",
    "Its",
    "Someone",
    "Everyone",
    "Anyone",
    "Nobody",
    "People",
    "Person",
    "Thing",
    "Things",
    "Not",
    "Now",
    "Room",
    "Life",
    "Time",
    "Way",
    "One",
    "Two",
    "Three",
    "First",
    "Last",
    "Next",
    "Each",
    "Every",
    "Some",
    "Many",
    "Both",
    "All",
    "Own",
    "New",
    "Old",
    "Good",
    "Bad",
    "Big",
    "Small",
    "True",
    "False",
    "Maybe",
    "Still",
    "Already",
    "Always",
    "Never",
    "Often",
    "Here",
    "Back",
    "Down",
    "Away",
    "Inside",
    "Outside",
    "Left",
    "Right",
    "Sure",
    "Okay",
    "Yes",
    "Look",
    "See",
    "Say",
    "Said",
    "Tell",
    "Told",
    "Think",
    "Thought",
    "Know",
    "Knew",
    "Want",
    "Need",
    "Make",
    "Made",
    "Take",
    "Took",
    "Come",
    "Came",
    "Go",
    "Went",
    "Get",
    "Got",
    "Keep",
    "Kept",
    "Feel",
    "Felt",
    "Start",
    "Stop",
    "Change",
    "Choice",
    "Choices",
    "Decision",
    "Decisions",
    "Account",
    "Accounts",
    "Fee",
    "Fees",
    "Bill",
    "Bills",
    "Story",
    "Stories",
    "Secret",
    "Secrets",
    "Invisible",
    "Visible",
    "Boring",
    "Quiet",
    "Loud",
    "Real",
    "Wealth",
    "Better",
    "None",
    "Less",
    "Different",
    "Important",
    "Simple",
    "Hard",
    "Easy",
    "Wrong",
    "Right",
    "Enough",
    "Almost",
    "Actually",
    "Probably",
    "Maybe",
  ].map((word) => word.toLowerCase()),
);

function ideaField(ideaJson: unknown, keys: string[]): string {
  if (!ideaJson || typeof ideaJson !== "object" || Array.isArray(ideaJson)) {
    return "";
  }
  const record = ideaJson as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function spokenScript(script: string) {
  return stripStructuralMarkers(script).replace(/\s+/g, " ").trim();
}

function looksLikePersonName(token: string) {
  if (!/^[A-Z][a-z]{2,14}$/.test(token)) {
    return false;
  }
  if (NAME_STOPWORDS.has(token.toLowerCase())) {
    return false;
  }
  // All-caps acronyms already excluded by pattern.
  return true;
}

function inferGenderCue(script: string, name: string): "male" | "female" | "neutral" {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameRe = new RegExp(`\\b${escaped}\\b`, "i");
  // Limit to the same sentence so a nearby opposite-gender name does not cancel the cue.
  const sentences = script.split(/(?<=[.!?])\s+/);
  let male = 0;
  let female = 0;
  for (const sentence of sentences) {
    if (!nameRe.test(sentence)) continue;
    const words = sentence.split(/\s+/);
    const nameIndexes = words
      .map((word, index) =>
        new RegExp(`^${escaped}(?:'s|’s)?[.,!?]?$`, "i").test(word) ? index : -1,
      )
      .filter((index) => index >= 0);
    for (const nameIndex of nameIndexes) {
      const window = words
        .slice(Math.max(0, nameIndex - 2), nameIndex + 7)
        .join(" ")
        .toLowerCase();
      if (/\b(he|him|his)\b/.test(window)) male += 1;
      if (/\b(she|her|hers)\b/.test(window)) female += 1;
    }
  }
  if (female > male) return "female";
  if (male > female) return "male";
  return "neutral";
}

/**
 * Shared facial style DNA — compact cartoon look, no biometric detail.
 */
export const WEALTH_INSIGHTS_CAST_FACE_STYLE =
  "clean cartoon face, thick outlines, flat colors, simple shading";

/**
 * Fixed episode-cast appearance library (app-owned).
 * Outfits must be HIGH-CONTRAST and unmistakable so models cannot collapse Ryan/Maya.
 */
export const WEALTH_INSIGHTS_CAST_LOOK_LIBRARY = {
  male: [
    [
      "adult man early 30s, warm skin, short neat dark brown hair, side part,",
      "outfit: ivory knit polo, charcoal trousers, black belt, dark loafers.",
    ].join(" "),
    [
      "adult man mid 30s, medium-brown skin, short faded black hair, neat short beard,",
      "outfit: charcoal zip hoodie, gray tee, dark blue jeans, white sneakers.",
    ].join(" "),
    [
      "adult man late 20s, fair skin, straight black hair, side part, clean-shaven,",
      "outfit: olive button-down shirt, khaki pants, brown belt.",
    ].join(" "),
  ],
  female: [
    [
      "adult woman early 30s, warm skin, straight black shoulder-length hair, side part,",
      "outfit: sage-green cardigan, cream blouse, dark indigo jeans, gold stud earrings.",
    ].join(" "),
    [
      "adult woman late 20s, fair skin with light freckles, auburn hair in low ponytail,",
      "outfit: denim jacket, white tee, black pants, silver hoop earrings.",
    ].join(" "),
    [
      "adult woman mid 30s, light olive skin, dark brown hair in low bun,",
      "outfit: terracotta blouse, navy tailored pants, pearl studs.",
    ].join(" "),
  ],
  neutral: [
    [
      "adult early 30s, medium warm skin, short neat dark hair,",
      "outfit: heather-gray crewneck sweater, navy pants.",
    ].join(" "),
  ],
} as const;

export function buildWealthEpisodeCastDescriptor(
  name: string,
  gender: "male" | "female" | "neutral",
  lookIndex = 0,
) {
  const pool = WEALTH_INSIGHTS_CAST_LOOK_LIBRARY[gender];
  const look = pool[Math.abs(lookIndex) % pool.length]!;
  return [
    `original cartoon character ${name} (same face, hair, outfit every scene):`,
    look,
    WEALTH_INSIGHTS_CAST_FACE_STYLE,
  ].join(" ");
}

function assignCastLooks(
  ranked: Array<{ name: string; mentionCount: number; gender: "male" | "female" | "neutral" }>,
): WealthEpisodeCastMember[] {
  const genderCounters: Record<"male" | "female" | "neutral", number> = {
    male: 0,
    female: 0,
    neutral: 0,
  };
  // Stable within-episode: alphabetical within gender so Ryan/Maya keep the same look.
  const ordered = [...ranked].sort((a, b) => {
    if (a.gender !== b.gender) return a.gender.localeCompare(b.gender);
    return a.name.localeCompare(b.name);
  });
  return ordered.map((entry) => {
    const lookIndex = genderCounters[entry.gender];
    genderCounters[entry.gender] += 1;
    return {
      name: entry.name,
      mentionCount: entry.mentionCount,
      descriptor: buildWealthEpisodeCastDescriptor(
        entry.name,
        entry.gender,
        lookIndex,
      ),
    };
  });
}

/**
 * Extract recurring proper names from the spoken script (and light ideaJson hints)
 * and build stable episode cast descriptors.
 */
export function extractWealthEpisodeCastLock(options: {
  script: string;
  ideaJson?: unknown;
  maxCharacters?: number;
}): WealthEpisodeCastLock {
  const maxCharacters = options.maxCharacters ?? 4;
  const script = spokenScript(options.script || "");
  const counts = new Map<string, number>();

  if (script) {
    const tokens = script.match(/\b[A-Z][a-z]{2,14}\b/g) ?? [];
    for (const token of tokens) {
      if (!looksLikePersonName(token)) {
        continue;
      }
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  // Boost names that also appear in idea fields.
  const ideaBlob = [
    ideaField(options.ideaJson, ["emotionalHook", "emotional_hook"]),
    ideaField(options.ideaJson, ["visualAnchor", "visual_anchor"]),
    ideaField(options.ideaJson, ["workingTitle", "working_title", "title"]),
    ideaField(options.ideaJson, ["coreAngle", "uniqueMechanism"]),
  ]
    .filter(Boolean)
    .join(" ");
  for (const token of ideaBlob.match(/\b[A-Z][a-z]{2,14}\b/g) ?? []) {
    if (!looksLikePersonName(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 2);
  }

  const ranked = [...counts.entries()]
    .filter(([name, count]) => {
      if (count < 3) return false;
      return inferGenderCue(script, name) !== "neutral";
    })
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxCharacters)
    .map(([name, mentionCount]) => ({
      name,
      mentionCount,
      gender: inferGenderCue(script, name),
    }));

  return { characters: assignCastLooks(ranked) };
}

export function findWealthCastMember(
  cast: WealthEpisodeCastLock | null | undefined,
  name: string,
) {
  const needle = name.trim().toLowerCase();
  if (!needle || !cast?.characters?.length) {
    return null;
  }
  return (
    cast.characters.find((member) => member.name.toLowerCase() === needle) ??
    null
  );
}

export function parseWealthStoryVisualIdea(visualIdea: string | null | undefined): {
  kind: "main_host" | "host_plus_story" | "story_character" | "story_pair" | "other";
  names: string[];
  rest: string;
} {
  const trimmed = (visualIdea ?? "").trim();
  if (!trimmed) {
    return { kind: "other", names: [], rest: "" };
  }

  const hostPlus = trimmed.match(
    /^MAIN\s+HOST\s*\+\s*STORY:\s*([A-Za-z][A-Za-z'’\-]{1,20})\s*[—\-–:]\s*([\s\S]*)$/i,
  );
  if (hostPlus) {
    return {
      kind: "host_plus_story",
      names: [hostPlus[1]!],
      rest: (hostPlus[2] ?? "").trim(),
    };
  }

  const storyChar = trimmed.match(
    /^STORY_CHARACTER:\s*([A-Za-z][A-Za-z'’\-]{1,20})\s*[—\-–:]\s*([\s\S]*)$/i,
  );
  if (storyChar) {
    return {
      kind: "story_character",
      names: [storyChar[1]!],
      rest: (storyChar[2] ?? "").trim(),
    };
  }

  const storyPair = trimmed.match(
    /^STORY_PAIR:\s*([A-Za-z][A-Za-z'’\-]{1,20})\s*\+\s*([A-Za-z][A-Za-z'’\-]{1,20})\s*[—\-–:]\s*([\s\S]*)$/i,
  );
  if (storyPair) {
    return {
      kind: "story_pair",
      names: [storyPair[1]!, storyPair[2]!],
      rest: (storyPair[3] ?? "").trim(),
    };
  }

  if (/^MAIN\s+HOST:/i.test(trimmed)) {
    return {
      kind: "main_host",
      names: [],
      rest: trimmed.replace(/^MAIN\s+HOST:\s*/i, "").trim(),
    };
  }

  return { kind: "other", names: [], rest: trimmed };
}

export function buildWealthEpisodeCastLockPromptBlock(
  cast: WealthEpisodeCastLock | null | undefined,
): string | null {
  if (!cast?.characters?.length) {
    return null;
  }

  return [
    "## Episode Cast (original fictional characters — keep consistent)",
    "",
    "These are original fictional story characters created for THIS episode only.",
    "When scriptText names or clearly implies them, put them on screen",
    "(alone, as a pair, or with the finance educator character).",
    "Do NOT invent new named people outside this list.",
    "Do NOT change hair, outfit, age band, skin tone, or face shape between chunks.",
    "Paste each character's episode-consistent original design into Must show whenever that character appears.",
    "Never redesign clothes or hairstyle for a cast member — only pose / emotion / action may change.",
    "Describe everyone as original fictional cartoon designs. Never ask Flow to reproduce a shared character universe, brand mascot, celebrity, or pre-existing IP.",
    "",
    ...cast.characters.map(
      (member, index) =>
        `${index + 1}. ${member.name} (${member.mentionCount} mentions): ${member.descriptor}`,
    ),
    "",
    "visualIdea prefixes for this mode:",
    '- "MAIN HOST: …" — finance educator explains a mechanism / meta beat',
    '- "STORY_CHARACTER: Ryan — …" — story character alone (use real cast name)',
    '- "MAIN HOST + STORY: Ryan — …" — educator together with one story character',
    '- "STORY_PAIR: Ryan + Maya — …" — two story characters in contrast/together',
  ].join("\n");
}
