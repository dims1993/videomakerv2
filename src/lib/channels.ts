import type { VoiceoverPacingOptions } from "@/lib/voiceover-pacing";
import { WEALTH_INSIGHTS_THUMBNAIL_STYLE } from "@/lib/thumbnail";
import {
  DEFAULT_SCENE_GENERATION_MODES,
  type ChatGptGenerationMode,
} from "@/lib/chatgpt-scene-handoff";

export type ChannelKey = "wealth-insights" | "christian-life" | "the-gods-word";

export type TopicCategory = {
  id: string;
  label: string;
  description: string;
};

export type TopicSystem = {
  enabled: boolean;
  categories: TopicCategory[];
  weeklyRotation: string[];
};

export type EditorialInstructions = {
  role: string;
  audience: string;
  niche: string;
  style: string[];
  originalityRules: string[];
  overusedAngles: string[];
  requiredTopicFields: string[];
};

export type ChannelProfile = {
  key: ChannelKey;
  name: string;
  description: string;
  projectBiblePath: string;
  imagePromptBiblePath: string;
  characterBiblePath?: string;
  voiceoverPacingDefaults?: VoiceoverPacingOptions;
  voiceoverSpeedDefault?: number;
  thumbnailStyle?: typeof WEALTH_INSIGHTS_THUMBNAIL_STYLE;
  topicSystem?: TopicSystem;
  editorialInstructions?: EditorialInstructions;
  sceneGenerationModes?: ChatGptGenerationMode[];
  prompts: {
    angleBuilder: string;
    scriptWriter: string;
    visualPlanner: string;
    metadataWriter: string;
  };
};

export const CHANNELS: ChannelProfile[] = [
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
    voiceoverSpeedDefault: 0.85,
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
    },
    prompts: {
      angleBuilder: "prompts/channels/wealth-insights/angle-builder.md",
      scriptWriter: "prompts/channels/wealth-insights/script-writer.md",
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
    sceneGenerationModes: [
      "FULL_VIDEO",
      "TEN_SCENE_TEST",
      "HOOK_TEST",
      "SEGMENTED_BY_PERCENT",
    ],
    prompts: {
      angleBuilder: "prompts/channels/the-gods-word/angle-builder.md",
      scriptWriter: "prompts/channels/the-gods-word/script-writer.md",
      visualPlanner: "prompts/channels/the-gods-word/visual-planner.md",
      metadataWriter: "prompts/channels/the-gods-word/metadata-writer.md",
    },
  },
];

export function getDefaultChannelKey(): ChannelKey {
  return "wealth-insights";
}

export function getChannelProfile(channelKey: string | null | undefined) {
  return (
    CHANNELS.find((channel) => channel.key === channelKey) ??
    CHANNELS.find((channel) => channel.key === getDefaultChannelKey()) ??
    CHANNELS[0]
  );
}

export function getChannelOptions() {
  return CHANNELS.map(({ key, name, description }) => ({
    key,
    name,
    description,
  }));
}

export function getChannelSceneGenerationModes(
  channelKey: string | null | undefined,
): ChatGptGenerationMode[] {
  const channel = getChannelProfile(channelKey);

  return channel.sceneGenerationModes ?? DEFAULT_SCENE_GENERATION_MODES;
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

export function getWealthInsightsSuggestedCategory(date = new Date()) {
  const channel = getChannelProfile("wealth-insights");
  const rotation = channel.topicSystem?.weeklyRotation ?? [];

  if (rotation.length === 0) {
    return null;
  }

  const mondayFirstIndex = (date.getDay() + 6) % 7;
  const categoryId = rotation[mondayFirstIndex % rotation.length];

  return getChannelTopicCategory("wealth-insights", categoryId);
}
