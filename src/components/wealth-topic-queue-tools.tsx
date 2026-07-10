"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

type WealthTopicQueueToolsProps = {
  categories: TopicCategoryOption[];
  editorialInstructions: EditorialInstructions;
  recentTopics: RecentTopicContext[];
  selectedCategoryId?: string;
  importAction: (formData: FormData) => void | Promise<void>;
};

function buildTopicBatchPrompt({
  count,
  selectedCategoryId,
  categories,
  editorialInstructions,
  recentTopics,
}: {
  count: string;
  selectedCategoryId?: string;
  categories: TopicCategoryOption[];
  editorialInstructions: EditorialInstructions;
  recentTopics: RecentTopicContext[];
}) {
  const selectedCategory = categories.find((item) => item.id === selectedCategoryId);
  const rotation = categories
    .map((item) => `${item.id}: ${item.label} - ${item.description}`)
    .join("\n");
  const categoryInstruction =
    selectedCategory
      ? `Selected category:
${selectedCategory.id}

Category label:
${selectedCategory.label}

Category description:
${selectedCategory.description}

Important:
Generate topic ideas only for this Wealth Insights category:
${selectedCategory.label}.

Every generated topic must use this exact category key: ${selectedCategory.id}.
Every generated topic must clearly fit this selected category.
Do not drift into other categories unless the connection to the selected category is direct and central.
Cross-category references are allowed only when they support the selected category.`
      : `Use this balanced category rotation and spread topics across all Wealth Insights categories as evenly as possible:\n${rotation}`;
  const recentAcceptedTopics = recentTopics
    .map((topic) => ({
      category: topic.category,
      title: topic.title,
      angle: topic.angle,
      uniqueMechanism: topic.uniqueMechanism,
      visualHook: topic.visualHook,
      thumbnailIdea: topic.thumbnailIdea,
    }));
  const recentMechanisms = recentTopics
    .flatMap((topic) => [topic.uniqueMechanism, topic.visualHook, topic.thumbnailIdea])
    .filter((item): item is string => Boolean(item?.trim()))
    .slice(0, 15);

  return `Generate ${count} YouTube topic ideas for Wealth Insights.

Channel:
Wealth Insights

Your role:
${editorialInstructions.role}

Audience:
${editorialInstructions.audience}

Niche:
${editorialInstructions.niche}

Style:
${editorialInstructions.style.map((item) => `- ${item}`).join("\n")}

Number of topics requested:
${count}

Goal: CTR-friendly but varied topics for daily publishing.

${categoryInstruction}

Editorial originality rules:
${editorialInstructions.originalityRules.map((item) => `- ${item}`).join("\n")}

Originality mix:
- About 30% may be safe clickable ideas.
- About 40% should use fresher, less obvious mechanisms.
- About 30% should be riskier high-upside ideas that feel unusual but still clear.
${count === "7" ? "- For exactly 7 topics: 2 can be safe clickable ideas, 3 should use fresher original mechanisms, and 2 should be riskier high-upside ideas." : ""}
- Even safe ideas must include a unique mechanism and visual hook.
- Do not add an originality-level field. Keep the output JSON shape unchanged.

Overused angles to avoid unless you have a genuinely fresh mechanism:
${editorialInstructions.overusedAngles.map((item) => `- ${item}`).join("\n")}

Recent accepted/used topics to avoid repeating:
${JSON.stringify(recentAcceptedTopics, null, 2)}

Recent mechanisms/visual hooks to avoid:
${recentMechanisms.length > 0 ? recentMechanisms.map((item) => `- ${item}`).join("\n") : "- None yet"}

Specific mechanism requirement:
- The title should not just sound dramatic.
- The topic must reveal a specific mechanism the viewer has probably felt but not clearly understood.
- Bad: "Inflation Is Hurting Everyone"
- Better: "Your Grocery Store Is Training You to Spend Faster"
- The better version identifies a specific behavioral or retail mechanism that can be visualized.
- Each topic must answer: "What is the actual mechanism this video explains?"
- Store that answer in uniqueMechanism.

Rules:
- Do not simply generate the safest obvious personal finance topics.
- First avoid repeating the recent topics and mechanisms listed above.
- Each idea must have a different mechanism, not just a different title.
- Prefer fresher mechanisms over common finance content.
- Reject or avoid angles that are too close to recent topics.
- Make the visualHook and thumbnailIdea distinct from previous videos.
- Avoid making every topic about a rigged system, hidden trap, villain, or conspiracy-style framing.
- Some ideas should come from behavior, timing, incentives, tradeoffs, habits, emotional decisions, everyday routines, quiet compounding effects, or misunderstood financial mechanics.
- The channel can discuss traps and incentives, but not every topic should sound like the same "system keeps you poor" story.
- Avoid repetition and make each topic meaningfully different from the others.
- Use strong YouTube titles.
- Make the finance topic clear.
- Include an emotional trigger and a visual hook.
- Keep each idea simple enough for animated explanation.
- Do not make get-rich-quick claims.
- Do not guarantee returns.
- Do not use financial advice phrasing.
- Avoid repeating the same angle.
- repetitionRisk must be one of: low, medium, high.

Required topic fields:
${editorialInstructions.requiredTopicFields.map((field) => `- ${field}`).join("\n")}

Return valid JSON only. Do not include markdown, prose, comments, or code fences.

Return exactly this JSON shape:
{
  "topics": [
    {
      "category": "psychology",
      "title": "The Money Habit That Feels Responsible But Keeps You Stuck",
      "topic": "How fear-based financial decisions can look responsible while limiting progress",
      "angle": "Some money habits feel safe because they reduce short-term anxiety, but they can quietly prevent long-term improvement.",
      "uniqueMechanism": "A habit that reduces emotional discomfort today can become a financial cage tomorrow.",
      "trigger": "self-recognition + discomfort",
      "promise": "Help viewers recognize when a safe-looking money habit is actually keeping them stuck.",
      "visualHook": "Main host polishing a small safe labeled SECURITY while the safe slowly turns into a locked cage around him.",
      "thumbnailIdea": "Host trapped inside a shiny safe with huge text SAFE OR STUCK?",
      "repetitionRisk": "low"
    }
  ]
}

The example above demonstrates the JSON shape only. In focused category mode, every generated topic must use the selected category key instead of copying the example category.`;
}

function parseTopicBatch(value: string) {
  const data = JSON.parse(value) as unknown;

  if (!data || typeof data !== "object" || !Array.isArray((data as { topics?: unknown }).topics)) {
    throw new Error("JSON must contain a topics array.");
  }

  const topics = (data as { topics: unknown[] }).topics;
  topics.forEach((topic, index) => {
    if (!topic || typeof topic !== "object") {
      throw new Error(`Topic ${index + 1} must be an object.`);
    }

    const item = topic as Record<string, unknown>;
    ["category", "title", "topic"].forEach((key) => {
      if (typeof item[key] !== "string" || !item[key].trim()) {
        throw new Error(`Topic ${index + 1} is missing ${key}.`);
      }
    });
  });

  return topics.length;
}

export function WealthTopicQueueTools({
  categories,
  editorialInstructions,
  recentTopics,
  selectedCategoryId = "",
  importAction,
}: WealthTopicQueueToolsProps) {
  const [count, setCount] = useState("14");
  const [copied, setCopied] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [parseMessage, setParseMessage] = useState("");
  const selectedCategory = categories.find((item) => item.id === selectedCategoryId);

  const prompt = useMemo(
    () =>
      buildTopicBatchPrompt({
        count,
        selectedCategoryId,
        categories,
        editorialInstructions,
        recentTopics,
      }),
    [categories, count, editorialInstructions, recentTopics, selectedCategoryId],
  );

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function parseBatch() {
    try {
      const parsedCount = parseTopicBatch(jsonText);
      const parsed = JSON.parse(jsonText) as {
        topics: Array<Record<string, unknown> & { category?: string }>;
      };
      const mismatchCount =
        selectedCategoryId
          ? parsed.topics.filter((topic) => topic.category !== selectedCategoryId).length
          : 0;
      const requiredFields = [
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
      ];
      const missingNewFieldCount = parsed.topics.filter((topic) =>
        requiredFields.some((field) => typeof topic[field] !== "string" || !String(topic[field]).trim()),
      ).length;
      const mismatchMessage =
        mismatchCount > 0
          ? ` Some imported topics do not match the selected category. They can still be imported.`
          : "";
      const missingFieldMessage =
        missingNewFieldCount > 0
          ? ` ${missingNewFieldCount} topics are missing one or more newer editorial fields; missing values will import as empty.`
          : "";
      setParseMessage(
        `Valid JSON. ${parsedCount} topics ready to import.${mismatchMessage}${missingFieldMessage}`,
      );
    } catch (error) {
      setParseMessage(error instanceof Error ? error.message : "Invalid topic batch JSON.");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-4 rounded-md border bg-muted/20 p-4">
        <div>
          <h3 className="text-sm font-semibold">Topic Batch Generator</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Copy a structured request for manual ChatGPT topic generation.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="topicBatchCount">Number of topics</Label>
            <select
              id="topicBatchCount"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="7">7</option>
              <option value="14">14</option>
              <option value="28">28</option>
            </select>
          </div>

          <div className="grid gap-2">
            <Label>Topic request mode</Label>
            <div className="flex min-h-9 items-center rounded-md border bg-background px-3 py-2 text-sm">
              {selectedCategory
                ? `Focused: ${selectedCategory.label}`
                : "Balanced across all Wealth Insights categories"}
            </div>
          </div>
        </div>

        <Button type="button" variant="outline" onClick={copyPrompt}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy Topic Batch Request"}
        </Button>
        <div className="grid gap-1 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
          <p>
            Prompt context: Category mode: {selectedCategory ? "Focused" : "Balanced"}
          </p>
          <p>Recent topics included: {recentTopics.length}</p>
          <p>Editorial instructions: Included</p>
          <p>Anti-repetition context: Included</p>
        </div>
      </section>

      <section className="space-y-4 rounded-md border bg-muted/20 p-4">
        <div>
          <h3 className="text-sm font-semibold">Import Topic Batch</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste the JSON response, validate it, then save new topics.
          </p>
        </div>

        <form action={importAction} className="space-y-3">
          <input type="hidden" name="selectedCategory" value={selectedCategoryId} />
          <div className="grid gap-2">
            <Label htmlFor="topicBatchJson">Paste Topic Batch JSON</Label>
            <Textarea
              id="topicBatchJson"
              name="topicBatchJson"
              className="min-h-56 font-mono text-sm"
              value={jsonText}
              onChange={(event) => {
                setJsonText(event.target.value);
                setParseMessage("");
              }}
              placeholder='{"topics":[{"category":"housing","title":"","topic":""}]}'
            />
          </div>

          {parseMessage ? (
            <p className="text-xs text-muted-foreground">{parseMessage}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={parseBatch}>
              Parse Topic Batch
            </Button>
            <Button type="submit">Import Topics</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
