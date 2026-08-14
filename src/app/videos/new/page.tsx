import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  archiveTopicIdeaFromCreate,
  createVideo,
  createVideoFromTopicIdea,
  importTopicBatch,
  runTopicBatch,
} from "@/app/actions";
import { addTopicIdeaToPipelineQueue } from "@/app/pipeline-actions";
import { CreateVideoForm } from "@/components/create-video-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getChannelOptions,
  getChannelProfile,
  getChannelTopicCategory,
  isAudioOnlyChannel,
} from "@/lib/channels-server";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { BIBLE_ONE_YEAR_CATEGORY_ID } from "@/lib/the-bible-in-one-year-shared";
import {
  collectCoveredBibleOneYearDays,
  extractDayNumberFromTopicTitle,
} from "@/lib/the-bible-in-one-year-topic-batch";
import { readTopicBatchDraft } from "@/lib/topic-batch-extract";

type NewVideoPageProps = {
  searchParams?: Promise<{
    channelKey?: string;
    topicCategory?: string;
    topicQueueNotice?: string;
    topicStatus?: string;
    topicBatchDraft?: string;
  }>;
};

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function emptyTopicContext(fallback: {
  category: string | null;
  title: string;
}) {
  return {
    category: fallback.category,
    title: fallback.title,
    angle: null,
    uniqueMechanism: null,
    scriptureAnchor: null,
    centralQuestion: null,
    commonMisunderstanding: null,
    spiritualTurn: null,
    visualHook: null,
    thumbnailIdea: null,
  };
}

function topicContextFromIdeaJson(
  ideaJson: string | null,
  fallback: {
    category: string | null;
    title: string;
  },
) {
  if (!ideaJson?.trim()) {
    return emptyTopicContext(fallback);
  }

  try {
    const parsed = JSON.parse(ideaJson) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyTopicContext(fallback);
    }

    const idea = parsed as Record<string, unknown>;

    return {
      category: textValue(idea.topicCategory) ?? fallback.category,
      title: textValue(idea.workingTitle) ?? fallback.title,
      angle: textValue(idea.coreAngle) ?? textValue(idea.angle),
      uniqueMechanism: textValue(idea.uniqueMechanism),
      scriptureAnchor: textValue(idea.scriptureAnchor),
      centralQuestion: textValue(idea.centralQuestion),
      commonMisunderstanding: textValue(idea.commonMisunderstanding),
      spiritualTurn: textValue(idea.spiritualTurn),
      visualHook: textValue(idea.visualAnchor) ?? textValue(idea.visualHook),
      thumbnailIdea: textValue(idea.thumbnailIdea),
    };
  } catch {
    return emptyTopicContext(fallback);
  }
}

const EMPTY_EDITORIAL = {
  role: "editorial strategy partner",
  audience: "",
  niche: "",
  style: [] as string[],
  originalityRules: [] as string[],
  overusedAngles: [] as string[],
  requiredTopicFields: [] as string[],
};

export default async function NewVideoPage({ searchParams }: NewVideoPageProps) {
  const query = await searchParams;
  const channels = getChannelOptions();
  const selectedChannelKey = query?.channelKey?.trim() || "";
  const selectedChannel = selectedChannelKey
    ? getChannelProfile(selectedChannelKey)
    : null;
  const topicQueueEnabled = Boolean(selectedChannel?.topicSystem?.enabled);
  const scriptFirst = Boolean(
    selectedChannelKey && isAudioOnlyChannel(selectedChannelKey),
  );
  const topicCategories = selectedChannel?.topicSystem?.categories ?? [];
  const outlierAngleLanes =
    selectedChannel?.topicSystem?.outlierAngleLanes ?? [];
  const editorialInstructions =
    selectedChannel?.editorialInstructions ?? EMPTY_EDITORIAL;
  const topicCategory = query?.topicCategory ?? "";
  const topicStatus = query?.topicStatus ?? "active";
  const topicStatusOptions = [
    { value: "active", label: "Idea or selected" },
    { value: "idea", label: "Idea" },
    { value: "selected", label: "Selected" },
    { value: "scripted", label: "Scripted" },
    { value: "produced", label: "Produced" },
    { value: "archived", label: "Archived" },
  ];

  const topicQueueItemsRaw = topicQueueEnabled
    ? await prisma.topicIdea.findMany({
        where: {
          channelKey: selectedChannelKey,
          ...(topicCategory ? { category: topicCategory } : {}),
          ...(topicStatus === "active"
            ? { status: { in: ["idea", "selected"] } }
            : { status: topicStatus }),
        },
        orderBy: { createdAt: "desc" },
        take: topicCategory === BIBLE_ONE_YEAR_CATEGORY_ID ? 400 : 50,
      })
    : [];
  const topicQueueItems =
    topicCategory === BIBLE_ONE_YEAR_CATEGORY_ID
      ? [...topicQueueItemsRaw].sort((a, b) => {
          const dayA =
            extractDayNumberFromTopicTitle(a.title) ?? Number.MAX_SAFE_INTEGER;
          const dayB =
            extractDayNumberFromTopicTitle(b.title) ?? Number.MAX_SAFE_INTEGER;
          if (dayA !== dayB) {
            return dayA - dayB;
          }
          return a.title.localeCompare(b.title);
        })
      : topicQueueItemsRaw;

  const recentTopicIdeas = topicQueueEnabled
    ? await prisma.topicIdea.findMany({
        where: {
          channelKey: selectedChannelKey,
          status: { in: ["selected", "used", "scripted", "produced"] },
        },
        orderBy: { updatedAt: "desc" },
        take: 15,
        select: {
          category: true,
          title: true,
          angle: true,
          uniqueMechanism: true,
          scriptureAnchor: true,
          centralQuestion: true,
          commonMisunderstanding: true,
          spiritualTurn: true,
          visualHook: true,
          thumbnailIdea: true,
        },
      })
    : [];

  const recentVideos = topicQueueEnabled
    ? await prisma.video.findMany({
        where: {
          channelKey: selectedChannelKey,
          topicCategory: { not: null },
          ideaJson: { not: null },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          topicCategory: true,
          ideaJson: true,
        },
      })
    : [];

  const linkedVideoIds = topicQueueEnabled
    ? new Set(
        await prisma.topicIdea
          .findMany({
            where: {
              channelKey: selectedChannelKey,
              createdVideoId: { not: null },
            },
            select: { createdVideoId: true },
          })
          .then((topics) =>
            topics
              .map((topic) => topic.createdVideoId)
              .filter((id): id is string => Boolean(id)),
          ),
      )
    : new Set<string>();

  const recentVideoContexts = recentVideos
    .filter((video) => !linkedVideoIds.has(video.id))
    .map((video) =>
      topicContextFromIdeaJson(video.ideaJson, {
        category: video.topicCategory,
        title: video.title,
      }),
    );
  const recentTopics = [...recentTopicIdeas, ...recentVideoContexts].slice(0, 15);
  const bibleOneYearQueueTitles =
    topicQueueEnabled && selectedChannelKey === "the-gods-word"
      ? await prisma.topicIdea.findMany({
          where: {
            channelKey: selectedChannelKey,
            category: BIBLE_ONE_YEAR_CATEGORY_ID,
          },
          select: { title: true },
          take: 400,
          orderBy: { createdAt: "asc" },
        })
      : [];
  const coveredBibleOneYearDays = collectCoveredBibleOneYearDays(
    recentTopics,
    bibleOneYearQueueTitles.map((item) => item.title),
  );
  const topicBatchDraft =
    topicQueueEnabled && query?.topicBatchDraft === "1"
      ? await readTopicBatchDraft(selectedChannelKey)
      : topicQueueEnabled
        ? await readTopicBatchDraft(selectedChannelKey)
        : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button asChild variant="ghost" className="px-0">
        <Link href="/">
          <ArrowLeft />
          Back
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Create video</CardTitle>
          <CardDescription>
            {topicQueueEnabled
              ? "Select a channel, generate a topic batch, import it, then create a video from the queue. Title and topic come from the imported topics."
              : scriptFirst
                ? "Select Podcast English Lessons, name the episode, and jump straight to the script."
                : "Select a channel, generate a topic batch, import it, then create a video from the queue. Title and topic come from the imported topics."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateVideoForm
            channels={channels}
            selectedChannelKey={selectedChannelKey}
            selectedChannelName={selectedChannel?.name ?? ""}
            topicCategories={topicCategories}
            editorialInstructions={editorialInstructions}
            recentTopics={recentTopics}
            outlierAngleLanes={outlierAngleLanes}
            coveredBibleOneYearDays={coveredBibleOneYearDays}
            topicQueueEnabled={topicQueueEnabled}
            scriptFirst={scriptFirst}
            createVideoAction={createVideo}
            importAction={importTopicBatch}
            runBatchAction={runTopicBatch}
            initialTopicCategory={topicCategory}
            initialTopicBatchJson={topicBatchDraft?.rawText ?? ""}
          />
        </CardContent>
      </Card>

      {topicQueueEnabled && selectedChannel ? (
        <Card>
          <CardHeader>
            <CardTitle>Daily Topic Queue</CardTitle>
            <CardDescription>
              Create a video draft from an imported {selectedChannel.name} topic.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {query?.topicQueueNotice ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {query.topicQueueNotice}
              </div>
            ) : null}

            <form className="flex flex-wrap gap-3" action="/videos/new">
              <input type="hidden" name="channelKey" value={selectedChannelKey} />
              <div className="grid gap-2">
                <label htmlFor="topicStatus" className="text-sm font-medium">
                  Status
                </label>
                <select
                  id="topicStatus"
                  name="topicStatus"
                  defaultValue={topicStatus}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {topicStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <label
                  htmlFor="topicCategoryFilter"
                  className="text-sm font-medium"
                >
                  Category
                </label>
                <select
                  id="topicCategoryFilter"
                  name="topicCategory"
                  defaultValue={topicCategory}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">All categories</option>
                  {topicCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit" variant="outline">
                Apply filters
              </Button>
            </form>

            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[960px]">
                <div className="grid grid-cols-[150px_1fr_140px_120px_130px_280px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
                  <span>Category</span>
                  <span>Title</span>
                  <span>Trigger</span>
                  <span>Status</span>
                  <span>Created</span>
                  <span>Actions</span>
                </div>

                {topicQueueItems.length > 0 ? (
                  topicQueueItems.map((topicIdea) => {
                    const category = getChannelTopicCategory(
                      selectedChannelKey,
                      topicIdea.category,
                    );

                    return (
                      <div
                        key={topicIdea.id}
                        className="grid grid-cols-[150px_1fr_140px_120px_130px_280px] gap-3 border-b px-3 py-3 text-sm last:border-b-0"
                      >
                        <span className="text-xs text-muted-foreground">
                          {category?.label ?? topicIdea.category ?? "None"}
                        </span>
                        <span className="font-medium">{topicIdea.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {topicIdea.trigger ?? ""}
                        </span>
                        <span>
                          <Badge variant="outline">{topicIdea.status}</Badge>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(topicIdea.createdAt)}
                        </span>
                        <span className="flex flex-wrap gap-2">
                          <form
                            action={createVideoFromTopicIdea.bind(
                              null,
                              topicIdea.id,
                            )}
                          >
                            <Button type="submit" size="sm">
                              Create Video
                            </Button>
                          </form>
                          <form
                            action={addTopicIdeaToPipelineQueue.bind(
                              null,
                              topicIdea.id,
                            )}
                          >
                            <Button type="submit" size="sm" variant="secondary">
                              Add to queue
                            </Button>
                          </form>
                          <form
                            action={archiveTopicIdeaFromCreate.bind(
                              null,
                              topicIdea.id,
                            )}
                          >
                            <Button type="submit" size="sm" variant="outline">
                              Archive
                            </Button>
                          </form>
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-3 py-6 text-sm text-muted-foreground">
                    No topics match the current filters. Import a topic batch
                    above to get started.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
