import {
  BrowserRateLimitError,
  BrowserSessionExpiredError,
  BrowserAutomationError,
} from "@/lib/browser-automation/errors";
import type {
  BrowserCompletionResult,
  BrowserModelProvider,
  BrowserSessionCheck,
  BrowserSessionContext,
  BrowserSubmissionResult,
  ExtractedModelResponse,
} from "@/lib/browser-automation/types";

export type FakeProviderScenario =
  | "success"
  | "slow"
  | "invalid_json"
  | "truncated"
  | "timeout"
  | "session_expired"
  | "rate_limit";

type PendingSubmission = {
  jobId: string;
  prompt: string;
  conversationId: string;
  submittedAt: string;
};

/**
 * In-memory browser provider for local tests / TOPIC_BATCH_PROVIDER=fake.
 */
export class FakeBrowserModelProvider implements BrowserModelProvider {
  readonly key = "fake";
  readonly displayName = "Fake Browser Provider";

  scenario: FakeProviderScenario = "success";
  authenticated = true;
  private readonly pending = new Map<string, PendingSubmission>();
  private conversationCounter = 0;
  private scriptScoreRequestCount = 0;
  private abortChecker: (() => boolean) | null = null;

  setAbortChecker(checker: (() => boolean) | null): void {
    this.abortChecker = checker;
  }


  async openSession(_context: BrowserSessionContext): Promise<void> {
    if (!this.authenticated) {
      throw new BrowserSessionExpiredError();
    }
  }

  async checkSession(): Promise<BrowserSessionCheck> {
    if (!this.authenticated) {
      return {
        authenticated: false,
        requiresUserAction: true,
        message: "Fake session expired. Re-authenticate in Settings.",
      };
    }

    return { authenticated: true, requiresUserAction: false };
  }

  async submitPrompt(input: {
    jobId: string;
    prompt: string;
    conversationMode: "new" | "continue";
    conversationId?: string;
    conversationStartUrl?: string;
    expectReplyKind?: "score" | "script" | "any";
  }): Promise<BrowserSubmissionResult> {
    if (this.scenario === "session_expired" || !this.authenticated) {
      throw new BrowserSessionExpiredError();
    }

    if (this.scenario === "rate_limit") {
      throw new BrowserRateLimitError();
    }

    this.conversationCounter += 1;
    const conversationId =
      input.conversationMode === "continue" && input.conversationId
        ? input.conversationId
        : `fake-conversation-${this.conversationCounter}`;
    const submissionId = `fake-submission-${input.jobId}-${Date.now()}`;
    const submittedAt = new Date().toISOString();

    this.pending.set(submissionId, {
      jobId: input.jobId,
      prompt: input.prompt,
      conversationId,
      submittedAt,
    });

    return { submissionId, conversationId, submittedAt };
  }

  async waitForCompletion(
    submission: BrowserSubmissionResult,
  ): Promise<BrowserCompletionResult> {
    if (this.abortChecker?.()) {
      throw new BrowserAutomationError("Script Writer Batch canceled.", {
        code: "canceled",
      });
    }

    if (this.scenario === "timeout") {
      await delay(50);
      throw new Error("Fake provider timed out waiting for response.");
    }

    if (this.scenario === "slow") {
      await delay(120);
    }

    return {
      submissionId: submission.submissionId,
      conversationId: submission.conversationId,
      completedAt: new Date().toISOString(),
      stabilized: true,
    };
  }

  async extractResponse(
    completion: BrowserCompletionResult,
  ): Promise<ExtractedModelResponse> {
    const pending = this.pending.get(completion.submissionId);

    if (!pending) {
      return {
        text: "",
        finished: false,
        providerError: "Unknown submission.",
      };
    }

    this.pending.delete(completion.submissionId);
    const text = this.buildResponseText(pending.prompt);

    if (this.scenario === "truncated") {
      return {
        text: text.slice(0, Math.max(40, Math.floor(text.length / 3))),
        finished: true,
        providerError: null,
      };
    }

    if (this.scenario === "invalid_json") {
      return {
        text: "Here are topics but not valid JSON: housing - Broken Topic",
        finished: true,
      };
    }

    return {
      text,
      jsonText: text.trimStart().startsWith("{") ? text : null,
      finished: true,
    };
  }

  async closeSession(): Promise<void> {
    this.pending.clear();
    this.scriptScoreRequestCount = 0;
    this.abortChecker = null;
  }

  async downloadLatestGeneratedImage(): Promise<
    import("@/lib/browser-automation/types").BrowserGeneratedImage
  > {
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    return {
      bytes,
      contentType: "image/png",
      sourceUrl: "fake://thumbnail.png",
    };
  }

  private buildResponseText(prompt: string) {
    const isVisualPlanScore =
      /EVALUATE_VISUAL_PLAN|EVALUATE_VISUAL_PLAN_REPAIR|Visual Plan Quality Evaluator|You are evaluating V\d+|You are reviewing Draft V\d+ of a Visual Planner scenes JSON|Critically score THAT LATEST visual plan|Weighted final score/i.test(
        prompt,
      );
    const isVisualPlanRevision =
      /REVISE_VISUAL_PLAN|REVISE_VISUAL_PLAN_REPAIR|GENERATE_VISUAL_PLAN_REPAIR|You are revising a .+ visual plan|Create Draft V\d+ of the Visual Planner scenes JSON by improving|Rewrite a stronger V\d+ of the FULL scenes JSON/i.test(
        prompt,
      );
    const isVisualPlan =
      /Visual Planner Prompt|Generate the full visual plan|scriptText|sceneType/i.test(
        prompt,
      ) && /scene/i.test(prompt);
    const isThumbnailResolve =
      /filling a YouTube thumbnail IMAGE PROMPT template|"resolvedPrompt"/i.test(
        prompt,
      );
    const isThumbnailImageGen =
      /Generate a single YouTube thumbnail image now from this exact prompt/i.test(
        prompt,
      );
    const isTopicBatch =
      /YouTube topic ideas|"topics"\s*:|Number of topics requested/i.test(prompt);
    const isScoreRequest =
      /Critically score THAT LATEST script|Critically score that script|Score THAT LATEST script honestly|You are evaluating a YouTube narration script|You are scoring a Podcast English Lessons script/i.test(
        prompt,
      );
    const isRevisionRequest =
      /Rewrite a stronger V\d+ of the FULL (?:narration|Podcast English Lessons) script|You are revising a YouTube narration script/i.test(
        prompt,
      );
    const isScriptWriter =
      /Script Writer Prompt|Write only the narration|only the final narration script/i.test(
        prompt,
      );

    if (isThumbnailResolve) {
      const titleMatch = prompt.match(/VIDEO TITLE:\n([^\n]+)/);
      const title = titleMatch?.[1]?.trim() || "Untitled";
      return JSON.stringify({
        resolvedPrompt: `YouTube thumbnail, 16:9, high contrast, bold subject for "${title}", clean readable overlay text, cinematic lighting.`,
        notes: "fake resolve",
      });
    }

    if (isThumbnailImageGen) {
      return "Image generated (fake provider).";
    }

    if (isTopicBatch) {
      return this.buildTopicBatchJson(prompt);
    }

    if (isVisualPlanScore) {
      this.scriptScoreRequestCount += 1;
      const score = this.scriptScoreRequestCount === 1 ? 8.2 : 9.3;
      return JSON.stringify(
        {
          overallScore: score,
          passesThreshold: score >= 9.2,
          threshold: 9.2,
          recommendedAction: score >= 9.2 ? "accept" : "revise",
          criticalIssues:
            score < 9.2
              ? ["Scene 2 packs more than one principal claim into one still."]
              : [],
          systemicIssues:
            score < 9.2
              ? ["Consecutive inserts reuse a similar composition family."]
              : [],
          sceneIssues:
            score < 9.2
              ? [
                  {
                    order: 2,
                    issueType: "simplicity",
                    severity: "high",
                    problem:
                      "Scene 2 packs more than one principal claim into one still.",
                    repairInstruction:
                      "Keep the same scriptText and reduce to one dominant object/action relationship.",
                  },
                ]
              : [],
          revisionPriorities:
            score < 9.2
              ? [
                  "Simplify scene 2 composition.",
                  "Vary consecutive insert framing.",
                ]
              : [],
          doNotChange: [
            "Preserve scene 1 opening beat.",
            "Preserve scene 3 closing space beat.",
          ],
          summary:
            score < 9.2
              ? "Several scenes mix too many ideas and prompts stay template-like."
              : "Scenes are clear, distinct, generable, and faithful to one script idea each.",
          categoryScores: {
            durationAndSegmentation: score < 9.2 ? 8.0 : 9.3,
            scriptTextPreservation: score < 9.2 ? 9.0 : 9.5,
            narrationVisualAlignment: score < 9.2 ? 8.0 : 9.4,
            visualSpecificity: score < 9.2 ? 7.5 : 9.3,
            styleConsistency: score < 9.2 ? 8.0 : 9.2,
            characterConsistency: score < 9.2 ? 8.0 : 9.2,
            compositionSimplicity: score < 9.2 ? 7.0 : 9.4,
            flowSafety: score < 9.2 ? 8.5 : 9.3,
            schemaValidity: score < 9.2 ? 9.0 : 9.5,
            productionReadiness: score < 9.2 ? 7.8 : 9.3,
          },
        },
        null,
        2,
      );
    }

    if (isVisualPlanRevision || isVisualPlan) {
      return this.buildFakeVisualPlanScenes();
    }

    if (isScoreRequest) {
      this.scriptScoreRequestCount += 1;
      // First critique stays below the bar; later ones pass so the loop ends.
      const score = this.scriptScoreRequestCount === 1 ? 8.1 : 9.4;
      const decision =
        score >= 9.0
          ? "pass"
          : score >= 8.0
            ? "polish"
            : score >= 7.0
              ? "rewrite"
              : "regenerate";
      return JSON.stringify(
        {
          score,
          decision,
          briefReason:
            score < 9.0
              ? "Opening hook is soft and the mechanism arrives too late."
              : "Strong hook, clear mechanism, and speakable pacing.",
          mainWeakness:
            score < 9.0
              ? "Opening hook is soft and the mechanism arrives too late."
              : "Strong hook, clear mechanism, and speakable pacing.",
          mustFix:
            score < 9.0
              ? ["Strengthen the opening hook with a concrete contradiction."]
              : [],
          rewritePriority: score < 9.0 ? ["opening"] : [],
        },
        null,
        2,
      );
    }

    if (isRevisionRequest) {
      const versionMatch = prompt.match(/Rewrite a stronger V(\d+)/i);
      const versionNumber = Number(versionMatch?.[1] ?? 2) || 2;
      return this.buildFakeScript(prompt, { version: versionNumber });
    }

    if (isScriptWriter) {
      return this.buildFakeScript(prompt, { version: 1 });
    }

    return this.buildFakeScript(prompt, { version: 1 });
  }

  private buildFakeVisualPlanScenes() {
    return JSON.stringify(
      [
        {
          order: 1,
          scriptText: "There is a quiet moment most people overlook.",
          sceneType: "avatar",
          visualPurpose: "hook",
          visualIdea: "MAIN HOST looks straight to camera with calm intensity.",
          duration: 6,
          imagePrompt: "Cinematic portrait of the host, soft key light, shallow depth.",
          status: "planned",
        },
        {
          order: 2,
          scriptText: "It begins with something smaller than a dramatic decision.",
          sceneType: "insert",
          visualPurpose: "mechanism",
          visualIdea: "INSERT: Close-up of a simple everyday object shifting slightly.",
          duration: 7,
          imagePrompt: "Macro insert of a familiar object, documentary lighting.",
          status: "planned",
        },
        {
          order: 3,
          scriptText: "And once you see that mechanism, the story changes.",
          sceneType: "space",
          visualPurpose: "payoff",
          visualIdea: "SPACE: Wide quiet room that feels newly understood.",
          duration: 8,
          imagePrompt: "Wide empty room with morning light, contemplative mood.",
          status: "planned",
        },
      ],
      null,
      2,
    );
  }

  private buildFakeScript(
    prompt: string,
    options: { version: number } = { version: 1 },
  ) {
    const titleMatch = prompt.match(/"workingTitle"\s*:\s*"([^"]+)"/);
    const topicMatch = prompt.match(/"topic"\s*:\s*"([^"]+)"/);
    const title = titleMatch?.[1] ?? "this topic";
    const topic = topicMatch?.[1] ?? "the idea you prepared";
    const versionNote =
      options.version > 1
        ? `This stronger draft V${options.version} names the mechanism earlier and holds attention longer.`
        : "That is where this reflection begins.";

    return [
      `There is a quiet moment most people overlook when they think about ${title}.`,
      ``,
      `It does not begin with a dramatic decision. It begins with something smaller: the way attention drifts, the way pressure accumulates, the way ${topic.toLowerCase()} becomes familiar before it becomes clear.`,
      ``,
      `And once you see that mechanism, the story changes. Not because life suddenly becomes easy, but because the next step finally has a name.`,
      ``,
      versionNote,
    ].join("\n");
  }

  private buildTopicBatchJson(prompt: string) {
    const bibleDayRange = prompt.match(
      /Day range:\s*\n-\s*startDay:\s*(\d+)\s*\n-\s*endDay:\s*(\d+)/i,
    );
    if (bibleDayRange) {
      const startDay = Number(bibleDayRange[1]);
      const endDay = Number(bibleDayRange[2]);
      const topics = [];
      for (let day = startDay; day <= endDay; day += 1) {
        const chapter = day;
        topics.push({
          category: "the_bible_in_one_year",
          dayNumber: day,
          title: `Day ${day} — Genesis ${chapter}`,
          topic: `Genesis ${chapter}`,
          todayReadingDisplay: `Genesis ${chapter}`,
          nextReadingDisplay: `Genesis ${chapter + 1}`,
          listeningFocus: `notice one clear truth from Genesis ${chapter}`,
          chapters: [
            {
              bookName: "Genesis",
              bookNameUppercase: "GENESIS",
              chapterNumber: chapter,
            },
          ],
          reflectionMainThought: `A central truth from Genesis ${chapter}.`,
          reflectionApplication: `Carry one thought from Genesis ${chapter} into daily life.`,
          prayerPoints: [
            "thank God for His Word",
            "ask for a teachable heart",
          ],
          angle: `A calm daily reading for Day ${day}.`,
          uniqueMechanism: `A central truth from Genesis ${chapter}.`,
          trigger: "peaceful encouragement to continue the one-year journey",
          promise: "A manageable daily reading and one applicable thought.",
          visualHook: `An open Bible at Genesis ${chapter} with warm quiet light.`,
          thumbnailIdea: `Open Bible with soft light and short on-image text: 'DAY ${day}'`,
          repetitionRisk: "low",
        });
      }
      return JSON.stringify({ topics }, null, 2);
    }

    const countMatch = prompt.match(/Number of topics requested:\s*(\d+)/i);
    const count = Math.max(1, Math.min(30, Number(countMatch?.[1] ?? 7) || 7));
    const selectedCategoryMatch = prompt.match(
      /Every generated topic must use this exact category key:\s*([a-z0-9_]+)/i,
    );
    const rotationMatch = prompt.match(/^([a-z0-9_]+):/m);
    const category =
      selectedCategoryMatch?.[1] ?? rotationMatch?.[1] ?? "psychology";

    const topics = Array.from({ length: count }, (_, index) => {
      const n = index + 1;
      const scriptureFirst = /SCRIPTURE FIRST|scriptureAnchor|centralQuestion/i.test(
        prompt,
      );
      if (scriptureFirst) {
        return {
          category,
          title: `Why Does Scripture Include Detail ${n}?`,
          scriptureAnchor: `Example ${n}:1-5 — a concrete passage for fake topic ${n}`,
          topic: `Fake biblical topic ${n}: a specific tension inside the passage worth discovering.`,
          centralQuestion: `What does this passage reveal that viewers often miss about detail ${n}?`,
          commonMisunderstanding: `Viewers often treat this story as a generic virtue lesson rather than the specific tension in the text.`,
          angle: `A Scripture-first angle for fake topic ${n}.`,
          uniqueMechanism: `Biblical dynamic ${n}: what happens in the passage and why it matters spiritually.`,
          spiritualTurn: `After seeing the passage clearly, the viewer reconsiders how they approach God in situation ${n}.`,
          trigger: "recognition that a familiar passage is deeper than expected",
          promise: `Help the viewer understand the biblical discovery in topic ${n}.`,
          visualHook: `A symbolic cinematic scene expressing biblical tension ${n}.`,
          thumbnailIdea: `Quiet biblical image for topic ${n} with short on-image text: 'WHAT CHANGED'`,
          repetitionRisk: n % 3 === 0 ? "medium" : "low",
        };
      }
      return {
        category,
        title: `Fake Topic ${n}: The Mechanism Most Viewers Miss`,
        topic: `Fake topic ${n} explaining a specific everyday mechanism in this category.`,
        angle: `A concrete angle for fake topic ${n} that names the mechanism clearly.`,
        uniqueMechanism: `Mechanism ${n}: a specific pattern the viewer feels but has not named.`,
        trigger: "self-recognition + curiosity",
        promise: `Help the viewer understand mechanism ${n} and what to notice next.`,
        visualHook: `A clear animated scene showing mechanism ${n} transforming a familiar object.`,
        thumbnailIdea: `Bold subject reacting to mechanism ${n} with short on-image text.`,
        repetitionRisk: n % 3 === 0 ? "medium" : "low",
      };
    });

    return JSON.stringify({ topics }, null, 2);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
