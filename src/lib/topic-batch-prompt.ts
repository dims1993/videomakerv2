import type { TopicAngleLane } from "@/lib/channels";
import { isBibleOneYearCategory } from "@/lib/the-bible-in-one-year-shared";
import {
  buildBibleOneYearTopicBatchPrompt,
  normalizeBibleOneYearSectionRange,
  type BibleOneYearSectionRange,
} from "@/lib/the-bible-in-one-year-topic-batch";

export type TopicCategoryOption = {
  id: string;
  label: string;
  description: string;
};

export type TopicEditorialInstructions = {
  role: string;
  audience: string;
  niche: string;
  style: string[];
  originalityRules: string[];
  overusedAngles: string[];
  requiredTopicFields: string[];
  topicEngine?: "default" | "scripture_first" | "conversational_podcast";
};

export type RecentTopicContext = {
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

export type BuildTopicBatchPromptInput = {
  channelName: string;
  count: string | number;
  selectedCategoryId?: string;
  categories: TopicCategoryOption[];
  editorialInstructions: TopicEditorialInstructions;
  recentTopics: RecentTopicContext[];
  /** Outlier title mechanics (Wealth Insights). Lane id goes into angle, not a new JSON field. */
  outlierAngleLanes?: TopicAngleLane[];
  /** The Bible in One Year section range (days). */
  bibleOneYearSection?: BibleOneYearSectionRange | null;
  coveredBibleOneYearDays?: number[];
};

function buildWealthTitleClarityInstruction() {
  return `Title clarity rule (finance / mechanism titles):

Before finalizing each title, rewrite it once to make the cause-and-effect instantly clear.

A title should be understandable in under one second.
Do not choose the cleverest title. Choose the clearest clickable title.

Prefer direct verbs that make the mechanism obvious.

For each topic, internally generate 3 title candidates, then select one:
1. direct title — clearest cause-and-effect
2. curiosity title — stronger gap, still clear
3. identity-tension title — how the viewer sees themselves

Priority: clarity → click curiosity → emotional relevance → specificity → originality.

Only output the selected final title in "title". Do not output rejected candidates.`;
}

function buildWealthTitleSelfCheckInstruction() {
  return `Before returning JSON, self-check every finance title:
- Understandable in under one second?
- Concrete object, behavior, number, constraint, or contradiction?
- Specific mechanism implied?
- Prefer the clearer version when curiosity is similar.

Do not explain this check in the output.`;
}

function buildScriptureFirstTopicBatchPrompt({
  channelName,
  countText,
  selectedCategory,
  categories,
  editorialInstructions,
  recentTopics,
}: {
  channelName: string;
  countText: string;
  selectedCategory?: TopicCategoryOption;
  categories: TopicCategoryOption[];
  editorialInstructions: TopicEditorialInstructions;
  recentTopics: RecentTopicContext[];
}) {
  // Bible in One Year is a separate workflow; never include it in unfocused rotation.
  const standaloneCategories = categories.filter(
    (item) => !isBibleOneYearCategory(item.id),
  );
  const exampleCategory =
    selectedCategory?.id ?? standaloneCategories[0]?.id ?? "parable";
  const rotation = standaloneCategories
    .map((item) => `${item.id}: ${item.label} - ${item.description}`)
    .join("\n");

  const categoryInstruction = selectedCategory
    ? `Selected category:
${selectedCategory.id}

Category label:
${selectedCategory.label}

Category description:
${selectedCategory.description}

Important:
Generate topic ideas only for this ${channelName} category: ${selectedCategory.label}.
Every generated topic must use this exact category key: ${selectedCategory.id}.
Categories are labels assigned AFTER the biblical idea is found — do not invent a weak idea merely to fill the category.`
    : `Categories are publishing labels, NOT the starting point.

FIRST find the strongest biblical idea/tension.
THEN assign the most appropriate category from this list:
${rotation}

Spread across categories when ideas are similarly strong.
QUALITY OVERRIDES CATEGORY ROTATION: do not sacrifice a significantly stronger biblical idea merely to balance categories.
Never invent a topic just to fill a category slot.
Never use category "the_bible_in_one_year" in this standalone Biblical Studies generator.`;

  const recentAcceptedTopics = recentTopics.map((topic) => ({
    category: topic.category,
    title: topic.title,
    angle: topic.angle,
    uniqueMechanism: topic.uniqueMechanism,
    scriptureAnchor: topic.scriptureAnchor ?? null,
    centralQuestion: topic.centralQuestion ?? null,
    commonMisunderstanding: topic.commonMisunderstanding ?? null,
    spiritualTurn: topic.spiritualTurn ?? null,
    visualHook: topic.visualHook,
    thumbnailIdea: topic.thumbnailIdea,
  }));
  const recentMechanisms = recentTopics
    .flatMap((topic) => [
      topic.scriptureAnchor,
      topic.centralQuestion,
      topic.commonMisunderstanding,
      topic.uniqueMechanism,
      topic.spiritualTurn,
      topic.visualHook,
      topic.thumbnailIdea,
    ])
    .filter((item): item is string => Boolean(item?.trim()))
    .slice(0, 20);

  return `Generate ${countText} YouTube topic ideas for ${channelName}.

Channel: ${channelName}
Role: ${editorialInstructions.role}
Audience: ${editorialInstructions.audience}
Niche: ${editorialInstructions.niche}

Style:
${editorialInstructions.style.map((item) => `- ${item}`).join("\n")}

Number of topics requested: ${countText}

════════════════════════════════════════
HIGHEST PRIORITY (read in order)
════════════════════════════════════════

1) SCRIPTURE FIRST
Do not generate a Christian topic and attach Scripture to it.
Find something inside Scripture that is worth discovering.

Never begin with a generic life lesson and then search for a Bible story that supports it.

Bad process:
"People struggle with uncertainty." → find Peter walking on water → make a video about trusting God.

Better process:
Start inside the biblical text → notice what is strange, surprising, misunderstood, or spiritually significant → ask what the text emphasizes → then connect that discovery to the viewer.

Ideal progression for each topic:
BIBLICAL TEXT
→ BIBLICAL TENSION
→ COMMON ASSUMPTION OR MISUNDERSTANDING
→ DEEPER SCRIPTURAL MEANING
→ PERSONAL CONFRONTATION
→ HOPEFUL SPIRITUAL TURN

2) BIBLICAL TENSION IS THE IDEA ENGINE
Search first for tension inside the passage itself, such as:
- a strange command from Jesus or God
- a surprising response from Jesus
- an apparent contradiction or difficult saying
- an action that seems unreasonable at first
- a familiar Christian phrase whose biblical meaning is deeper than common usage
- a parable detail people usually overlook
- unexpected character behavior
- intentional delay from God or Jesus
- a repeated detail that changes the meaning
- a contrast between what people expect and what God does
- a symbolic image commonly flattened into a cliché

Internal question:
"What is strange, surprising, misunderstood, uncomfortable, or spiritually significant about this actual biblical text?"

Only after that tension is clear may you connect the passage to the viewer's life.

3) CENTRAL QUESTION
Every topic needs one compelling biblical question the future script must answer.
Store it in "centralQuestion".
Reject candidates that cannot sustain a full episode around one real biblical question.

4) FAMILIAR-BUT-MISUNDERSTOOD SCRIPTURE (ONE VALUABLE LANE)
Treat familiar-but-misunderstood Scripture as one especially valuable topic lane, but do not force every topic into a misunderstanding frame.

Preserve variety in the SOURCE of curiosity. Strong biblical-tension engines include:
- a strange command from Jesus or God
- a surprising response from Jesus
- an apparent contradiction or difficult saying
- an unexpected action that seems unreasonable at first
- an overlooked detail
- intentional delay from God or Jesus
- a repeated detail that changes the meaning
- a contrast between what people expect and what God does
- a symbolic image commonly flattened into a cliché
- unexpected character behavior
- a familiar Christian phrase whose biblical meaning is deeper than common usage

Curiosity must come from the Scripture itself — not manufactured controversy.
Avoid cheap "YOU'VE BEEN READING THIS VERSE WRONG" framing unless the content extraordinarily justifies it (almost never).

5) uniqueMechanism (redefined)
uniqueMechanism = the specific biblical dynamic revealed by the passage that explains why the event, command, image, or teaching matters spiritually.

It must connect:
WHAT HAPPENS IN THE PASSAGE → WHY IT MATTERS → WHAT IT REVEALS about God, faith, discipleship, sin, grace, trust, repentance, etc.

It must NOT be:
- generic psychology imposed onto the Bible
- generic self-help
- abstract motivational language
- a virtue restated with fancier wording

6) commonMisunderstanding
The specific misunderstanding, instinctive assumption, shallow reading, expectation, or cliché that the passage deepens or challenges.

It must be plausible and specific.
It does NOT need to be a widespread Christian doctrinal misunderstanding.
A natural human expectation revealed by the text is valid.

Bad: "People misunderstand faith."
Better example type: "If Jesus loves someone and can help, we instinctively expect love to act immediately."
Store in "commonMisunderstanding".

7) spiritualTurn
After the biblical discovery, what changes about how the viewer sees God, themselves, faith, obedience, grace, repentance, suffering, prayer, or discipleship?
Avoid generic endings like "Trust God more", "Have more faith", "Never give up".
Store in "spiritualTurn".

8) SCRIPT-WORTHINESS
Before accepting a topic, ask:
"Can this sustain a full high-quality Biblical Studies script without repeating one generic spiritual lesson?"

Prefer layered passages that can naturally explore:
what happens → why surprising → context → assumptions in the text → what God/Jesus does → turning point → revelation → viewer connection → hopeful implication.

Reject one-lesson titles stretched into a full video unless anchored to a specific biblical tension that fundamentally changes the idea.

9) TITLE SYSTEM
The TOPIC must contain a specific mechanism.
The TITLE should communicate the biblical subject clearly and create a discovery gap — not explain the entire mechanism.

Internally generate 3 title candidates, then pick one:
A. Biblical question title — direct question from the passage
B. Meaning / misunderstanding title — familiar text with deeper meaning
C. Human tension title — biblical tension meets lived experience, still Scripture-anchored

Title priorities:
1. biblical intrigue
2. immediate clarity
3. curiosity gap
4. emotional relevance
5. faithfulness to the passage
6. originality

A strong title makes viewers think: "I know this story or phrase... but I have never thought about THAT."

Biblical imagery (cross, seed, soil, bread, cup, vine, storm, wilderness, sheep, light, salt, oil, water, etc.) is valuable when the viewer can immediately understand the passage or tension.
Ambiguity is the problem — not poetry.
Do not force every title into the same "Why Did..." formula.
Do not output rejected title candidates.

CTR matters, but never override biblical substance.

10) THEOLOGICAL / CONTEXTUAL INTEGRITY
- Core argument must be defensible from the immediate passage and relevant context.
- Do not strip a verse from context for a motivational message.
- When faithful interpretations differ, do not present one disputed reading as unquestionably "what the verse really means."
- Do not invent biblical events, unsupported motivations, historical facts, or unsupported symbolism.

11) VISUALS AFTER THE IDEA
Priority: Scriptural substance → Biblical tension → Human/spiritual relevance → Script-worthiness → Visual potential.
Do not choose a topic merely for spectacular imagery.
visualHook and thumbnailIdea express the biblical idea; they do not create it.

12) ORIGINALITY AND CONCEPTUAL REPETITION
Originality means new biblical discovery: overlooked detail, less obvious question, familiar passage through a different tension, common phrase returned to biblical context.
Prefer depth over novelty for novelty's sake.

Reject a candidate if it is essentially the same as a recent topic even when the title wording differs — especially if it reuses:
- the same scriptureAnchor / passage focus
- essentially the same centralQuestion
- the same commonMisunderstanding or instinctive assumption
- the same uniqueMechanism / biblical discovery
- the same spiritualTurn
- the same visualHook or thumbnailIdea

Different title wording alone is NOT enough to accept a near-duplicate.

${categoryInstruction}

Editorial originality rules:
${editorialInstructions.originalityRules.map((item) => `- ${item}`).join("\n")}

Overused angles to avoid unless a specific biblical tension fundamentally changes them:
${editorialInstructions.overusedAngles.map((item) => `- ${item}`).join("\n")}

Recent accepted/used topics to avoid repeating (titles AND conceptual DNA):
${JSON.stringify(recentAcceptedTopics, null, 2)}

Recent scripture anchors / questions / misunderstandings / mechanisms / spiritual turns / visuals to avoid:
${recentMechanisms.length > 0 ? recentMechanisms.map((item) => `- ${item}`).join("\n") : "- None yet"}

Emotional trigger ("trigger"):
Must emerge from the biblical tension (conviction, recognition, fear of misunderstanding Jesus, longing for God, spiritual stuckness, silence/abandonment, shame after failure, confusion about suffering, control vs surrender, weak-faith anxiety, realizing a familiar passage is deeper).
Avoid manipulative guilt, fearbait, manufactured urgency, or spiritual threats.

Required topic fields:
${editorialInstructions.requiredTopicFields.map((field) => `- ${field}`).join("\n")}

Internal quality gate before output (reject and regenerate internally if several fail):
- BIBLICAL ANCHOR — specific passage/story/saying/image/action?
- TENSION — something worth discovering?
- QUESTION — one compelling biblical question for the whole episode?
- MISUNDERSTANDING — plausible specific assumption / shallow reading / expectation to deepen (not a forced doctrinal strawman)?
- DISCOVERY — more specific than a generic Christian virtue?
- SPIRITUAL TURN — personally meaningful after understanding the passage?
- SCRIPT-WORTHINESS — full script progression, not repetition?
- TITLE — biblical subject clear + discovery gap?
- ORIGINALITY — meaningfully different from recent topics/mechanisms?
- CONTEXT — argument defensible from Scripture?

Return valid JSON only. No markdown, prose, comments, or code fences.
Plain JSON text is fine (no code fence required), but it must be parseable JSON.

JSON string rules (critical):
- Never put raw double quotes inside a string value.
- For on-image thumbnail text, use single quotes, e.g. on-image text: 'WHY HE WAITED'
- Escape any required double quote as \\"

Return exactly this JSON shape:
{
  "topics": [
    {
      "category": "${exampleCategory}",
      "title": "Example Title Anchored In A Specific Biblical Tension",
      "scriptureAnchor": "Book chapter:verses — brief description of the passage or story",
      "topic": "One-sentence summary of the biblical tension and discovery.",
      "centralQuestion": "The single compelling biblical question the script must answer.",
      "commonMisunderstanding": "The specific misunderstanding, instinctive assumption, shallow reading, expectation, or cliché this episode gently deepens or challenges.",
      "angle": "The focused editorial angle for the episode.",
      "uniqueMechanism": "The specific biblical dynamic this video reveals from the passage.",
      "spiritualTurn": "The personal spiritual implication after the discovery.",
      "trigger": "emotional trigger emerging from the biblical tension",
      "promise": "What the viewer will understand or feel after watching.",
      "visualHook": "One clear symbolic cinematic scene expressing the biblical idea.",
      "thumbnailIdea": "Thumbnail composition + short on-image text: 'EXAMPLE TEXT'",
      "repetitionRisk": "low"
    }
  ]
}

The example demonstrates JSON shape only. In focused category mode, every topic must use the selected category key.
repetitionRisk must be one of: low, medium, high.
Do not fabricate scripture references.`;
}

function buildConversationalPodcastTopicBatchPrompt({
  channelName,
  countText,
  selectedCategory,
  categories,
  editorialInstructions,
  recentTopics,
}: {
  channelName: string;
  countText: string;
  selectedCategory?: TopicCategoryOption;
  categories: TopicCategoryOption[];
  editorialInstructions: TopicEditorialInstructions;
  recentTopics: RecentTopicContext[];
}) {
  const exampleCategory =
    selectedCategory?.id ?? categories[0]?.id ?? "daily_life";
  const rotation = categories
    .map(
      (item) => `${item.id}:
${item.label}
${item.description}`,
    )
    .join("\n\n");

  const categoryInstruction = selectedCategory
    ? `Focused category mode is active.

Selected category:
${selectedCategory.id}

Category label:
${selectedCategory.label}

Category description:
${selectedCategory.description}

Important:
Generate topic ideas only for this ${channelName} category: ${selectedCategory.label}.
Every generated topic must use this exact category key: ${selectedCategory.id}.
Do not drift into other categories unless the connection to the selected category is direct and central.`
    : `Use this balanced category rotation and spread accepted topics across categories as evenly as possible.

${rotation}

Across repeated generations:
- approximately 15–20% of accepted topics may be directly about English or communication;
- approximately 80–85% should be broader human topics (life lessons, growth, mindset, relationships, peace, society beliefs, success/failure, modern life) discussed in accessible English.

Do not let english_communication dominate the channel.
Do not let tiny productivity micro-habits dominate either.`;

  const recentAcceptedTopics = recentTopics.map((topic) => ({
    category: topic.category,
    title: topic.title,
    angle: topic.angle,
    uniqueMechanism: topic.uniqueMechanism,
    visualHook: topic.visualHook,
    thumbnailIdea: topic.thumbnailIdea,
  }));
  const recentMechanisms = recentTopics
    .flatMap((topic) => [
      topic.uniqueMechanism,
      topic.visualHook,
      topic.thumbnailIdea,
    ])
    .filter((item): item is string => Boolean(item?.trim()))
    .slice(0, 15);

  return `Generate ${countText} YouTube topic idea${countText === "1" ? "" : "s"} for ${channelName}.

Channel:
${channelName}

Series concept:
${editorialInstructions.niche}

Your role:
${editorialInstructions.role}

Audience:
${editorialInstructions.audience}

Core product:
Listeners improve their English primarily by listening to an interesting, easy-to-follow conversation between two recurring adult hosts.

This is NOT a teacher-student speaking challenge.

The listener should not need to pause, repeat, answer quizzes, or complete exercises in order to benefit from the episode.

The English learning happens through:
- comprehensible conversation;
- repeated useful phrases in context;
- natural questions and reactions;
- personal examples and mini-stories;
- simple explanations embedded in dialogue;
- recurring vocabulary and chunks;
- conversational recap.

Hosts:
Max and Sara.

Max and Sara are co-hosts, not teacher and student.

Either host may:
- explain an idea;
- ask what something means;
- give an example;
- misunderstand something slightly;
- tell a personal story;
- disagree mildly;
- make a light joke;
- ask a follow-up question.

Neither host should always know more than the other.

Their relationship should feel like two friendly adults having an interesting conversation that happens to be highly understandable for English learners.

Tone:
${editorialInstructions.style.map((item) => `- ${item}`).join("\n")}

Number of topics requested:
${countText}

Goal:
Generate highly clickable, conversation-worthy topics for daily publishing that can naturally sustain approximately 20–30 minutes of Max & Sara dialogue.

Fundamental editorial shift (read carefully):

OLD philosophy (do NOT default to this):
SPECIFIC LIVED EXPERIENCE FIRST — micro-situations and tiny daily objects driving the title.

NEW philosophy (required):
BIG HUMAN CONVERSATION HOOK FIRST,
GROUNDED EVERYDAY EXAMPLES SECOND.

The TITLE sells a big human idea.
The ANGLE and UNIQUE MECHANISM make that conversation concrete and sustainable for 20–30 minutes.
Do NOT force the full everyday mechanism into the title.

The viewer should think:
'That is a meaningful conversation about life. I want to hear Max and Sara talk about it.'

The viewer should also absorb useful English naturally while listening.

The topic should pass this test:

"If this were a normal lifestyle or self-development podcast and not an English-learning channel, would the conversation still sound interesting?"

If no, reject it.

--------------------------------------------------
CATEGORY ROTATION
--------------------------------------------------

${categoryInstruction}

--------------------------------------------------
REFERENCE STYLE
--------------------------------------------------

The fixed editorial references use this general episode feel:

- an immediately recognizable topic or problem;
- a short opening promise;
- casual personal catch-up between the hosts;
- the catch-up naturally connects to the main topic;
- Max and Sara explore the topic through questions and reactions;
- personal anecdotes and realistic examples;
- occasional moments such as:
  'Really?'
  'What do you mean?'
  'Can you give me an example?'
  'Wait, what does that mean?'
  'That makes sense.'
- useful vocabulary and expressions emerge naturally from the discussion;
- explanations are short and conversational;
- light recurring humor;
- a later vocabulary/chunks section can reuse language already heard;
- conversational recap;
- one comment question related to the viewer's own life.

These references are STYLE references only.

Do NOT clone their exact topic concepts or titles.

Reference concepts to avoid copying too closely:
${editorialInstructions.overusedAngles.map((item) => `- ${item}`).join("\n")}

A new topic may touch a related area only if the central mechanism and angle are meaningfully different.

--------------------------------------------------
TOPIC VIABILITY REQUIREMENT
--------------------------------------------------

Every topic must be strong enough to support a 20–30 minute conversation without padding.

Before selecting the idea, internally verify that Max and Sara could naturally discuss at least 5–7 of:

- what the big idea means;
- whether they agree;
- different personal experiences;
- a story from Max;
- a story from Sara;
- a common belief about the topic;
- when that belief is useful or wrong;
- realistic daily-life examples;
- a small disagreement;
- different choices people make;
- useful English phrases;
- a practical takeaway;
- a viewer reflection question.

Do not output these beats.

Use them only to reject ideas that are too thin.

Reject topics that would mostly become:
- motivational slogans;
- a generic list of advice;
- a vocabulary list / dictionary lesson;
- a grammar lesson;
- one short transactional scenario;
- repeated positive statements;
- abstract philosophy with no ordinary examples;
- a listicle;
- generic motivation without a conversational engine.

--------------------------------------------------
EDITORIAL ORIGINALITY
--------------------------------------------------

Editorial originality rules:
${editorialInstructions.originalityRules.map((item) => `- ${item}`).join("\n")}

Additional editorial originality rules:

- The central topic should feel like a meaningful podcast conversation, not a tiny behavioral observation.
- Prefer strong human themes with emotional, philosophical, social, relational, or personal-growth value.
- Broad topics are encouraged when the angle and uniqueMechanism make the actual conversation specific.
- A topic may deal with life, happiness, fear, peace, confidence, truth, relationships, identity, motivation, change, society, dreams, time, regret, self-respect, success, failure, or personal growth.
- The title should create curiosity about the IDEA, not necessarily describe the exact everyday mechanism.
- Ground broad topics in simple everyday examples inside angle and uniqueMechanism.
- Avoid vague motivational filler. A broad topic still needs a concrete conversational engine.
- The viewer should want to hear Max and Sara's opinions, experiences, disagreements, and stories about the topic.
- The English-learning benefit should be secondary to the human interest of the topic.

Do not propose generic titles such as:
- Learn English Easily
- Improve Your English
- Speak English Better
- Daily English Conversation

Bad (old micro-default):
Why You Open Your Laptop And Do Everything Except Start

Better (big human hook + specific mechanism underneath):
The Power Of Starting Again
with a uniqueMechanism about restart resistance after a failed attempt

Bad:
How to Be More Confident

Better:
What Makes Someone Truly Confident?
with a concrete uniqueMechanism about comparison, posture, or speaking up in ordinary moments

Bad:
Improve Your Communication

Better:
Why We Care Too Much About What People Think
with a uniqueMechanism about an imagined audience

--------------------------------------------------
UNIQUE MECHANISM
--------------------------------------------------

The TITLE sells the big human idea.

The UNIQUE MECHANISM explains the specific tension that gives Max and Sara enough material for 20–30 minutes.

Do NOT force the uniqueMechanism wording into the title.

uniqueMechanism must still be specific and observable: an everyday pattern, tension, decision loop, relational dynamic, or conversational mechanism.

It is NOT a lesson activity.

Do NOT use mechanisms such as:
- listen-and-repeat;
- shadowing;
- quizzes;
- name swaps;
- correction loops;
- role-play ladders;
- speaking challenges.

Good uniqueMechanism examples (STYLE ONLY — do not copy into titles or reuse as outputs):

'The Imagined Audience: a person changes what they say or do because they picture other people judging them, even when nobody has actually reacted negatively.'

'The Restart Resistance: beginning again can feel harder than beginning the first time because the person now carries memories of the previous failed attempt.'

'The Busy Without Progress Loop: many small activities create a full day without moving the one important thing forward.'

'The Quiet Distance: neither person decides to end the friendship, but delayed replies, changed routines, and fewer invitations slowly create distance.'

Avoid unsupported scientific or psychological claims.

Prefer ordinary observable behavior and conversational dynamics.

--------------------------------------------------
TITLE STRATEGY
--------------------------------------------------

The title has three jobs:

1. Make the human topic instantly interesting.
2. Position the video clearly inside the easy-English podcast niche.
3. Create enough emotional curiosity to earn the click.

The title does NOT need to explain the full uniqueMechanism.

A broad emotionally strong title is GOOD when angle and uniqueMechanism make the episode concrete.

Do NOT force the full uniqueMechanism into the title.

For example (STYLE ONLY — not an available output):

Title:
The Power Of Starting Again | English Podcast For Easy English Conversation | Learn English Fast

Angle:
Max and Sara explore what it feels like to restart after abandoning a goal, changing plans, having a bad week, or realizing an old approach no longer works.

uniqueMechanism:
The Restart Resistance: beginning again can feel harder than beginning the first time because the person now carries memories of the previous failed attempt.

This is GOOD because the title is broad and emotional while the episode has a specific conversational engine.

--------------------------------------------------
EMOTIONAL SIGNIFICANCE PREFERENCE
--------------------------------------------------

EMOTIONAL SIGNIFICANCE > OBJECT SPECIFICITY.

Titles should tend to capture:
- a big question;
- an uncomfortable truth;
- a human tension;
- a life decision;
- a universal emotion;
- a belief worth discussing;
- an idea with debate potential;
- a problem many people recognize.

Do not default to "Why One..." structures.

Do not default to titles built around:
- a coffee cup;
- a laptop;
- a notification;
- a grocery bag;
- a messy desk;
- a forgotten object;
- a tiny task;
- an unanswered message.

These can still appear inside the episode, angle, uniqueMechanism, or visualHook, but should not dominate the title strategy.

Do not make every title dramatic.

Do not use fake urgency, fear, or clickbait.

Prefer podcast-scale human ideas over productivity-blog micro-headlines.

--------------------------------------------------
PREFERRED TITLE FORMATS
--------------------------------------------------

Use a varied mixture of these title structures across repeated generations.

PRIMARY FORMAT — approximately 40%:

English Podcast For Easy English Conversation | [BIG HUMAN TOPIC] | Learn English Fast

Format examples only (NOT available outputs — see EXAMPLE ANTI-COPY RULE):

English Podcast For Easy English Conversation | The Truth About Always Being Busy | Learn English Fast

English Podcast For Easy English Conversation | Why We Care Too Much About Other People’s Opinions | Learn English Fast

English Podcast For Easy English Conversation | The Courage To Start Again | Learn English Fast


SECONDARY FORMAT — approximately 30%:

[BIG HUMAN TOPIC] | Easy English Podcast For Conversation Practice | Learn English Fast

Format examples only (NOT available outputs — see EXAMPLE ANTI-COPY RULE):

The Power Of Starting Again | Easy English Podcast For Conversation Practice | Learn English Fast

Learning To Enjoy Your Own Company | Easy English Podcast For Conversation Practice | Learn English Fast

Why Some Friendships Slowly Disappear | Easy English Podcast For Conversation Practice | Learn English Fast


DAILY LIFE CONVERSATION FORMAT — approximately 15%:

[BIG HUMAN TOPIC] | English Podcast For Easy Conversation in Daily Life | Learn English Fast

Format examples only (NOT available outputs — see EXAMPLE ANTI-COPY RULE):

Don’t Let One Bad Day Control Your Week | English Podcast For Easy Conversation in Daily Life | Learn English Fast

When Being Busy Stops Feeling Productive | English Podcast For Easy Conversation in Daily Life | Learn English Fast


ENGLISH-SKILL FORMAT — approximately 15%:

How To Talk About [USEFUL HUMAN TOPIC] In English | Learn English Fast | Podcast English For Easy Conversation

or:

Talking About [USEFUL HUMAN TOPIC] | Easy English Podcast For Conversation Practice | Learn English Fast

Format examples only (NOT available outputs — see EXAMPLE ANTI-COPY RULE):

How To Talk About Your Future In English | Learn English Fast | Podcast English For Easy Conversation

Talking About Difficult Decisions | Easy English Podcast For Conversation Practice | Learn English Fast

Do NOT output these examples verbatim.

--------------------------------------------------
TITLE QUALITY TEST
--------------------------------------------------

Before accepting a title, check internally:

A. BIG IDEA TEST — Does this sound like a conversation about something meaningful enough for 20–30 minutes?
B. HUMAN INTEREST TEST — Would someone potentially click even if they were not specifically searching for an English lesson?
C. PODCAST TEST — Does it sound like a podcast episode title rather than a productivity blog headline?
D. SEO WRAPPER TEST — Does the title clearly fit the easy-English podcast niche?
E. SIMPLICITY TEST — Can an A1–B1 learner understand the core title concept?
F. CURIOSITY TEST — Does it make the viewer want Max and Sara’s perspective?
G. MICRO-TOPIC TEST — Is the title unnecessarily focused on a tiny action/object when a bigger human framing would be stronger?

If G = yes, rewrite.

Also ask:
'What will Max and Sara actually have to talk about for 20–30 minutes?'

If there is no specific conversational engine behind the title, reject it.

--------------------------------------------------
OLD STYLE VS NEW STYLE
--------------------------------------------------

OLD STYLE — DO NOT DEFAULT TO THIS:

Why You Open Your Laptop And Do Everything Except Start
Why Your Coffee Gets Cold Before You Drink It
Why One Missing Sock Can Ruin Your Morning
Why Your Desk Gets Messy Again So Fast
Why A Simple Group Chat Becomes Complicated
Why One Notification Breaks Your Whole Morning
Why A Five-Minute Task Can Stay On Your List For Three Days

These are not always forbidden as episode material, but they represent the OLD editorial bias.

Do not generate batches dominated by this structure.

NEW STYLE — PREFERRED DIRECTION (STYLE ONLY — do not copy):

The Truth About Always Being Busy
The Power Of Starting Again
Why We Care Too Much About What People Think
Are We Chasing The Wrong Things?
Learning To Enjoy Your Own Company
When Is It Time To Let Go?
What Makes Someone Truly Confident?
Why Some Friendships Slowly Disappear
The Things We Understand Too Late
The Courage To Change Your Mind

--------------------------------------------------
EXAMPLE ANTI-COPY RULE
--------------------------------------------------

All example titles, mechanisms, visual hooks, and thumbnail ideas in this prompt are format and style references only.

They are NOT available topic outputs.

Do NOT output any exact title, central topic, uniqueMechanism, visualHook, or thumbnailIdea that appears as an example in this prompt.

Forbidden exact example titles include, but are not limited to:

- Job Interview Questions And Answers
- Stop Wasting Time
- How To Make Small Talk
- Talking About Your Weekend
- How To Stop Overthinking
- How To Talk About Yourself
- How To Stay Motivated
- Making Friends As An Adult
- Living Alone
- How To Say No Politely
- How To Handle A Bad Day
- Morning Habits
- Working From Home
- Phone Addiction
- Saving Money
- Changing Jobs
- Feeling Tired All The Time
- Being Shy
- Making Plans With Friends
- Why Weekends Feel Too Short
- What Makes A Good Friend?
- Why We Keep Checking Our Phones
- Is It Better To Live Alone?
- Why You Open Your Laptop And Do Everything Except Start
- Why Your Coffee Gets Cold Before You Drink It
- Why One Missing Sock Can Ruin Your Morning
- Why Your Desk Gets Messy Again So Fast
- Why A Simple Group Chat Becomes Complicated
- Why One Notification Breaks Your Whole Morning
- Why A Five-Minute Task Can Stay On Your List For Three Days
- The Truth About Always Being Busy
- The Power Of Starting Again
- Why We Care Too Much About What People Think
- Are We Chasing The Wrong Things?
- Learning To Enjoy Your Own Company
- When Is It Time To Let Go?
- What Makes Someone Truly Confident?
- Why Some Friendships Slowly Disappear
- The Things We Understand Too Late
- The Courage To Change Your Mind
- The Power Of Positivity
- Don’t Waste Your Life
- Big Lies Society Told Us
- The Real Superpower That Can Change Your Life
- Truth Or Dare
- How To Talk About Yourself in English
- Finding Peace

You may generate topics in the same title style, SEO structure, scale, emotional ambition, and editorial spirit, but the specific example topics above must not be reused unless the user explicitly provides one of them as a seed topic.

Important distinction:

COPYING (not allowed):
"The Power Of Positivity" → "The Amazing Power Of Positivity"

LEARNING THE PATTERN (allowed):
"The Power Of Positivity" → a different conversation, such as changing your mind after failure, with a different core claim.

Do not create cosmetic rewrites of forbidden examples.

If the generated idea feels like a direct rewrite of an example, reject it and generate a different idea.

--------------------------------------------------
SEO PHRASES
--------------------------------------------------

The following phrases may intentionally recur across videos:

English Podcast For Easy English Conversation
English Podcast For Easy Conversation in Daily Life
Easy English Podcast For Conversation Practice
Easy English Podcast Conversation in Daily Life
Podcast English For Easy Conversation
English Listening Practice
B1 English Listening Practice
Learn English Fast
Easy English Conversation
Natural English Conversation
English Podcast For Learning English
Easy English Podcast

This repetition is allowed because these phrases describe the channel format and search intent.

Do NOT treat these repeated SEO phrases as editorial repetition.

Editorial originality should be judged from the BIG HUMAN TOPIC in the center, plus:
- angle;
- uniqueMechanism;
- stories;
- conversational questions;
- visual metaphor.

"Learn English Fast" may be used as an SEO/title phrase, but do not make unsupported promises inside the promise field such as guaranteeing fluency in a specific number of days.

Do not include A1, A2, Day numbers, or episode numbers in the title unless explicitly requested.
B1 English Listening Practice may appear as an SEO wrapper when natural.

--------------------------------------------------
ORIGINALITY MIX
--------------------------------------------------

Across repeated generations:

- around 30% may be safe, immediately clickable human topics;
- around 40% should use fresher, less obvious human angles with strong mechanisms underneath;
- around 30% may be higher-risk, higher-upside ideas that feel surprising but remain instantly understandable.

Even safe topics need a specific uniqueMechanism.

Do not add an originality-level field.

Keep the output JSON shape unchanged.

--------------------------------------------------
MULTI-TOPIC BALANCE
--------------------------------------------------

When generating 2 topics:
- one may be a safer searchable human topic;
- one should be a fresher life/mindset/relationship/society angle that is less obvious but still instantly understandable.
- at least one title should feel like a podcast-scale human idea, not only a tiny object scene.

When generating 5 or more topics, require approximately:
- at least one life-lesson topic;
- at least one mindset/confidence topic;
- at least one relationships/social topic;
- at least one higher-curiosity society or belief topic;
- optionally one directly English-related topic.

Do NOT require a title based on a concrete object.

Do NOT require a phone notification, messy desk, coffee cup, grocery bag, laptop, or tiny task as a central topic.

Objects may appear in visualHook but are not required as central topics.

Also ensure emotional variety.

Do not produce a batch where all topics are:
- productivity;
- confidence;
- sadness;
- overthinking;
- English fluency.

--------------------------------------------------
RECENT ACCEPTED TOPICS
--------------------------------------------------

Recent accepted/used topics to avoid repeating:

${JSON.stringify(recentAcceptedTopics, null, 2)}

When this list is populated:
- avoid the same central question or conceptual engine;
- avoid the same lived mechanism;
- avoid cosmetic title rewrites;
- avoid merely changing SEO wrappers while keeping the same claim;
- judge duplication at the conceptual level, not from SEO phrases.

Examples of conceptual duplicates to avoid:
- "The Power Of Starting Again" and "Why You Should Give Yourself Another Chance"
- "Why We Care What People Think" and "How To Stop Living For Other People"

--------------------------------------------------
RECENT MECHANISMS / VISUAL HOOKS
--------------------------------------------------

Recent mechanisms/visual hooks to avoid:

${recentMechanisms.length > 0 ? recentMechanisms.map((item) => `- ${item}`).join("\n") : "- None yet."}

Do not repeat the same visual metaphor in consecutive episodes.

--------------------------------------------------
VISUAL IDENTITY
--------------------------------------------------

visualHook and thumbnailIdea must use Max and Sara in the established podcast studio.

Do not build the thumbnail around a completely new illustrated world.

The thumbnail does NOT need to literally illustrate a tiny daily action.

It should communicate the BIG IDEA with:
- facial expression;
- body language;
- one symbolic prop;
- thought bubble;
- split choice;
- broken/whole symbol;
- road signs;
- clock;
- mask;
- mirror;
- open door;
- scale;
- heart;
- social bubbles;
- simple cards;
- one strong metaphor.

Keep it simple.

Examples (STYLE ONLY):

Why We Care Too Much About What People Think:
Sara looks toward several floating opinion bubbles while Max points toward a card that says 'YOUR LIFE'.

Starting Again:
Max holds a crumpled old plan while Sara opens a clean new notebook.

Friendships Growing Apart:
Max and Sara hold two phones with a widening gap between message bubbles.

Do not force every thumbnail to use:
- laptop;
- notification;
- coffee;
- calendar;
- tiny task.

Thumbnail text must complement the YouTube title rather than repeat it word for word.

Keep on-image text short, ideally 2–5 words.

Preferred emotional thumbnail phrase style (STYLE ONLY — do not copy):
'WHAT REALLY MATTERS?'
'START AGAIN'
'WHO ARE YOU LIVING FOR?'
'TIME TO LET GO?'
'WHY DO WE CARE?'
'IS THIS SUCCESS?'

Do not use Day badges.

--------------------------------------------------
SPECIFIC MECHANISM REQUIREMENT
--------------------------------------------------

The title should not merely sound dramatic.

The underlying IDEA must contain a specific mechanism the viewer has probably experienced.

The title itself does NOT need to explicitly name that mechanism.

The title may use a broader, simpler, more emotionally ambitious framing as long as uniqueMechanism clearly defines what Max and Sara will actually explore.

Each topic must answer:

'What exactly is happening here that Max and Sara can unpack for 20–30 minutes?'

Store that answer in uniqueMechanism.

If the answer is vague, reject the idea and generate another one.

--------------------------------------------------
RULES
--------------------------------------------------

- Generate only one strong idea, not one safe idea by default${countText === "1" ? "" : " (when generating multiple, each must still be strong)"}.
- Treat examples as forbidden outputs. Examples are not candidate topics.
- Avoid near-duplicates of example titles, not only exact duplicates.
- Prefer BIG HUMAN CONVERSATION HOOK titles over micro-object titles.
- Do not let batches default to laptop/task/notification/message/coffee micro-topics.
- Do not let the first batch after this prompt default to job interviews, stopping time waste, small talk, talking about yourself, or generic fluency topics unless explicitly requested by the user.
- Prefer emotionally significant titles over object-specific micro-headlines when clarity remains similar.
- Do not make titles artificially dramatic. Emotion should come from a meaningful human idea.
- Avoid repeating the exact title pattern “Why One...” across batches.
- Prefer a strong human topic over a narrow language syllabus item.
- Keep English-learning value naturally embedded.
- Avoid turning every topic into advice about fluency.
- Avoid long grammar-lecture concepts.
- Avoid pure vocabulary-list concepts.
- Avoid topics that depend on the listener actively answering questions.
- Avoid explicit listen-and-repeat mechanisms.
- Avoid quizzes, missions, speaking challenges, and learner pauses.
- Max and Sara should have genuine room for different opinions or experiences.
- The topic should generate natural questions between the hosts.
- Include an emotional trigger, but do not use manipulative fear.
- The promise must be realistic and must include both human conversation payoff and natural English listening payoff.
- Do not make guaranteed psychological, financial, health, or language-learning claims.
- Make each visualHook meaningfully different from recent episodes.
- Keep the topic understandable for A1–B1 English.
- Avoid academic, political, highly technical, or specialist topics unless they can be discussed through ordinary daily experience.
- Avoid pseudo-scientific claims about the brain, psychology, health, or behavior.
- repetitionRisk must be exactly one of:
  low
  medium
  high

--------------------------------------------------
CRITICAL SELF-AUDIT
--------------------------------------------------

Before returning each topic, internally verify:

- Is the title built around a meaningful human conversation?
- Is the idea interesting outside English learning?
- Does it feel more like a podcast episode than a micro-productivity article?
- Is the title broader than the uniqueMechanism?
- Is the uniqueMechanism still specific enough to prevent generic motivation?
- Can Max and Sara disagree or have different experiences?
- Can the subject sustain 20–30 minutes?
- Can it be explained using simple A1–B1 English?
- Does the angle include ordinary examples?
- Is the English-learning benefit naturally embedded?
- Does the title use one of the preferred SEO structures?
- Is it distinct from reference examples and recent topics?
- Is the thumbnail idea emotionally clear?
- Is this another laptop/task/notification/message micro-topic?

If the last answer is yes without a strong reason, regenerate.

--------------------------------------------------
REQUIRED TOPIC FIELDS
--------------------------------------------------

${editorialInstructions.requiredTopicFields.map((field) => `- ${field}`).join("\n")}

Field meanings:

category:
Exactly one valid category key from the rotation above.
Allowed keys only:
english_communication, daily_life, habits_productivity, work_study, social_relationships, feelings_mindset, food_lifestyle, home_city, travel_culture, technology_media.
Do not invent new category keys such as peace_happiness, personal_growth, or mindset_confidence.
Map peace/happiness/mindset ideas to feelings_mindset.
Map life-lesson ideas to daily_life.
Map growth/restart ideas to habits_productivity.
Map society/belief ideas to travel_culture.

title:
The proposed YouTube title (big human idea + SEO wrappers).

topic:
One sentence describing what Max and Sara will talk about.

angle:
The focused editorial perspective that keeps the episode from becoming generic, including ordinary examples.

uniqueMechanism:
The concrete tension, pattern, or dynamic that gives Max and Sara enough material — more specific than the title.

trigger:
A provocative question, recognizable fear, life tension, uncomfortable truth, aspiration, relationship experience, disagreement, or strong curiosity. It does NOT always need to be a tiny observable object event.

promise:
BOTH (1) human conversation payoff and (2) natural English listening payoff. Realistic. No guaranteed fluency/life-change claims.

visualHook:
One studio-based visual scene that communicates the big idea with expression, body language, or one clear metaphor.

thumbnailIdea:
Thumbnail composition plus short complementary on-image text using single quotes.

repetitionRisk:
low, medium, or high.

--------------------------------------------------
OUTPUT
--------------------------------------------------

Return valid JSON only.

Do not include markdown, prose, comments, or code fences.

Plain JSON text is fine, but it must be parseable JSON.

JSON string rules are critical:

- Never put raw double quotes inside a string value.
- For on-image thumbnail text, use single quotes.
- Example:
  on-image text: 'WHY DO WE CARE?'
- Escape any genuinely required double quote as \\"

Return exactly this JSON shape:

{
  "topics": [
    {
      "category": "${exampleCategory}",
      "title": "Example Big Human Idea | Easy English Podcast For Conversation Practice | Learn English Fast",
      "topic": "One-sentence summary of the conversation topic.",
      "angle": "The focused editorial angle with ordinary examples that gives Max and Sara enough material for a natural long-form conversation.",
      "uniqueMechanism": "The concrete everyday mechanism or conversational dynamic this episode explores.",
      "trigger": "The recognizable emotional, relational, or life tension that makes the viewer click.",
      "promise": "What the viewer will understand or recognize after listening while absorbing useful natural English.",
      "visualHook": "One clear studio-based visual scene that communicates the big idea.",
      "thumbnailIdea": "Thumbnail composition + short complementary on-image text: 'EXAMPLE TEXT'",
      "repetitionRisk": "low"
    }
  ]
}

The example demonstrates the JSON shape only.

If focused category mode is active, every generated topic must use the selected valid category key instead of copying the example category.`;
}

export function buildTopicBatchPrompt({
  channelName,
  count,
  selectedCategoryId,
  categories,
  editorialInstructions,
  recentTopics,
  outlierAngleLanes = [],
  bibleOneYearSection,
  coveredBibleOneYearDays,
}: BuildTopicBatchPromptInput) {
  if (isBibleOneYearCategory(selectedCategoryId)) {
    const section =
      bibleOneYearSection ??
      normalizeBibleOneYearSectionRange(1, Number(count) || 30);
    return buildBibleOneYearTopicBatchPrompt({
      channelName,
      section,
      coveredDays: coveredBibleOneYearDays,
      recentTopics,
    });
  }

  const countText = String(count);
  const selectedCategory = categories.find(
    (item) => item.id === selectedCategoryId,
  );

  if (editorialInstructions.topicEngine === "scripture_first") {
    return buildScriptureFirstTopicBatchPrompt({
      channelName,
      countText,
      selectedCategory,
      categories,
      editorialInstructions,
      recentTopics,
    });
  }

  if (editorialInstructions.topicEngine === "conversational_podcast") {
    return buildConversationalPodcastTopicBatchPrompt({
      channelName,
      countText,
      selectedCategory,
      categories,
      editorialInstructions,
      recentTopics,
    });
  }

  const exampleCategory =
    selectedCategory?.id ?? categories[0]?.id ?? "category_id";
  const rotation = categories
    .map((item) => `${item.id}: ${item.label} - ${item.description}`)
    .join("\n");
  const categoryInstruction = selectedCategory
    ? `Selected category:
${selectedCategory.id}

Category label:
${selectedCategory.label}

Category description:
${selectedCategory.description}

Important:
Generate topic ideas only for this ${channelName} category:
${selectedCategory.label}.

Every generated topic must use this exact category key: ${selectedCategory.id}.
Every generated topic must clearly fit this selected category.
Do not drift into other categories unless the connection to the selected category is direct and central.
Cross-category references are allowed only when they support the selected category.`
    : `Use this balanced category rotation and spread topics across all ${channelName} categories as evenly as possible:\n${rotation}`;
  const outlierAngleLaneInstruction =
    outlierAngleLanes.length > 0
      ? `Outlier angle lanes:

Use these angle lanes to shape stronger YouTube topics.

The category defines the financial territory.
The angle lane defines the title format and curiosity structure.
The uniqueMechanism makes the idea original.

Do not generate topics from category alone.

Available angle lanes:
${outlierAngleLanes
  .map(
    (lane) => `

${lane.id}: ${lane.label}
Description: ${lane.description}
Title patterns:
${lane.titlePatterns.map((pattern) => `- ${pattern}`).join("\n")}
Avoid:
${lane.avoid?.length ? lane.avoid.map((item) => `- ${item}`).join("\n") : "- None"}`,
  )
  .join("\n")}

For every idea, choose one angle lane internally and make the title follow that lane's curiosity structure.

Important:
Do not add a new angleLane field to the JSON.
Instead, include the selected lane naturally inside the existing "angle" field.

Example:
"angle": "exact_system — A modest-income savings system that shows how the viewer can build a larger cash buffer without needing a higher salary."

Do not copy the title patterns literally.
Use them as title mechanics only.`
      : "";

  const titleClarityInstruction =
    outlierAngleLanes.length > 0 ? buildWealthTitleClarityInstruction() : "";
  const titleSelfCheckInstruction =
    outlierAngleLanes.length > 0 ? buildWealthTitleSelfCheckInstruction() : "";

  const recentAcceptedTopics = recentTopics.map((topic) => ({
    category: topic.category,
    title: topic.title,
    angle: topic.angle,
    uniqueMechanism: topic.uniqueMechanism,
    visualHook: topic.visualHook,
    thumbnailIdea: topic.thumbnailIdea,
  }));
  const recentMechanisms = recentTopics
    .flatMap((topic) => [
      topic.uniqueMechanism,
      topic.visualHook,
      topic.thumbnailIdea,
    ])
    .filter((item): item is string => Boolean(item?.trim()))
    .slice(0, 15);

  return `Generate ${countText} YouTube topic ideas for ${channelName}.

Channel:
${channelName}

Your role:
${editorialInstructions.role}

Audience:
${editorialInstructions.audience}

Niche:
${editorialInstructions.niche}

Style:
${editorialInstructions.style.map((item) => `- ${item}`).join("\n")}

Number of topics requested:
${countText}

Goal: CTR-friendly but varied topics for daily publishing.

${categoryInstruction}

${outlierAngleLaneInstruction}

${titleClarityInstruction}

Editorial originality rules:
${editorialInstructions.originalityRules.map((item) => `- ${item}`).join("\n")}

Originality mix:
- About 30% may be safe clickable ideas.
- About 40% should use fresher, less obvious mechanisms.
- About 30% should be riskier high-upside ideas that feel unusual but still clear.
${countText === "7" ? "- For exactly 7 topics: 2 can be safe clickable ideas, 3 should use fresher original mechanisms, and 2 should be riskier high-upside ideas." : ""}
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
- Bad: a vague virtue or problem restated as a title.
- Better: a specific lived mechanism that can be visualized in one clear scene.
- Each topic must answer: "What is the actual mechanism this video explains?"
- Store that answer in uniqueMechanism.
${
  outlierAngleLanes.length > 0
    ? `
Outlier title rules:

- Do not generate generic finance explainer titles.
- Each idea must combine:
  1. category
  2. angle lane
  3. concrete viewer situation
  4. hidden contradiction
  5. unique mechanism
  6. strong YouTube curiosity

- Prefer titles with:
  - concrete numbers
  - specific objects
  - ordinary constraints
  - list formats
  - identity tension
  - salary vs wealth contradiction
  - waste vs comfort contradiction
  - rich vs looking rich contradiction
  - hidden math
  - exact systems
  - zero-cost improvement

- Avoid titles like:
  - Why You Need an Emergency Fund
  - How to Save More Money
  - How to Build Wealth
  - Money Habits That Matter
  - Budgeting Tips for Beginners

- Better title mechanics:
  - How I Built [Result] on [Constraint]
  - 10 Signs Someone Has [Hidden Strength], Not Just [Visible Marker]
  - Why [Visible Metric] Doesn't Matter as Much as You Think
  - 12 Things That Are a Waste of Money That People Still Defend
  - [Decision A] vs [Decision B]: The Mistake Nobody Calculates

- Outlier titles should be specific but not confusing.
- A title should create curiosity without making the viewer decode the metaphor.
`
    : ""
}
Rules:
- Do not simply generate the safest obvious topics for this niche.
- First avoid repeating the recent topics and mechanisms listed above.
- Each idea must have a different mechanism, not just a different title.
- Prefer fresher mechanisms over common content in this niche.
- Reject or avoid angles that are too close to recent topics.
- Make the visualHook and thumbnailIdea distinct from previous videos.
- Avoid making every topic use the same framing pattern.
- Avoid repetition and make each topic meaningfully different from the others.
- Use strong YouTube titles that still fit the channel voice.
- Include an emotional trigger and a visual hook.
- Keep each idea simple enough for visual storytelling.
- Avoid repeating the same angle.
- repetitionRisk must be one of: low, medium, high.

Required topic fields:
${editorialInstructions.requiredTopicFields.map((field) => `- ${field}`).join("\n")}

${titleSelfCheckInstruction}

Return valid JSON only. Do not include markdown, prose, comments, or code fences.
Plain JSON text is fine (no code fence required), but it must be parseable JSON.

JSON string rules (critical):
- Never put raw double quotes inside a string value.
- For on-image thumbnail text, use single quotes, e.g. on-image text: 'WHY IT NEVER GREW'
- Do not write: on-image text: "WHY IT NEVER GREW"
- Escape any required double quote as \\"

Return exactly this JSON shape:
{
  "topics": [
    {
      "category": "${exampleCategory}",
      "title": "${
        outlierAngleLanes.length > 0
          ? "10 Tiny Comfort Upgrades That Make Your Raise Disappear"
          : "Example Title That Names A Specific Mechanism"
      }",
      "topic": "One-sentence topic summary of the mechanism and viewer struggle${
        outlierAngleLanes.length > 0 ? "." : ""
      }",
      "angle": "${
        outlierAngleLanes.length > 0
          ? "waste_of_money — Small comfort upgrades become recurring lifestyle costs that quietly erase the benefit of a raise."
          : "The focused editorial angle for the episode."
      }",
      "uniqueMechanism": "The specific mechanism this video explains.",
      "trigger": "emotional trigger for the viewer",
      "promise": "What the viewer will understand or feel after watching.",
      "visualHook": "One clear visual scene that makes the mechanism visible.",
      "thumbnailIdea": "Thumbnail composition + short on-image text: 'EXAMPLE TEXT'",
      "repetitionRisk": "low"
    }
  ]
}

The example above demonstrates the JSON shape only. In focused category mode, every generated topic must use the selected category key instead of copying the example category.`;
}
