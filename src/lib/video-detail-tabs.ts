const VIDEO_DETAIL_TABS = [
  "idea",
  "script",
  "visual-plan",
  "assets",
  "voiceover",
  "render-draft",
  "thumbnail",
  "metadata",
] as const;

export type VideoDetailTab = (typeof VIDEO_DETAIL_TABS)[number];

export function getVideoDetailTabs(): VideoDetailTab[] {
  return [...VIDEO_DETAIL_TABS];
}

export function resolveVideoDetailTab(
  value: string | undefined,
  _channelKey?: string | null,
): VideoDetailTab {
  if (value && VIDEO_DETAIL_TABS.includes(value as VideoDetailTab)) {
    return value as VideoDetailTab;
  }

  return "idea";
}
