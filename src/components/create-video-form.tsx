"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { TopicQueueTools } from "@/components/wealth-topic-queue-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TopicAngleLane } from "@/lib/channels";

type ChannelOption = {
  key: string;
  name: string;
};

type TopicCategoryOption = {
  id: string;
  label: string;
  description: string;
};

type EditorialInstructions = {
  role: string;
  audience: string;
  niche: string;
  style: string[];
  originalityRules: string[];
  overusedAngles: string[];
  requiredTopicFields: string[];
  topicEngine?: "default" | "scripture_first" | "conversational_podcast";
};

type RecentTopicContext = {
  category: string | null;
  title: string;
  angle: string | null;
  uniqueMechanism: string | null;
  scriptureAnchor?: string | null;
  centralQuestion?: string | null;
  commonMisunderstanding?: string | null;
  spiritualTurn?: string | null;
  visualHook: string | null;
  thumbnailIdea: string | null;
};

type CreateVideoFormProps = {
  channels: ChannelOption[];
  selectedChannelKey: string;
  selectedChannelName: string;
  topicCategories: TopicCategoryOption[];
  editorialInstructions: EditorialInstructions;
  recentTopics: RecentTopicContext[];
  outlierAngleLanes?: TopicAngleLane[];
  coveredBibleOneYearDays?: number[];
  topicQueueEnabled: boolean;
  /** Skip topic queue and create a blank video ready for script paste. */
  scriptFirst?: boolean;
  createVideoAction: (formData: FormData) => void | Promise<void>;
  importAction: (formData: FormData) => void | Promise<void>;
  runBatchAction: (formData: FormData) => void | Promise<void>;
  initialTopicCategory?: string;
  initialTopicBatchJson?: string;
};

export function CreateVideoForm({
  channels,
  selectedChannelKey,
  selectedChannelName,
  topicCategories,
  editorialInstructions,
  recentTopics,
  outlierAngleLanes = [],
  coveredBibleOneYearDays = [],
  topicQueueEnabled,
  scriptFirst = false,
  createVideoAction,
  importAction,
  runBatchAction,
  initialTopicCategory = "",
  initialTopicBatchJson = "",
}: CreateVideoFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChannelChange(nextChannelKey: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextChannelKey) {
      params.set("channelKey", nextChannelKey);
    } else {
      params.delete("channelKey");
    }

    params.delete("topicCategory");
    params.delete("topicStatus");
    params.delete("topicQueueNotice");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function onTopicCategoryChange(nextCategory: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("channelKey", selectedChannelKey);

    if (nextCategory) {
      params.set("topicCategory", nextCategory);
    } else {
      params.delete("topicCategory");
    }

    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-2">
        <Label htmlFor="channelKey">Channel</Label>
        <select
          id="channelKey"
          name="channelKey"
          value={selectedChannelKey}
          onChange={(event) => onChannelChange(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="">Select a channel…</option>
          {channels.map((channel) => (
            <option key={channel.key} value={channel.key}>
              {channel.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {topicQueueEnabled
            ? "Choose a channel first. Topics are created from the batch generator below, then turned into videos from the queue."
            : scriptFirst
              ? "This channel starts from a finished teaching script. Create the video, then paste the script."
              : "Choose a channel first. Topics are created from the batch generator below, then turned into videos from the queue."}
        </p>
      </div>

      {!selectedChannelKey ? null : topicQueueEnabled ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="topicCategory">Topic category (optional focus)</Label>
            <select
              id="topicCategory"
              name="topicCategory"
              value={initialTopicCategory}
              onChange={(event) => onTopicCategoryChange(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">Balanced across all categories</option>
              {topicCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Optional. Focuses the Topic Batch Generator on one{" "}
              {selectedChannelName} lane.
            </p>
          </div>

          <TopicQueueTools
            channelKey={selectedChannelKey}
            channelName={selectedChannelName}
            categories={topicCategories}
            editorialInstructions={editorialInstructions}
            recentTopics={recentTopics}
            outlierAngleLanes={outlierAngleLanes}
            coveredBibleOneYearDays={coveredBibleOneYearDays}
            selectedCategoryId={initialTopicCategory}
            importAction={importAction}
            runBatchAction={runBatchAction}
            initialTopicBatchJson={initialTopicBatchJson}
          />
        </>
      ) : scriptFirst ? (
        <form action={createVideoAction} className="space-y-4">
          <input type="hidden" name="channelKey" value={selectedChannelKey} />
          <div className="grid gap-2">
            <Label htmlFor="title">Episode title</Label>
            <Input
              id="title"
              name="title"
              required
              placeholder="Day 1 — Introduce Yourself"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="topic">Topic / lesson focus</Label>
            <Input
              id="topic"
              name="topic"
              required
              placeholder="Personal introduction in English (A1–A2)"
            />
            <p className="text-xs text-muted-foreground">
              Short label for the lesson. You will paste the full podcast script
              on the next screen.
            </p>
          </div>
          <Button type="submit">Create video & go to script</Button>
        </form>
      ) : (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Topic batch generation for this channel is not set up yet. Open an
          existing video, or pick a channel with a topic queue.
        </p>
      )}
    </div>
  );
}
