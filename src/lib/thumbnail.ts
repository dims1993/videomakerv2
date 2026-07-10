export type ThumbnailConcept = {
  id: "A" | "B" | "C";
  name: string;
  thumbnailHook: string;
  overlayText: string;
  mainEmotion: string;
  mainHostPose: string;
  primaryObject: string;
  secondaryObject: string;
  visualTension: string;
  composition: string;
  colorAccent: string;
  whyItWorks: string;
};

export type ThumbnailBrief = {
  thumbnailHook: string;
  mainEmotion: string;
  mainHostPose: string;
  primaryObject: string;
  secondaryObject: string;
  overlayText: string;
  visualTension: string;
  colorAccent: string;
  avoid: string[];
};

export const WEALTH_INSIGHTS_THUMBNAIL_STYLE = {
  background: "white_or_light_gray",
  textStyle: "huge_black_uppercase",
  character: "wealth_insights_main_host",
  composition: "one_host_one_big_symbol",
  maxOverlayWords: 5,
  avoid: [
    "busy background",
    "small text",
    "photorealism",
    "3D render",
    "too many objects",
    "copyrighted characters",
    "copied channel branding",
  ],
};

export const WEALTH_INSIGHTS_HOST_DESCRIPTOR =
  "main recurring finance host from the shared Wealth Insights character universe, with an oversized cartoon head, narrow forehead area, broad lower face, cleft chin with a visible central crease, clean-shaven face, heavy jaw and cheek area, no visible neck, head directly attached to the shirt collar, simple rounded cartoon nose, wide white cartoon eyes with small black pupils, small rounded ears, short simple brown hair, thick eyebrows, slim small upright body, white collared shirt, navy blazer, dark trousers, clean black outlines, flat colors, light soft shading";

export const THUMBNAIL_NEGATIVE_PROMPT =
  "photorealism, 3D, realistic human face, clutter, tiny details, long text, subtitles, paragraphs, watermarks, logos, copyrighted characters, copied channel style, busy background, small text";

const DEFAULT_AVOID = [
  "busy background",
  "small text",
  "photorealism",
  "3D render",
  "too many objects",
  "copyrighted characters",
  "copied channel branding",
];

function textFromJsonish(value: string | null | undefined) {
  if (!value?.trim()) {
    return "";
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function firstSentence(text: string | null | undefined) {
  return (
    text
      ?.replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s+/)[0]
      ?.trim() ?? ""
  );
}

function topicKeywords(input: string) {
  const stopWords = new Set([
    "about",
    "after",
    "because",
    "before",
    "first",
    "from",
    "have",
    "into",
    "just",
    "money",
    "that",
    "their",
    "this",
    "video",
    "what",
    "when",
    "where",
    "with",
    "your",
  ]);

  return input
    .replace(/[^\w$%.,\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !stopWords.has(word.toLowerCase()))
    .slice(0, 6);
}

export function normalizeOverlayText(value: string | null | undefined) {
  const words = (value ?? "")
    .replace(/[^\w$%?!.,'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, WEALTH_INSIGHTS_THUMBNAIL_STYLE.maxOverlayWords);

  return words.join(" ").toUpperCase();
}

function overlayFromSource(source: string, fallback: string) {
  const moneyMatch = source.match(/\$?\d[\d,.]*\s*[kKmM%]?/);

  if (moneyMatch) {
    const amount = moneyMatch[0].replace(/\s+/g, "").toUpperCase();
    return normalizeOverlayText(`FIRST ${amount}`);
  }

  const keywords = topicKeywords(source);

  if (keywords.length >= 2) {
    return normalizeOverlayText(keywords.slice(0, 3).join(" "));
  }

  return normalizeOverlayText(fallback);
}

export function parseThumbnailConcept(value: unknown): ThumbnailConcept | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const concept = value as Partial<ThumbnailConcept>;

  if (
    (concept.id === "A" || concept.id === "B" || concept.id === "C") &&
    typeof concept.overlayText === "string"
  ) {
    return concept as ThumbnailConcept;
  }

  return null;
}

export function parseThumbnailConcepts(value: unknown): ThumbnailConcept[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(parseThumbnailConcept)
    .filter((concept): concept is ThumbnailConcept => Boolean(concept));
}

export function buildThumbnailConcepts(video: {
  title: string;
  topic: string;
  ideaJson: string | null;
  script: string | null;
  metadataJson: string | null;
}) {
  const source = [
    video.title,
    video.topic,
    textFromJsonish(video.ideaJson),
    firstSentence(video.script),
    textFromJsonish(video.metadataJson),
  ]
    .filter(Boolean)
    .join(" ");
  const baseOverlay = overlayFromSource(source, "NOT READY");
  const hook = firstSentence(video.script) || video.title || video.topic;
  const coreObject = baseOverlay.includes("$")
    ? `oversized box labeled ${baseOverlay.replace(/^FIRST\s+/, "")}`
    : "oversized finance symbol connected to the video's main idea";

  return [
    {
      id: "A",
      name: `${baseOverlay} Shock`,
      thumbnailHook: hook,
      overlayText: baseOverlay,
      mainEmotion: "surprised realization",
      mainHostPose: "main host leaning toward the object with raised eyebrows and wide eyes",
      primaryObject: coreObject,
      secondaryObject: "a few floating bills and small pressure marks",
      visualTension: "the object looks simple but unexpectedly important",
      composition: "host on left, object on right, huge text across the top",
      colorAccent: "green",
      whyItWorks: "It turns a finance idea into a fast curiosity gap.",
    },
    {
      id: "B",
      name: "Too Late Warning",
      thumbnailHook: `The risk hiding inside ${video.topic}`,
      overlayText: "TOO LATE?",
      mainEmotion: "worried",
      mainHostPose: "main host pointing at the object while looking alarmed",
      primaryObject: "oversized red warning symbol beside a falling chart",
      secondaryObject: "small clock icon and a single dollar sign",
      visualTension: "the viewer feels a decision window may be closing",
      composition: "huge text on left, host center, warning object on right",
      colorAccent: "red",
      whyItWorks: "It adds urgency without making the thumbnail busy.",
    },
    {
      id: "C",
      name: "Status Transformation",
      thumbnailHook: `The status shift behind ${video.title}`,
      overlayText: "TOP 3%?!",
      mainEmotion: "excited",
      mainHostPose: "main host holding up one finger while reacting to a status marker",
      primaryObject: "oversized badge, chart step, or safe showing upward movement",
      secondaryObject: "small sparkle marks and one bold percentage symbol",
      visualTension: "ordinary effort appears to unlock a higher status tier",
      composition: "host on left, giant symbol center, huge text on right",
      colorAccent: "yellow",
      whyItWorks: "It frames the finance lesson as a visible transformation.",
    },
  ] satisfies ThumbnailConcept[];
}

export function buildThumbnailPrompt(concept: ThumbnailConcept, avoidText = "") {
  const avoid = [
    ...DEFAULT_AVOID,
    ...avoidText
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
  ];
  const overlayText = normalizeOverlayText(concept.overlayText);

  return [
    "STYLE:",
    "Clean 2D cartoon YouTube finance thumbnail, white or very light gray background, huge bold black uppercase text, simple high-contrast composition, minimal clutter, CTR-focused, educational finance niche, flat colors, thick clean black outlines, light soft shading.",
    "",
    "CHARACTER:",
    WEALTH_INSIGHTS_HOST_DESCRIPTOR,
    "",
    "COMPOSITION:",
    concept.composition,
    "",
    "TEXT:",
    `Huge bold black uppercase overlay text reading \"${overlayText}\". Keep the text mobile-readable and dominant. Do not add any other captions or tiny text.`,
    "",
    "OBJECTS:",
    `${concept.primaryObject}. Secondary object: ${concept.secondaryObject}. Keep only one dominant finance symbol/object with very few supporting details.`,
    "",
    "EMOTION:",
    `${concept.mainEmotion}. ${concept.mainHostPose}. Emotional tension: ${concept.visualTension}.`,
    "",
    "AVOID:",
    avoid.join(", "),
    "",
    "FORMAT:",
    "16:9 YouTube thumbnail, high contrast, clean readable layout.",
  ].join("\n");
}

export function conceptToBrief(concept: ThumbnailConcept): ThumbnailBrief {
  return {
    thumbnailHook: concept.thumbnailHook,
    mainEmotion: concept.mainEmotion,
    mainHostPose: concept.mainHostPose,
    primaryObject: concept.primaryObject,
    secondaryObject: concept.secondaryObject,
    overlayText: normalizeOverlayText(concept.overlayText),
    visualTension: concept.visualTension,
    colorAccent: concept.colorAccent,
    avoid: DEFAULT_AVOID,
  };
}
