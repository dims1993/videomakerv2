"use client";

import { useState } from "react";

import { createVideo } from "@/app/actions";
import { JsonTextarea } from "@/components/json-textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WealthTopicQueueTools } from "@/components/wealth-topic-queue-tools";

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
};

type RecentTopicContext = {
  category: string | null;
  title: string;
  angle: string | null;
  uniqueMechanism: string | null;
  visualHook: string | null;
  thumbnailIdea: string | null;
};

type CreateVideoFormProps = {
  channels: ChannelOption[];
  defaultChannelKey: string;
  wealthCategories: TopicCategoryOption[];
  wealthEditorialInstructions: EditorialInstructions;
  recentTopics: RecentTopicContext[];
  importAction: (formData: FormData) => void | Promise<void>;
  initialTopicCategory?: string;
};

export function CreateVideoForm({
  channels,
  defaultChannelKey,
  wealthCategories,
  wealthEditorialInstructions,
  recentTopics,
  importAction,
  initialTopicCategory = "",
}: CreateVideoFormProps) {
  const [channelKey, setChannelKey] = useState(defaultChannelKey);
  const [topicCategory, setTopicCategory] = useState(initialTopicCategory);
  const showWealthTools = channelKey === "wealth-insights";

  return (
    <div className="space-y-5">
      <form action={createVideo} className="space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="channelKey">Channel</Label>
          <select
            id="channelKey"
            name="channelKey"
            value={channelKey}
            onChange={(event) => setChannelKey(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            {channels.map((channel) => (
              <option key={channel.key} value={channel.key}>
                {channel.name}
              </option>
            ))}
          </select>
        </div>

        {showWealthTools ? (
          <div className="grid gap-2">
            <Label htmlFor="topicCategory">Wealth Insights Topic Category</Label>
            <select
              id="topicCategory"
              name="topicCategory"
              value={topicCategory}
              onChange={(event) => setTopicCategory(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">No category selected</option>
              {wealthCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Select a category before copying the topic request if you want ideas focused on that content lane.
            </p>
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="topic">Topic</Label>
          <Input id="topic" name="topic" placeholder="What is this video about?" required />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" placeholder="Working title" required />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ideaJson">Idea JSON</Label>
          <JsonTextarea
            id="ideaJson"
            name="ideaJson"
            className="min-h-56 font-mono text-sm"
            placeholder='{"rawIdea": "", "workingTitle": "", "coreAngle": ""}'
          />
        </div>

        <Button type="submit">Create video</Button>
      </form>

      {showWealthTools ? (
        <WealthTopicQueueTools
          categories={wealthCategories}
          editorialInstructions={wealthEditorialInstructions}
          recentTopics={recentTopics}
          selectedCategoryId={topicCategory}
          importAction={importAction}
        />
      ) : null}
    </div>
  );
}
