/**
 * Modular avatar imagePrompt compiler for podcast-english-lessons.
 * Affects Emma/Leo avatar imagePrompt only — not PART_COVER, SECTION_CLIP, music, or other channels.
 */

export const PODCAST_AVATAR_STYLE_LOCK =
  "Soft semi-flat 2D editorial educational illustration with clean dark outlines, warm muted colors and lightly textured shading. Polished educational YouTube aesthetic, friendly adult character design, natural proportions, warm soft lighting.";

export const PODCAST_AVATAR_EMMA_CHARACTER_LOCK =
  "Recurring adult female English teacher Emma, short voluminous curly chestnut-brown bob, round dark-framed glasses, warm brown eyes, expressive adult face with softly defined features, small gold hoop earrings, friendly confident teacher presence. Adult stylized but natural proportions, elegant elongated silhouette, realistic head-to-body proportion, refined shoulders and waist, graceful posture, not chibi, not childlike, not oversized head, not tiny body, not doll-like proportions.";

export const PODCAST_AVATAR_LEO_CHARACTER_LOCK =
  "Recurring adult male English learner Leo, short dark-brown tidy textured hair, warm brown eyes, clean-shaven face, no beard, no stubble, no facial hair, friendly curious learner presence. Adult stylized but natural proportions, realistic head-to-body proportion, relaxed adult posture, not chibi, not childlike, not oversized head, not tiny body, not doll-like proportions.";

export const PODCAST_AVATAR_EMMA_COMPOSITION_LOCK =
  "Medium shot from mid-thigh up or waist up, slight three-quarter front angle, Emma framed slightly right of center, face unobstructed, natural teacher gesture, clear lower-center area left empty for later subtitles.";

export const PODCAST_AVATAR_LEO_COMPOSITION_LOCK =
  "Medium shot from mid-thigh up or waist up, slight three-quarter front angle, Leo framed slightly left of center, face unobstructed, eyeline slightly toward off-camera Emma, clear lower-center area left empty for later subtitles.";

export const PODCAST_AVATAR_SHOPPING_ENVIRONMENT_LOCK =
  "Generic shopping center or clothing store environment, warm retail lighting, softly blurred clothing racks, shelves, display tables, mall corridors, glass railings, indoor plants, fitting-room areas or checkout counters. No brand identity, no readable signage, no logos.";

export const PODCAST_AVATAR_STUDIO_ENVIRONMENT_LOCK =
  "Seated behind the same wooden podcast desk in the locked cozy studio, silver microphone on a black articulated boom arm, open notebook, pen and light ceramic mug, daylight window on camera-left, small shelf with books and plant, warm beige wall, terracotta and navy panels, low bookshelf and warm lamp.";

export const PODCAST_AVATAR_SUBTITLE_SAFE_LOCK =
  "Clear lower-center area left empty for later burned-in subtitles. Do not draw any subtitle, caption, or speech text into the image.";

export const PODCAST_AVATAR_NEGATIVE_LOCK =
  "No visible text, no letters, no numbers, no words, no captions, no subtitles, no speech bubbles, no signs, no labels, no readable writing, no chalkboards with writing, no posters with writing, no logos, no trademarks, no watermark, no photorealism, no 3D, no anime, no chibi proportions, no childlike body, no oversized head, no tiny body, no doll-like proportions, no duplicated character, no extra hosts, no clutter.";

const SHOPPING_SIGNAL_PATTERN =
  /\b(shopping|shop|store|clothes|clothing|shirt|shoes|size|price|fitting\s*room|changing\s*room|checkout|pay|card|cash|buy|mall|shopping\s*center)\b/i;

export const SHOPPING_LOCATIONS = {
  mall_atrium:
    "in a bright shopping center atrium with soft mall architecture, glass railings, indoor plants, and warm storefront lighting",
  mall_corridor:
    "in a clean shopping center corridor with softly blurred storefronts, plants, glass railings, and warm overhead lighting",
  clothing_rack:
    "inside a generic shopping-center clothing store beside a long clothing rack",
  display_table:
    "beside a neat clothing display table with folded shirts and warm retail lighting",
  fitting_room:
    "near a generic fitting-room area with plain doors, a soft mirror area, and warm lighting",
  mirror_area:
    "beside a full-length mirror area with a bench and softly blurred clothing racks",
  checkout:
    "near a generic checkout counter with a blank payment terminal and plain shopping bags",
  shoe_section:
    "in a generic shoe section with simple shelves and unbranded shoe displays",
  accessories_display:
    "near a generic accessories display with simple bags, scarves, and neutral shelves",
} as const;

export const EMMA_EXPRESSIONS = {
  encouraging_smile: "friendly confident teacher smile",
  calm_explanation: "calm focused teaching expression",
  gentle_laugh: "warm amused smile, gentle laugh expression",
  supportive_pause:
    "patient encouraging expression as if giving the learner time to answer",
  proud_encouragement: "proud encouraging teacher smile",
} as const;

export const LEO_EXPRESSIONS = {
  curious: "friendly curious learner expression",
  mildly_nervous:
    "mildly nervous but amused expression, eyebrows slightly raised",
  confused: "slightly confused but still friendly expression",
  focused: "focused learner expression with relaxed concentration",
  proud: "proud but modest learner smile",
  surprised_polite:
    "gently surprised expression, eyebrows raised, small polite half-smile",
  thinking: "thoughtful decision-making expression",
  embarrassed_amused: "mildly embarrassed but amused expression",
} as const;

export const EMMA_GESTURES = {
  open_palm_teaching: "one hand making a natural open-palm teaching gesture",
  pointing_gently: "one hand pointing gently toward the nearby shopping area",
  holding_blank_cards:
    "holding two small blank cards with simple dot markers only, no readable letters or numbers",
  guiding_direction: "one hand making a calm guiding gesture",
  supportive_wave: "small supportive wave with one hand",
} as const;

export const LEO_GESTURES = {
  asking_question: "one hand slightly raised as if asking a polite question",
  comparing_shirts:
    "holding two plain shirts on hangers, comparing them with a mildly uncertain smile",
  checking_price:
    "holding a folded shirt and looking at a blank price-tag shape with no readable text",
  touching_rack:
    "one hand lightly touching the clothing rack while listening",
  thinking_chin:
    "one finger resting lightly near his chin in a natural thinking gesture",
  paying_card:
    "holding a plain blank payment card near a simple payment terminal",
  small_thumbs_up: "giving a small modest thumbs-up, not exaggerated",
  adjusting_sleeve:
    "lightly adjusting the sleeve of a plain shirt or jacket",
  holding_bag: "holding a plain shopping bag close to his side",
} as const;

export const EMMA_WARDROBES = {
  emma_default_shopping:
    "teal blouse, mustard cardigan, high-waisted dark trousers, simple flats",
  emma_burgundy_cream:
    "burgundy blouse, cream cropped cardigan, high-waisted charcoal trousers, simple elegant flats",
  emma_green_beige:
    "deep green blouse, beige knitted cardigan, dark trousers, simple flats",
  emma_teal_blazer:
    "teal blouse, light camel blazer, dark tailored trousers, comfortable shoes",
} as const;

export const LEO_WARDROBES = {
  leo_default_shopping:
    "navy dark-blue casual overshirt over a light neutral T-shirt, dark chinos, simple sneakers",
  leo_jacket_cream:
    "dark navy lightweight jacket over a cream T-shirt, olive chinos, simple sneakers",
  leo_cardigan_gray:
    "dark-blue cardigan over a light gray shirt, charcoal trousers, simple sneakers",
  leo_navy_tan:
    "navy overshirt over a light beige T-shirt, tan chinos, simple sneakers",
} as const;

export type PodcastAvatarSpeaker = "emma" | "leo";

export type ShoppingLocationId = keyof typeof SHOPPING_LOCATIONS;
export type EmmaExpressionId = keyof typeof EMMA_EXPRESSIONS;
export type LeoExpressionId = keyof typeof LEO_EXPRESSIONS;
export type EmmaGestureId = keyof typeof EMMA_GESTURES;
export type LeoGestureId = keyof typeof LEO_GESTURES;
export type EmmaWardrobeId = keyof typeof EMMA_WARDROBES;
export type LeoWardrobeId = keyof typeof LEO_WARDROBES;

export type PodcastAvatarSceneVariables = {
  environment: "studio" | "shopping";
  locationText: string;
  expressionText: string;
  gestureText: string;
  wardrobeText: string;
  locationId?: ShoppingLocationId;
  expressionId?: string;
  gestureId?: string;
  wardrobeId?: string;
};

function normalizeHaystack(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function detectPodcastShoppingVisualContext(options: {
  scriptText?: string | null;
  episodeContext?: string | null;
  title?: string | null;
  topicCategory?: string | null;
  visualAnchor?: string | null;
  topic?: string | null;
  visualIdea?: string | null;
  visualPurpose?: string | null;
}): boolean {
  const haystack = normalizeHaystack([
    options.scriptText,
    options.episodeContext,
    options.title,
    options.topicCategory,
    options.visualAnchor,
    options.topic,
    options.visualIdea,
    options.visualPurpose,
  ]);
  return SHOPPING_SIGNAL_PATTERN.test(haystack);
}

function pickStable<T>(items: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return items[hash % items.length]!;
}

export function classifyPodcastShoppingSceneVariables(options: {
  speaker: PodcastAvatarSpeaker;
  scriptText?: string | null;
  seed?: string | null;
}): PodcastAvatarSceneVariables {
  const text = (options.scriptText ?? "").toLowerCase();
  const seed = options.seed?.trim() || text || options.speaker;

  const emmaWardrobeId = pickStable(
    Object.keys(EMMA_WARDROBES) as EmmaWardrobeId[],
    `emma-wardrobe-${seed}`,
  );
  const leoWardrobeId = pickStable(
    Object.keys(LEO_WARDROBES) as LeoWardrobeId[],
    `leo-wardrobe-${seed}`,
  );

  let locationId: ShoppingLocationId = pickStable(
    ["mall_corridor", "clothing_rack"] as const,
    `loc-fallback-${seed}`,
  );

  if (
    /\b(how much|price|expensive|dollars|cost)\b/i.test(text)
  ) {
    locationId = "display_table";
    if (options.speaker === "emma") {
      return {
        environment: "shopping",
        locationId,
        locationText: SHOPPING_LOCATIONS[locationId],
        expressionId: "calm_explanation",
        expressionText: EMMA_EXPRESSIONS.calm_explanation,
        gestureId: "pointing_gently",
        gestureText: EMMA_GESTURES.pointing_gently,
        wardrobeId: emmaWardrobeId,
        wardrobeText: EMMA_WARDROBES[emmaWardrobeId],
      };
    }
    return {
      environment: "shopping",
      locationId,
      locationText: SHOPPING_LOCATIONS[locationId],
      expressionId: "surprised_polite",
      expressionText: LEO_EXPRESSIONS.surprised_polite,
      gestureId: "checking_price",
      gestureText: LEO_GESTURES.checking_price,
      wardrobeId: leoWardrobeId,
      wardrobeText: LEO_WARDROBES[leoWardrobeId],
    };
  }

  if (/\b(size|medium|small|large|extra\s*large)\b/i.test(text)) {
    locationId = "clothing_rack";
    if (options.speaker === "emma") {
      return {
        environment: "shopping",
        locationId,
        locationText: SHOPPING_LOCATIONS[locationId],
        expressionId: "calm_explanation",
        expressionText: EMMA_EXPRESSIONS.calm_explanation,
        gestureId: "holding_blank_cards",
        gestureText: EMMA_GESTURES.holding_blank_cards,
        wardrobeId: emmaWardrobeId,
        wardrobeText: EMMA_WARDROBES[emmaWardrobeId],
      };
    }
    const sizeGestureId = pickStable(
      ["touching_rack", "comparing_shirts"] as const,
      `size-gesture-${seed}`,
    );
    return {
      environment: "shopping",
      locationId,
      locationText: SHOPPING_LOCATIONS[locationId],
      expressionId: "focused",
      expressionText: LEO_EXPRESSIONS.focused,
      gestureId: sizeGestureId,
      gestureText: LEO_GESTURES[sizeGestureId],
      wardrobeId: leoWardrobeId,
      wardrobeText: LEO_WARDROBES[leoWardrobeId],
    };
  }

  if (/\b(try it on|fitting room|changing room)\b/i.test(text)) {
    locationId = pickStable(
      ["fitting_room", "mirror_area"] as const,
      `fit-${seed}`,
    );
    if (options.speaker === "emma") {
      return {
        environment: "shopping",
        locationId,
        locationText: SHOPPING_LOCATIONS[locationId],
        expressionId: "supportive_pause",
        expressionText: EMMA_EXPRESSIONS.supportive_pause,
        gestureId: "guiding_direction",
        gestureText: EMMA_GESTURES.guiding_direction,
        wardrobeId: emmaWardrobeId,
        wardrobeText: EMMA_WARDROBES[emmaWardrobeId],
      };
    }
    const fitExpressionId = pickStable(
      ["mildly_nervous", "focused"] as const,
      `fit-expr-${seed}`,
    );
    return {
      environment: "shopping",
      locationId,
      locationText: SHOPPING_LOCATIONS[locationId],
      expressionId: fitExpressionId,
      expressionText: LEO_EXPRESSIONS[fitExpressionId],
      gestureId: "adjusting_sleeve",
      gestureText: LEO_GESTURES.adjusting_sleeve,
      wardrobeId: leoWardrobeId,
      wardrobeText: LEO_WARDROBES[leoWardrobeId],
    };
  }

  if (/\b(pay|card|cash|counter|take it|take them)\b/i.test(text)) {
    locationId = "checkout";
    if (options.speaker === "emma") {
      return {
        environment: "shopping",
        locationId,
        locationText: SHOPPING_LOCATIONS[locationId],
        expressionId: "calm_explanation",
        expressionText: EMMA_EXPRESSIONS.calm_explanation,
        gestureId: "open_palm_teaching",
        gestureText: EMMA_GESTURES.open_palm_teaching,
        wardrobeId: emmaWardrobeId,
        wardrobeText: EMMA_WARDROBES[emmaWardrobeId],
      };
    }
    return {
      environment: "shopping",
      locationId,
      locationText: SHOPPING_LOCATIONS[locationId],
      expressionId: "proud",
      expressionText: LEO_EXPRESSIONS.proud,
      gestureId: "paying_card",
      gestureText: LEO_GESTURES.paying_card,
      wardrobeId: leoWardrobeId,
      wardrobeText: LEO_WARDROBES[leoWardrobeId],
    };
  }

  if (/\b(congratulations|halfway|progress|proud)\b/i.test(text)) {
    locationId = pickStable(
      ["mall_atrium", "mall_corridor"] as const,
      `proud-${seed}`,
    );
    if (options.speaker === "emma") {
      return {
        environment: "shopping",
        locationId,
        locationText: SHOPPING_LOCATIONS[locationId],
        expressionId: "proud_encouragement",
        expressionText: EMMA_EXPRESSIONS.proud_encouragement,
        gestureId: "supportive_wave",
        gestureText: EMMA_GESTURES.supportive_wave,
        wardrobeId: emmaWardrobeId,
        wardrobeText: EMMA_WARDROBES[emmaWardrobeId],
      };
    }
    const proudGestureId = pickStable(
      ["small_thumbs_up", "holding_bag"] as const,
      `proud-gesture-${seed}`,
    );
    return {
      environment: "shopping",
      locationId,
      locationText: SHOPPING_LOCATIONS[locationId],
      expressionId: "proud",
      expressionText: LEO_EXPRESSIONS.proud,
      gestureId: proudGestureId,
      gestureText: LEO_GESTURES[proudGestureId],
      wardrobeId: leoWardrobeId,
      wardrobeText: LEO_WARDROBES[leoWardrobeId],
    };
  }

  // Default shopping beat
  if (options.speaker === "emma") {
    return {
      environment: "shopping",
      locationId,
      locationText: SHOPPING_LOCATIONS[locationId],
      expressionId: "encouraging_smile",
      expressionText: EMMA_EXPRESSIONS.encouraging_smile,
      gestureId: "open_palm_teaching",
      gestureText: EMMA_GESTURES.open_palm_teaching,
      wardrobeId: emmaWardrobeId,
      wardrobeText: EMMA_WARDROBES[emmaWardrobeId],
    };
  }

  const leoGestureId = pickStable(
    ["asking_question", "touching_rack"] as const,
    `default-gesture-${seed}`,
  );
  return {
    environment: "shopping",
    locationId,
    locationText: SHOPPING_LOCATIONS[locationId],
    expressionId: "curious",
    expressionText: LEO_EXPRESSIONS.curious,
    gestureId: leoGestureId,
    gestureText: LEO_GESTURES[leoGestureId],
    wardrobeId: leoWardrobeId,
    wardrobeText: LEO_WARDROBES[leoWardrobeId],
  };
}

function studioSceneVariables(options: {
  speaker: PodcastAvatarSpeaker;
  expressionHint?: string | null;
}): PodcastAvatarSceneVariables {
  const hint = options.expressionHint?.trim();
  if (options.speaker === "emma") {
    return {
      environment: "studio",
      locationText: "seated at the locked podcast desk",
      expressionText:
        hint && hint.length >= 8
          ? hint.replace(/\.$/, "")
          : EMMA_EXPRESSIONS.encouraging_smile,
      gestureText: EMMA_GESTURES.open_palm_teaching,
      wardrobeText:
        "teal blouse, mustard knitted cardigan, high-waisted dark trousers",
    };
  }
  return {
    environment: "studio",
    locationText: "seated at the locked podcast desk",
    expressionText:
      hint && hint.length >= 8
        ? hint.replace(/\.$/, "")
        : LEO_EXPRESSIONS.curious,
    gestureText: LEO_GESTURES.asking_question,
    wardrobeText:
      "navy dark-blue casual overshirt over a light neutral T-shirt, dark chinos, simple sneakers",
  };
}

function sanitizeNarrationForPrompt(scriptText: string | null | undefined) {
  const cleaned = (scriptText ?? "")
    .replace(/^\[[^\]]+\]\s*/gm, "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return null;
  }
  if (cleaned.length <= 280) {
    return cleaned;
  }
  return `${cleaned.slice(0, 277).trim()}...`;
}

function narrativeBeatFocus(
  speaker: PodcastAvatarSpeaker,
  scriptText: string | null | undefined,
  vars: PodcastAvatarSceneVariables,
): string {
  const text = (scriptText ?? "").toLowerCase();
  const name = speaker === "emma" ? "Emma" : "Leo";

  if (/\b(how much|price|expensive|dollars|cost)\b/i.test(text)) {
    return speaker === "emma"
      ? `${name} is actively teaching or reacting about price/cost in this beat`
      : `${name} is actively reacting to a price or cost concern in this beat`;
  }
  if (/\b(size|medium|small|large|extra\s*large)\b/i.test(text)) {
    return speaker === "emma"
      ? `${name} is helping with clothing size in this beat`
      : `${name} is dealing with clothing size or fit in this beat`;
  }
  if (/\b(try it on|fitting room|changing room)\b/i.test(text)) {
    return `${name} is in a try-on / fitting-room moment in this beat`;
  }
  if (/\b(pay|card|cash|counter|take it|take them)\b/i.test(text)) {
    return speaker === "emma"
      ? `${name} is guiding a payment or purchase decision in this beat`
      : `${name} is paying or completing a purchase in this beat`;
  }
  if (/\b(congratulations|halfway|progress|proud)\b/i.test(text)) {
    return `${name} is celebrating progress or encouragement in this beat`;
  }
  if (vars.environment === "shopping") {
    return `${name} is mid-conversation in a shopping lesson beat`;
  }
  return `${name} is speaking this exact teaching/learning turn`;
}

function buildPrimaryNarrationBlock(
  speaker: PodcastAvatarSpeaker,
  vars: PodcastAvatarSceneVariables,
  scriptText?: string | null,
): string | null {
  const narration = sanitizeNarrationForPrompt(scriptText);
  if (!narration) {
    return null;
  }
  const name = speaker === "emma" ? "Emma" : "Leo";
  const focus = narrativeBeatFocus(speaker, scriptText, vars);

  return [
    "PRIMARY NARRATIVE BEAT (highest priority after identity locks):",
    `${name} is saying: "${narration}"`,
    `Dominant story requirement: ${focus}.`,
    `The illustration MUST make that spoken moment readable through pose, face, gaze, hands, and props.`,
    `Prefer concrete story cues from the line over a generic idle portrait.`,
    `If the line mentions price, size, trying on, paying, choosing clothes, surprise, confusion, or pride, show that specific situation clearly.`,
    `Do NOT draw the spoken words, letters, numbers, price digits, captions, or speech bubbles into the image.`,
  ].join(" ");
}

function buildSceneVariationBlock(
  speaker: PodcastAvatarSpeaker,
  vars: PodcastAvatarSceneVariables,
  scriptText?: string | null,
): string {
  const name = speaker === "emma" ? "Emma" : "Leo";
  const pronoun = speaker === "emma" ? "She" : "He";
  const narration = sanitizeNarrationForPrompt(scriptText);
  const focus = narrativeBeatFocus(speaker, scriptText, vars);

  const sceneLine = [
    `Controlled scene packaging supporting that beat: ${name} is ${vars.locationText}.`,
    `${pronoun} has a ${vars.expressionText}.`,
    `${pronoun} is ${vars.gestureText}.`,
    `${pronoun} wears ${vars.wardrobeText}.`,
  ].join(" ");

  const reinforceLine = narration
    ? [
        `Again: this image is about "${narration}".`,
        `${focus}.`,
        `Expression, gesture, and props must serve that line first; wardrobe and background stay secondary.`,
      ].join(" ")
    : null;

  const keepLine =
    speaker === "emma"
      ? "Keep her face, glasses, hair shape, adult proportions, and polished educational illustration style consistent with the reference avatar."
      : "Keep his clean-shaven face, short tidy hair, adult proportions, and friendly learner identity consistent across all scenes.";

  return [sceneLine, reinforceLine, keepLine].filter(Boolean).join("\n\n");
}

export function compilePodcastAvatarImagePrompt(options: {
  speaker: PodcastAvatarSpeaker;
  scriptText?: string | null;
  episodeContext?: string | null;
  title?: string | null;
  topicCategory?: string | null;
  visualAnchor?: string | null;
  topic?: string | null;
  visualIdea?: string | null;
  visualPurpose?: string | null;
  expressionHint?: string | null;
  seed?: string | null;
}): string {
  const shopping = detectPodcastShoppingVisualContext(options);
  const vars = shopping
    ? classifyPodcastShoppingSceneVariables({
        speaker: options.speaker,
        scriptText: options.scriptText,
        seed: options.seed ?? options.scriptText,
      })
    : studioSceneVariables({
        speaker: options.speaker,
        expressionHint: options.expressionHint,
      });

  const characterLock =
    options.speaker === "emma"
      ? PODCAST_AVATAR_EMMA_CHARACTER_LOCK
      : PODCAST_AVATAR_LEO_CHARACTER_LOCK;
  const compositionLock =
    options.speaker === "emma"
      ? PODCAST_AVATAR_EMMA_COMPOSITION_LOCK
      : PODCAST_AVATAR_LEO_COMPOSITION_LOCK;
  const environmentLock =
    vars.environment === "shopping"
      ? PODCAST_AVATAR_SHOPPING_ENVIRONMENT_LOCK
      : PODCAST_AVATAR_STUDIO_ENVIRONMENT_LOCK;

  const primaryNarration = buildPrimaryNarrationBlock(
    options.speaker,
    vars,
    options.scriptText,
  );

  // Order: style → identity → PRIMARY NARRATION (high priority) → composition/environment
  // packaging → reinforced narration → subtitle/negative locks.
  return [
    PODCAST_AVATAR_STYLE_LOCK,
    "",
    characterLock,
    "",
    primaryNarration,
    "",
    compositionLock,
    "",
    environmentLock,
    "",
    buildSceneVariationBlock(options.speaker, vars, options.scriptText),
    "",
    PODCAST_AVATAR_SUBTITLE_SAFE_LOCK,
    "",
    PODCAST_AVATAR_NEGATIVE_LOCK,
  ]
    .filter((block): block is string => block != null)
    .join("\n");
}
