import type { VoiceoverPacingOptions } from "@/lib/voiceover-pacing";
import { WEALTH_INSIGHTS_THUMBNAIL_STYLE } from "@/lib/thumbnail";
import {
  DEFAULT_SCENE_GENERATION_MODES,
  type ChatGptGenerationMode,
} from "@/lib/chatgpt-scene-handoff";

export type ChannelKey = string;

export type BuiltinChannelKey =
  | "wealth-insights"
  | "christian-life"
  | "the-gods-word"
  | "podcast-english-lessons";

export type ChannelPipelineMode = "full" | "audio_only";

/** Voice catalog entry for pipeline VO + linked scene pause rhythm. */
export type ChannelVoiceProfile = {
  voiceId: string;
  voiceName?: string | null;
  defaultPauseAfterMs: number;
};

/** Partial channel defaults for automated pipeline runs. */
export type ChannelPipelineDefaults = {
  script?: {
    includeReferenceTranscripts?: boolean;
    referenceDocumentIds?: string[];
  };
  visualPlan?: {
    mode?: "hybrid" | "library";
    generationMode?: "FULL_VIDEO";
    libraryId?: string | null;
  };
  assets?: {
    /** Relative/absolute folder where Flow/library attach writes images. */
    imageOutputFolder?: string | null;
  };
  voiceover?: {
    voiceId?: string | null;
    voiceName?: string | null;
    pauseAfterMs?: number | null;
    generateSubtitles?: boolean;
    /** TTS engine for pipeline / channel defaults. */
    ttsProvider?: "elevenlabs" | "chatterbox" | "google";
    /** Forced-alignment engine for scene subtitles. */
    alignmentProvider?: "elevenlabs" | "whisperx";
    captionStylePreset?: string | null;
  };
  render?: {
    burnCaptions?: boolean;
    /** Podcast: centered voice-reactive bars on still images only. */
    voiceSoundBars?: boolean;
    voiceSoundBarsStyle?: "cline" | "bars" | "bars2";
  };
};

export type TopicCategory = {
  id: string;
  label: string;
  description: string;
};

export type TopicAngleLane = {
  id: string;
  label: string;
  description: string;
  titlePatterns: string[];
  avoid?: string[];
};

export type TopicSystem = {
  enabled: boolean;
  categories: TopicCategory[];
  weeklyRotation: string[];
  outlierAngleLanes?: TopicAngleLane[];
};

export type EditorialInstructions = {
  role: string;
  audience: string;
  niche: string;
  style: string[];
  originalityRules: string[];
  overusedAngles: string[];
  requiredTopicFields: string[];
  /**
   * scripture_first = Biblical Studies topic engine (TheGodsWord).
   * conversational_podcast = Max & Sara long-form conversation topics (Podcast English Lessons).
   * default = shared mechanism/CTR engine (Wealth, etc.).
   */
  topicEngine?: "default" | "scripture_first" | "conversational_podcast";
};

export type ChannelProfile = {
  key: ChannelKey;
  name: string;
  description: string;
  projectBiblePath: string;
  imagePromptBiblePath: string;
  characterBiblePath?: string;
  /**
   * full = visual planner + assets + voiceover + render (default orientation)
   * audio_only = script-first create UX / audio-first product orientation
   * (does not by itself remove Visual Plan or Assets tabs)
   */
  pipelineMode?: ChannelPipelineMode;
  voiceoverPacingDefaults?: VoiceoverPacingOptions;
  voiceoverSpeedDefault?: number;
  /** Preferred ElevenLabs voice for this channel (pipeline + VO defaults). */
  voiceoverDefaultVoiceId?: string;
  voiceoverDefaultVoiceName?: string;
  /** Voice rhythm profiles (pauseAfterMs linked to each voiceId). */
  voiceProfiles?: ChannelVoiceProfile[];
  /** Defaults for Pipeline Queue automation (overridable per video). */
  pipelineDefaults?: ChannelPipelineDefaults;
  /**
   * When set, Topic Batch opens this ChatGPT URL on the first turn instead of
   * chatgpt.com/. Independent from Script Writer / Visual Plan start URLs.
   */
  chatgptTopicConversationUrl?: string;
  /**
   * When set, Script Writer Batch opens this ChatGPT URL on the first turn
   * (e.g. a project conversation) instead of chatgpt.com/.
   * Visual Plan Batch stays on the default ChatGPT home unless given its own URL.
   */
  chatgptScriptConversationUrl?: string;
  /**
   * When set, Thumbnail Batch opens this ChatGPT URL on the first turn
   * (e.g. a project / custom GPT conversation) instead of chatgpt.com/.
   */
  chatgptThumbnailConversationUrl?: string;
  thumbnailStyle?: typeof WEALTH_INSIGHTS_THUMBNAIL_STYLE;
  topicSystem?: TopicSystem;
  editorialInstructions?: EditorialInstructions;
  sceneGenerationModes?: ChatGptGenerationMode[];
  prompts: {
    angleBuilder: string;
    scriptWriter: string;
    /** Optional channel-specific Script Writer score rubric (markdown). */
    scriptWriterScore?: string;
    /** Optional channel-specific Script Writer revision instructions (markdown). */
    scriptWriterRevision?: string;
    visualPlanner: string;
    metadataWriter: string;
  };
};

export const BUILTIN_CHANNELS: ChannelProfile[] = [
  {
    key: "wealth-insights",
    name: "Wealth Insights",
    description: "Personal finance, investing, and economic decisions.",
    projectBiblePath: "docs/channels/wealth-insights/project-bible.md",
    imagePromptBiblePath: "docs/channels/wealth-insights/image-prompt-bible.md",
    characterBiblePath: "docs/channels/wealth-insights/character-bible.md",
    voiceoverPacingDefaults: {
      pacePreset: "slightly_slower",
      pauseStyle: "balanced",
    },
    voiceoverSpeedDefault: 1,
    voiceoverDefaultVoiceId: "Hh0rE70WfnSFN80K8uJC",
    voiceoverDefaultVoiceName: "MEGAN INVESTS DEFINTE",
    voiceProfiles: [
      {
        voiceId: "Hh0rE70WfnSFN80K8uJC",
        voiceName: "MEGAN INVESTS DEFINTE",
        defaultPauseAfterMs: 0,
      },
    ],
    pipelineDefaults: {
      script: {
        includeReferenceTranscripts: false,
        referenceDocumentIds: [],
      },
      visualPlan: {
        mode: "hybrid",
        generationMode: "FULL_VIDEO",
      },
      voiceover: {
        voiceId: "Hh0rE70WfnSFN80K8uJC",
        voiceName: "MEGAN INVESTS DEFINTE",
        pauseAfterMs: 0,
        generateSubtitles: true,
        captionStylePreset: "clean_active_word",
      },
      render: {
        burnCaptions: true,
      },
    },
    thumbnailStyle: WEALTH_INSIGHTS_THUMBNAIL_STYLE,
    editorialInstructions: {
      role: "editorial strategy partner",
      audience: "United States",
      niche: "personal finance / money education",
      style: [
        "simple animated personal finance stories",
        "emotional but educational",
        "highly visual",
        "clear enough for everyday viewers",
        "no jargon",
        "no hype",
        "no get-rich-quick promises",
        "no direct financial advice",
      ],
      originalityRules: [
        "Do not generate generic finance topics.",
        "Avoid repeating obvious angles unless there is a genuinely new mechanism.",
        "Prefer hidden incentives, everyday traps, psychological contradictions, small decisions with large consequences, and visual mechanisms.",
        "Every topic should have a unique mechanism, not just a category.",
        "Every topic should be easy to visualize as an animated scene.",
      ],
      overusedAngles: [
        "Fed cut rates but mortgage went up",
        "first $10,000 saved",
        "credit card debt snowball",
        "inflation did not end",
        "rent trap",
        "middle class trap",
        "AI will change your job",
        "monthly payments are dangerous",
      ],
      requiredTopicFields: [
        "category",
        "title",
        "topic",
        "angle",
        "uniqueMechanism",
        "trigger",
        "promise",
        "visualHook",
        "thumbnailIdea",
        "repetitionRisk",
      ],
    },
    topicSystem: {
      enabled: true,
      categories: [
        {
          id: "housing",
          label: "Housing / Mortgage / Rent",
          description:
            "Home buying, rent pressure, mortgage rates, affordability, housing traps.",
        },
        {
          id: "savings",
          label: "Saving / Emergency Fund / First Milestones",
          description:
            "Emergency funds, first $1,000, first $10,000, savings psychology, financial buffer.",
        },
        {
          id: "debt",
          label: "Debt / Credit Cards / Monthly Payments",
          description:
            "Credit card debt, BNPL, loans, minimum payments, interest traps, monthly payment psychology.",
        },
        {
          id: "investing",
          label: "Investing / Compounding / ETFs",
          description:
            "Long-term investing, compounding, ETFs, waiting too long, market psychology, asset ownership.",
        },
        {
          id: "income",
          label: "Income / Jobs / AI / Salary",
          description:
            "Job market, salary pressure, AI, career leverage, income risk, raises, wages.",
        },
        {
          id: "cost_of_living",
          label: "Cost of Living / Inflation / Middle Class",
          description:
            "Inflation, groceries, insurance, rent, utilities, middle class pressure, fixed costs.",
        },
        {
          id: "psychology",
          label: "Wealth Psychology / Habits / Identity",
          description:
            "Money behavior, hidden leaks, lifestyle inflation, identity traps, fear-based decisions.",
        },
        {
          id: "narrative_economics_stories",
          label: "Narrative Economics Stories",
          description:
            "Business and economic history stories about companies, founders, entrepreneurs, hidden business models, incentives, bottlenecks, platforms, real estate, contracts, distribution, scale, and the money machines behind famous businesses.",
        },
      ],
      weeklyRotation: [
        "housing",
        "savings",
        "debt",
        "investing",
        "income",
        "cost_of_living",
        "psychology",
      ],
      outlierAngleLanes: [
        {
          id: "exact_system",
          label: "Exact System",
          description:
            "A concrete financial result achieved under an ordinary constraint, with a repeatable system.",
          titlePatterns: [
            "How I Built [Specific Result] on [Ordinary Constraint] (The Exact System)",
            "How to Build [Specific Result] Without [Common Advantage]",
            "The Exact System I Used to [Result] on [Modest Income]",
          ],
          avoid: [
            "Generic how-to budgeting advice",
            "Unrealistic income claims",
            "Get-rich-quick framing",
          ],
        },
        {
          id: "hidden_wealth_signals",
          label: "Hidden Wealth Signals",
          description:
            "Signs that reveal real financial strength beneath ordinary appearances.",
          titlePatterns: [
            "10 Signs Someone Has Real Money (Not Just [Visible Status Marker])",
            "7 Quiet Signs Someone Is Doing Better With Money Than They Look",
            "The Subtle Signs Someone Is Actually Building Wealth",
          ],
          avoid: [
            "Luxury flexing",
            "Judging people by appearance only",
            "Generic rich people habits",
          ],
        },
        {
          id: "ordinary_paycheck_wealth",
          label: "Ordinary Paycheck Wealth",
          description:
            "How ordinary earners build wealth while others with similar income never do.",
          titlePatterns: [
            "Why Some People Become Wealthy on Ordinary Paychecks (And Most Never Do)",
            "How Normal Paychecks Quietly Build Wealth When You Use Them Differently",
            "Why Two People With the Same Salary End Up in Different Worlds",
          ],
          avoid: [
            "Generic save more advice",
            "Pretending income never matters",
            "Overly motivational money mindset framing",
          ],
        },
        {
          id: "zero_cost_rich_life",
          label: "Zero-Cost Rich Life",
          description:
            "Quality-of-life upgrades that feel rich without requiring more spending.",
          titlePatterns: [
            "15 Little Luxuries That Cost $0 (Living Rich Without Spending More)",
            "10 Ways to Feel Richer Without Buying Anything",
            "The Free Luxuries That Make Life Feel Expensive",
          ],
          avoid: [
            "Minimalism clichés",
            "Aesthetic lifestyle content with no money mechanism",
            "Generic happiness advice",
          ],
        },
        {
          id: "waste_of_money",
          label: "Waste of Money",
          description:
            "Common purchases, upgrades, habits, or status decisions that quietly destroy margin.",
          titlePatterns: [
            "10 [Purchases/Upgrades/Habits] That Are a Complete Waste of Money",
            "12 Things That Quietly Waste More Money Than People Admit",
            "The Everyday Upgrades That Make You Poorer Without Feeling Expensive",
          ],
          avoid: [
            "Shaming normal purchases",
            "Generic frugality list",
            "Obvious coffee-only examples",
          ],
        },
        {
          id: "salary_myth",
          label: "Salary Myth",
          description:
            "Contradictions around income, status, and actual financial progress.",
          titlePatterns: [
            "Why Your Salary Doesn't Matter as Much as You Think",
            "Why a Bigger Salary Can Still Leave You Feeling Broke",
            "The Salary Trap That Makes High Earners Feel Poor",
          ],
          avoid: [
            "Claiming income is irrelevant",
            "Generic career advice",
            "Motivational hustle framing",
          ],
        },
        {
          id: "defended_bad_habits",
          label: "Defended Bad Habits",
          description:
            "Wasteful choices people emotionally defend because they feel normal, earned, or deserved.",
          titlePatterns: [
            "12 Things That Are a Complete Waste of Money (That People Still Defend!)",
            "10 Expensive Habits People Defend Even When They Keep Them Broke",
            "The Money Habits People Defend Because They Feel Normal",
          ],
          avoid: [
            "Moralizing",
            "Mocking the viewer",
            "Generic bad habits list",
          ],
        },
        {
          id: "quiet_advantage",
          label: "Quiet Advantage",
          description:
            "Boring, overlooked behaviors that create financial resilience over time.",
          titlePatterns: [
            "The Quiet Money Habit That Makes Ordinary People Hard to Break",
            "The Boring Financial Advantage Most People Notice Too Late",
            "The Small Money Rule That Quietly Changes Everything",
          ],
          avoid: [
            "Generic discipline advice",
            "Motivational clichés",
            "Vague habits without mechanism",
          ],
        },
        {
          id: "rich_without_looking_rich",
          label: "Rich Without Looking Rich",
          description:
            "Status inversion: real wealth often looks calmer, simpler, or more ordinary than fake wealth.",
          titlePatterns: [
            "Why People With Real Money Often Look More Ordinary Than You Think",
            "10 Things Wealthy People Stop Needing to Prove",
            "Why Looking Rich Can Keep You From Becoming Rich",
          ],
          avoid: [
            "Luxury gossip",
            "Judging clothing alone",
            "Generic stealth wealth without a mechanism",
          ],
        },
        {
          id: "nobody_calculates_this",
          label: "Nobody Calculates This",
          description:
            "Hidden math behind common decisions people usually make emotionally.",
          titlePatterns: [
            "Buying [Thing] vs Keeping [Thing]: The Mistake Nobody Calculates",
            "The Cost Nobody Calculates Before Upgrading [Thing]",
            "The Financial Decision That Looks Small Until You Calculate It",
          ],
          avoid: [
            "Overly complex math",
            "Generic calculators",
            "Decisions with no emotional hook",
          ],
        },
      ],
    },
    prompts: {
      angleBuilder: "prompts/channels/wealth-insights/angle-builder.md",
      scriptWriter: "prompts/channels/wealth-insights/script-writer.md",
      scriptWriterScore:
        "prompts/channels/wealth-insights/script-writer-score.md",
      scriptWriterRevision:
        "prompts/channels/wealth-insights/script-writer-revision.md",
      visualPlanner: "prompts/channels/wealth-insights/visual-planner.md",
      metadataWriter: "prompts/channels/wealth-insights/metadata-writer.md",
    },
  },
  {
    key: "christian-life",
    name: "Christian Life",
    description: "Faith-based reflective storytelling channel.",
    projectBiblePath: "docs/channels/christian-life/project-bible.md",
    imagePromptBiblePath: "docs/channels/christian-life/image-prompt-bible.md",
    editorialInstructions: {
      role: "editorial strategy partner for illustrated biblical storytelling",
      audience: "emotionally tired, spiritually curious viewers seeking practical biblical wisdom",
      niche: "Christian life / biblical principles for everyday struggles",
      style: [
        "simple illustrated storytelling",
        "emotional but hopeful",
        "visually clear life scenarios",
        "biblical principle made practical",
        "no sermon transcript feel",
        "no cold theology lecture",
        "no prosperity-gospel promises",
        "no political commentary",
      ],
      originalityRules: [
        "Do not generate generic devotionals that only restate a virtue.",
        "Every topic needs a specific human pain, a wrong response people try, and a clear biblical principle.",
        "Prefer visual metaphors the stickman host can act out in everyday scenes.",
        "Avoid repeating the same forgiveness/pride/fear angle unless the mechanism is genuinely new.",
        "Do not invent Bible verses. Scripture references must stay accurate when used.",
        "Keep the promise practical: one clear takeaway the viewer can live.",
      ],
      overusedAngles: [
        "forgiveness is important",
        "do not be anxious",
        "pride comes before a fall",
        "trust God with everything",
        "you are not alone",
        "God has a plan",
        "patience is a virtue",
        "pray more",
      ],
      requiredTopicFields: [
        "category",
        "title",
        "topic",
        "angle",
        "uniqueMechanism",
        "trigger",
        "promise",
        "visualHook",
        "thumbnailIdea",
        "repetitionRisk",
      ],
    },
    topicSystem: {
      enabled: true,
      categories: [
        {
          id: "forgiveness",
          label: "Forgiveness / Bitterness",
          description:
            "Holding grudges, soft apologies, reconciliation, bitterness that feels justified.",
        },
        {
          id: "fear_anxiety",
          label: "Fear / Anxiety / Worry",
          description:
            "Anxiety loops, control, sleepless fear, worry disguised as responsibility.",
        },
        {
          id: "pride_humility",
          label: "Pride / Humility",
          description:
            "Needing to be right, image management, quiet pride, learning humility.",
        },
        {
          id: "faith_trust",
          label: "Faith / Trust / Waiting",
          description:
            "Waiting on God, delayed answers, trust under pressure, faith when unsure.",
        },
        {
          id: "relationships",
          label: "Relationships / Comparison / Loneliness",
          description:
            "Comparison, loneliness, conflict, people-pleasing, belonging.",
        },
        {
          id: "character",
          label: "Character / Habits / Identity",
          description:
            "Patience, gratitude, wisdom, obedience, integrity, who we become in private.",
        },
        {
          id: "prayer",
          label: "Prayer / Spiritual Dryness",
          description:
            "Distracted prayer, unanswered prayer, dryness, returning to conversation with God.",
        },
        {
          id: "repentance",
          label: "Repentance / Guilt / Return",
          description:
            "Guilt loops, soft repentance, returning after drift, mercy that changes behavior.",
        },
        {
          id: "trials",
          label: "Trials / Perseverance / Hope",
          description:
            "Suffering, endurance, hope under pressure, faith that does not quit.",
        },
        {
          id: "temptation",
          label: "Temptation / Compromise",
          description:
            "Small compromises, hidden habits, desire that feels harmless until it owns you.",
        },
      ],
      weeklyRotation: [
        "forgiveness",
        "fear_anxiety",
        "pride_humility",
        "faith_trust",
        "relationships",
        "character",
        "prayer",
        "repentance",
        "trials",
        "temptation",
      ],
    },
    prompts: {
      angleBuilder: "prompts/channels/christian-life/angle-builder.md",
      scriptWriter: "prompts/channels/christian-life/script-writer.md",
      visualPlanner: "prompts/channels/christian-life/visual-planner.md",
      metadataWriter: "prompts/channels/christian-life/metadata-writer.md",
    },
  },
  {
    key: "the-gods-word",
    name: "TheGodsWord",
    description: "English Christian reflective storytelling.",
    projectBiblePath: "docs/channels/the-gods-word/project-bible.md",
    imagePromptBiblePath: "docs/channels/the-gods-word/image-prompt-bible.md",
    characterBiblePath: "docs/channels/the-gods-word/character-bible.md",
    chatgptScriptConversationUrl:
      "https://chatgpt.com/g/g-p-6a4c4fce39bc819185d028c42a8ec24f-palabraviva/c/6a7999cc-2cfc-83eb-8022-7bc9a6b58ed2",
    chatgptThumbnailConversationUrl:
      "https://chatgpt.com/g/g-p-6a4c4fce39bc819185d028c42a8ec24f-palabraviva/c/6a7a9846-3848-83eb-a27e-620f784d18e4",
    sceneGenerationModes: [
      "FULL_VIDEO",
      "TEN_SCENE_TEST",
      "HOOK_TEST",
      "SEGMENTED_BY_PERCENT",
    ],
    pipelineDefaults: {
      script: {
        includeReferenceTranscripts: false,
        referenceDocumentIds: [],
      },
      visualPlan: {
        mode: "hybrid",
        generationMode: "FULL_VIDEO",
      },
      voiceover: {
        voiceId: null,
        voiceName: null,
        pauseAfterMs: null,
        generateSubtitles: true,
        captionStylePreset: "godsword_style",
      },
      render: {
        burnCaptions: true,
      },
    },
    editorialInstructions: {
      role: "editorial strategy partner for reflective Scripture storytelling",
      audience: "English-speaking Christian or spiritually curious viewers",
      niche: "biblical reflection / parable and Scripture storytelling",
      topicEngine: "scripture_first",
      style: [
        "calm reflective narration",
        "cinematic and reverent",
        "emotionally honest",
        "scripture-centered without sermon heaviness",
        "symbolic visuals",
        "no prosperity gospel",
        "no political commentary",
        "no conspiracy framing",
        "no generic self-help with Bible verses added on top",
      ],
      originalityRules: [
        "Do not generate a Christian topic and attach Scripture to it. Find something inside Scripture that is worth discovering.",
        "Every topic must center a concrete biblical passage, parable, story, saying, image, or action.",
        "Prefer biblical tension first: strange commands, surprising responses, difficult sayings, overlooked details, apparent contradictions, unexpected character behavior, intentional divine delay, or familiar phrases whose biblical meaning is deeper than common usage.",
        "Only after the biblical tension is clear should the topic connect to the viewer's life.",
        "Do not invent Bible verses, fictional biblical events, unsupported historical facts, or symbolic meanings the passage does not support.",
        "Avoid manipulative urgency, guiltbait, fearbait, and sensational 'you've been lied to' framing.",
        "Every topic should be visualizable as symbolic cinematic scenes after the biblical idea is solid.",
      ],
      overusedAngles: [
        "God has a plan for your life",
        "just trust God",
        "you are enough",
        "the prodigal son returns again with no new mechanism",
        "fear not with no specific struggle",
        "pray harder",
        "everything happens for a reason",
        "be the light with no concrete metaphor",
        "Why Christians Need Patience",
        "Why You Should Trust God",
        "How to Have More Faith",
        "Why Prayer Matters",
      ],
      requiredTopicFields: [
        "category",
        "title",
        "scriptureAnchor",
        "topic",
        "centralQuestion",
        "commonMisunderstanding",
        "angle",
        "uniqueMechanism",
        "spiritualTurn",
        "trigger",
        "promise",
        "visualHook",
        "thumbnailIdea",
        "repetitionRisk",
      ],
    },
    topicSystem: {
      enabled: true,
      categories: [
        {
          id: "parable",
          label: "Parable of Jesus",
          description:
            "Parables of Jesus with a fresh human struggle and visual metaphor.",
        },
        {
          id: "biblical_story",
          label: "Biblical Story Reflection",
          description:
            "Old or New Testament stories that reveal a living spiritual truth.",
        },
        {
          id: "spiritual_struggle",
          label: "Spiritual Struggle",
          description:
            "Doubt, dryness, fear, drift, temptation, and quiet resistance to God.",
        },
        {
          id: "character_formation",
          label: "Character Formation",
          description:
            "Humility, patience, integrity, compassion, and who we become over time.",
        },
        {
          id: "warning_hope",
          label: "Warning with Hope",
          description:
            "Loving correction that ends with mercy, return, and hope.",
        },
        {
          id: "prayer_trust",
          label: "Prayer and Trust",
          description:
            "Prayer, waiting, trust, silence, and leaning on God when answers delay.",
        },
        {
          id: "faith_trials",
          label: "Faith in Trials",
          description:
            "Suffering, endurance, hope under pressure, faith that stays.",
        },
        {
          id: "repentance_return",
          label: "Repentance and Return",
          description:
            "Coming back after failure, soft hearts, mercy that restores.",
        },
        {
          id: "obedience_surrender",
          label: "Obedience and Surrender",
          description:
            "Surrender, costly obedience, letting go of control.",
        },
        {
          id: "hope_mercy",
          label: "Hope and Mercy",
          description:
            "Mercy, comfort, restoration, and hope that Scripture makes personal.",
        },
        {
          id: "the_bible_in_one_year",
          label: "The Bible in One Year",
          description:
            "Daily WEBUS Scripture reading with brief introduction, reflection, prayer, and closing for a one-year Bible journey. Use only when this category is explicitly selected — not in standalone Biblical Studies rotation.",
        },
      ],
      // Standalone Biblical Studies rotation only (Bible in One Year is a separate workflow).
      weeklyRotation: [
        "parable",
        "biblical_story",
        "spiritual_struggle",
        "character_formation",
        "warning_hope",
        "prayer_trust",
        "faith_trials",
        "repentance_return",
        "obedience_surrender",
        "hope_mercy",
      ],
    },
    prompts: {
      angleBuilder: "prompts/channels/the-gods-word/angle-builder.md",
      scriptWriter: "prompts/channels/the-gods-word/script-writer.md",
      visualPlanner: "prompts/channels/the-gods-word/visual-planner.md",
      metadataWriter: "prompts/channels/the-gods-word/metadata-writer.md",
    },
  },
  {
    key: "podcast-english-lessons",
    name: "Podcast English Lessons",
    description:
      "Two-speaker English teaching podcasts with audio-first lessons, subtitles, and a minimal reusable character-based visual layer.",
    projectBiblePath: "docs/channels/podcast-english-lessons/project-bible.md",
    imagePromptBiblePath:
      "docs/channels/podcast-english-lessons/image-prompt-bible.md",
    characterBiblePath:
      "docs/channels/podcast-english-lessons/character-bible.md",
    /**
     * Topic-batch create UX like other channels, then jump to script.
     * Does not disable Visual Plan / Assets; visual continuity is text-locked.
     */
    pipelineMode: "audio_only",
    chatgptTopicConversationUrl:
      "https://chatgpt.com/g/g-p-6a6b001e49688191a9263c38bcaedd4c/c/6a6b0023-7044-83eb-ab48-88e702200017",
    chatgptScriptConversationUrl:
      "https://chatgpt.com/g/g-p-6a6b001e49688191a9263c38bcaedd4c/c/6a6b0023-7044-83eb-ab48-88e702200017",
    voiceoverPacingDefaults: {
      pacePreset: "slightly_slower",
      pauseStyle: "balanced",
    },
    voiceoverSpeedDefault: 0.9,
    pipelineDefaults: {
      script: {
        includeReferenceTranscripts: false,
        referenceDocumentIds: [],
      },
      visualPlan: {
        mode: "hybrid",
        generationMode: "FULL_VIDEO",
        libraryId: "podcast-english-lessons",
      },
      voiceover: {
        voiceId: null,
        voiceName: null,
        pauseAfterMs: null,
        generateSubtitles: true,
        captionStylePreset: "clean_active_word",
      },
      render: {
        burnCaptions: true,
        voiceSoundBars: true,
        voiceSoundBarsStyle: "bars",
      },
    },
    editorialInstructions: {
      role: "Editorial partner for long-form conversational English podcast episodes with Max & Sara.",
      audience:
        "Beginner to lower-intermediate English learners, primarily A1–B1.",
      niche: "Natural Daily English Conversations with Max & Sara",
      topicEngine: "conversational_podcast",
      style: [
        "warm",
        "relaxed",
        "curious",
        "lightly funny",
        "conversational rather than instructional",
        "intelligent without sounding academic",
        "encouraging without excessive motivational language",
        "adult and relatable",
        "short, clear speaking turns",
        "audio-first",
      ],
      originalityRules: [
        "Do not propose generic Learn English / Improve Your English / Speak English Better / Daily English Conversation titles.",
        "The topic itself must be interesting even before the English-learning benefit is considered.",
        "Every idea needs one clear human tension, question, behavior, situation, or conversational mechanism.",
        "Prefer specific lived experiences over broad virtues or abstract themes.",
        "uniqueMechanism must name an observable everyday pattern or conversational dynamic — not a lesson activity.",
        "Do not use listen-and-repeat, shadowing, quizzes, name swaps, correction loops, role-play ladders, or speaking challenges as mechanisms.",
        "visualHook / thumbnailIdea must use Max and Sara in the established podcast studio and show the mechanism, not merely hosts talking.",
        "Approximately 25–30% of topics may be directly about English or communication; 70–75% should be broader daily-life topics in accessible English.",
      ],
      overusedAngles: [
        "training your brain to speak fluently by stopping freezing and translating",
        "talking about yourself with confidence",
        "thinking fast and speaking smart in English",
        "listen-and-repeat speaking challenges",
        "teacher-student correction loops",
        "generic fluency motivation without a lived mechanism",
      ],
      requiredTopicFields: [
        "category",
        "title",
        "topic",
        "angle",
        "uniqueMechanism",
        "trigger",
        "promise",
        "visualHook",
        "thumbnailIdea",
        "repetitionRisk",
      ],
    },
    topicSystem: {
      enabled: true,
      categories: [
        {
          id: "english_communication",
          label: "English / Communication / Fluency",
          description:
            "Natural conversation, understanding people, finding words, confidence, misunderstandings, useful conversational habits, and communication problems.",
        },
        {
          id: "daily_life",
          label: "Everyday Life / Routines / Weekends",
          description:
            "Mornings, evenings, errands, weekends, schedules, ordinary decisions, being busy, rest, and everyday experiences.",
        },
        {
          id: "habits_productivity",
          label: "Habits / Time / Productivity",
          description:
            "Procrastination, routines, planning, phone habits, motivation, organization, focus, starting and finishing things.",
        },
        {
          id: "work_study",
          label: "Work / Study / Adult Life",
          description:
            "Coworkers, meetings, studying, learning, career changes, working from home, workplace habits, difficult days, and professional communication.",
        },
        {
          id: "social_relationships",
          label: "Friends / Family / Social Life",
          description:
            "Friendship, invitations, making plans, keeping in touch, meeting new people, boundaries, social situations, and everyday relationship dynamics.",
        },
        {
          id: "feelings_mindset",
          label: "Feelings / Confidence / Everyday Mindset",
          description:
            "Nervousness, confidence, embarrassment, overthinking, comparison, motivation, boredom, stress, indecision, and everyday emotional experiences.",
        },
        {
          id: "food_lifestyle",
          label: "Food / Healthful Daily Living / Leisure",
          description:
            "Cooking, eating out, grocery habits, coffee, comfort food, weekends, exercise as everyday life, relaxing, entertainment, and lifestyle preferences.",
        },
        {
          id: "home_city",
          label: "Home / Neighborhood / City Life",
          description:
            "Living alone, roommates, neighbors, apartments, commuting, noise, favorite places, city versus quiet life, and everyday home situations.",
        },
        {
          id: "travel_culture",
          label: "Travel / Culture / Experiences",
          description:
            "Trips, airports, hotels, culture differences, tourist mistakes, local habits, travel decisions, and experiences away from home.",
        },
        {
          id: "technology_media",
          label: "Phones / Internet / Entertainment",
          description:
            "Social media, messaging, streaming, online habits, notifications, screen time, videos, apps, AI in everyday life, and digital communication.",
        },
      ],
      weeklyRotation: [
        "english_communication",
        "daily_life",
        "habits_productivity",
        "work_study",
        "social_relationships",
        "feelings_mindset",
        "food_lifestyle",
        "home_city",
        "travel_culture",
        "technology_media",
      ],
    },
    prompts: {
      angleBuilder:
        "prompts/channels/podcast-english-lessons/angle-builder.md",
      scriptWriter:
        "prompts/channels/podcast-english-lessons/script-writer.md",
      visualPlanner:
        "prompts/channels/podcast-english-lessons/visual-planner.md",
      metadataWriter:
        "prompts/channels/podcast-english-lessons/metadata-writer.md",
    },
  },
];

/** Built-in channels only. For custom channels on the server, use `@/lib/channels-server`. */
export function listAllChannels(): ChannelProfile[] {
  return [...BUILTIN_CHANNELS];
}

/** @deprecated Prefer listAllChannels(); kept for older imports. */
export const CHANNELS = BUILTIN_CHANNELS;

export function getBuiltinChannelKeys() {
  return new Set(BUILTIN_CHANNELS.map((channel) => channel.key));
}

export function channelExists(channelKey: string | null | undefined) {
  const key = channelKey?.trim();
  if (!key) {
    return false;
  }
  return listAllChannels().some((channel) => channel.key === key);
}

export function isAudioOnlyChannel(channelKey: string | null | undefined) {
  return getChannelProfile(channelKey).pipelineMode === "audio_only";
}

export function getDefaultChannelKey(): ChannelKey {
  return "wealth-insights";
}

export function getChannelProfile(channelKey: string | null | undefined) {
  const channels = listAllChannels();
  return (
    channels.find((channel) => channel.key === channelKey) ??
    channels.find((channel) => channel.key === getDefaultChannelKey()) ??
    channels[0]!
  );
}

export function getChannelOptions() {
  return listAllChannels().map(({ key, name, description }) => ({
    key,
    name,
    description,
  }));
}

export function getChannelSceneGenerationModes(
  channelKey: string | null | undefined,
): ChatGptGenerationMode[] {
  const key = channelKey?.trim();
  const channel = BUILTIN_CHANNELS.find((entry) => entry.key === key);

  return channel?.sceneGenerationModes ?? DEFAULT_SCENE_GENERATION_MODES;
}

export function getChannelTopicCategory(
  channelKey: string | null | undefined,
  categoryId: string | null | undefined,
) {
  const channel = getChannelProfile(channelKey);

  return channel.topicSystem?.categories.find(
    (category) => category.id === categoryId,
  ) ?? null;
}

export function getSuggestedTopicCategory(
  channelKey: string | null | undefined,
  date = new Date(),
) {
  const channel = getChannelProfile(channelKey);
  const rotation = channel.topicSystem?.weeklyRotation ?? [];

  if (rotation.length === 0) {
    return null;
  }

  const mondayFirstIndex = (date.getDay() + 6) % 7;
  const categoryId = rotation[mondayFirstIndex % rotation.length];

  return getChannelTopicCategory(channel.key, categoryId);
}

/** @deprecated Prefer getSuggestedTopicCategory(channelKey) */
export function getWealthInsightsSuggestedCategory(date = new Date()) {
  return getSuggestedTopicCategory("wealth-insights", date);
}
