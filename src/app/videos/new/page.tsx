import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  archiveTopicIdeaFromCreate,
  createVideoFromTopicIdea,
  importWealthTopicBatch,
} from "@/app/actions";
import { CreateVideoForm } from "@/components/create-video-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getChannelOptions, getChannelProfile, getChannelTopicCategory } from "@/lib/channels";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

type NewVideoPageProps = {
  searchParams?: Promise<{
    topicCategory?: string;
    topicQueueNotice?: string;
    topicStatus?: string;
  }>;
};

export const dynamic = "force-dynamic";

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function topicContextFromIdeaJson(
  ideaJson: string | null,
  fallback: {
    category: string | null;
    title: string;
  },
) {
  if (!ideaJson?.trim()) {
    return {
      category: fallback.category,
      title: fallback.title,
      angle: null,
      uniqueMechanism: null,
      visualHook: null,
      thumbnailIdea: null,
    };
  }

  try {
    const parsed = JSON.parse(ideaJson) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        category: fallback.category,
        title: fallback.title,
        angle: null,
        uniqueMechanism: null,
        visualHook: null,
        thumbnailIdea: null,
      };
    }

    const idea = parsed as Record<string, unknown>;

    return {
      category: textValue(idea.topicCategory) ?? fallback.category,
      title: textValue(idea.workingTitle) ?? fallback.title,
      angle: textValue(idea.coreAngle) ?? textValue(idea.angle),
      uniqueMechanism: textValue(idea.uniqueMechanism),
      visualHook: textValue(idea.visualAnchor) ?? textValue(idea.visualHook),
      thumbnailIdea: textValue(idea.thumbnailIdea),
    };
  } catch {
    return {
      category: fallback.category,
      title: fallback.title,
      angle: null,
      uniqueMechanism: null,
      visualHook: null,
      thumbnailIdea: null,
    };
  }
}

export default async function NewVideoPage({ searchParams }: NewVideoPageProps) {
  const query = await searchParams;
  const channels = getChannelOptions();
  const wealthChannel = getChannelProfile("wealth-insights");
  const wealthCategories = wealthChannel.topicSystem?.categories ?? [];
  const wealthEditorialInstructions = wealthChannel.editorialInstructions ?? {
    role: "editorial strategy partner",
    audience: "United States",
    niche: "personal finance / money education",
    style: [],
    originalityRules: [],
    overusedAngles: [],
    requiredTopicFields: [],
  };
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
  const topicQueueItems = await prisma.topicIdea.findMany({
    where: {
      channelKey: "wealth-insights",
      ...(topicCategory ? { category: topicCategory } : {}),
      ...(topicStatus === "active"
        ? { status: { in: ["idea", "selected"] } }
        : { status: topicStatus }),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const recentTopicIdeas = await prisma.topicIdea.findMany({
    where: {
      channelKey: "wealth-insights",
      status: { in: ["selected", "used", "scripted", "produced"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 15,
    select: {
      category: true,
      title: true,
      angle: true,
      uniqueMechanism: true,
      visualHook: true,
      thumbnailIdea: true,
    },
  });
  const recentVideos = await prisma.video.findMany({
    where: {
      channelKey: "wealth-insights",
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
  });
  const linkedVideoIds = new Set(
    await prisma.topicIdea
      .findMany({
        where: {
          channelKey: "wealth-insights",
          createdVideoId: { not: null },
        },
        select: { createdVideoId: true },
      })
      .then((topics) =>
        topics
          .map((topic) => topic.createdVideoId)
          .filter((id): id is string => Boolean(id)),
      ),
  );
  const recentVideoContexts = recentVideos
    .filter((video) => !linkedVideoIds.has(video.id))
    .map((video) =>
      topicContextFromIdeaJson(video.ideaJson, {
        category: video.topicCategory,
        title: video.title,
      }),
    );
  const recentTopics = [...recentTopicIdeas, ...recentVideoContexts].slice(0, 15);

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
          <CardDescription>Start with the raw topic and a working title. The full angle output lives in Idea JSON.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateVideoForm
            channels={channels}
            defaultChannelKey="wealth-insights"
            wealthCategories={wealthCategories}
            wealthEditorialInstructions={wealthEditorialInstructions}
            recentTopics={recentTopics}
            importAction={importWealthTopicBatch}
            initialTopicCategory={topicCategory}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily Topic Queue</CardTitle>
          <CardDescription>
            Pick a stored Wealth Insights topic before creating a video draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {query?.topicQueueNotice ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {query.topicQueueNotice}
            </div>
          ) : null}

          <form className="flex flex-wrap gap-3" action="/videos/new">
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
              <label htmlFor="topicCategoryFilter" className="text-sm font-medium">
                Category
              </label>
              <select
                id="topicCategoryFilter"
                name="topicCategory"
                defaultValue={topicCategory}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">All categories</option>
                {wealthCategories.map((category) => (
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
            <div className="min-w-[880px]">
              <div className="grid grid-cols-[150px_1fr_140px_120px_130px_180px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
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
                    "wealth-insights",
                    topicIdea.category,
                  );

                  return (
                    <div
                      key={topicIdea.id}
                      className="grid grid-cols-[150px_1fr_140px_120px_130px_180px] gap-3 border-b px-3 py-3 text-sm last:border-b-0"
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
                        <form action={createVideoFromTopicIdea.bind(null, topicIdea.id)}>
                          <Button type="submit" size="sm">
                            Create Video
                          </Button>
                        </form>
                        <form action={archiveTopicIdeaFromCreate.bind(null, topicIdea.id)}>
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
                  No topics match the current filters.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
