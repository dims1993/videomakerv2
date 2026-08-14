# Metadata Writer

## 1. Purpose

The Metadata Writer converts a finished video concept and script into a complete YouTube publishing package.

It should generate:

```text
TITLE OPTIONS
THUMBNAIL TEXT OPTIONS
DESCRIPTION
CHAPTERS
KEYWORDS / TAGS
HASHTAGS
PINNED COMMENT
OPTIONAL COMMUNITY POST HOOK
```

This module is designed to match the **content positioning** visible in the supplied scripts:

```text
practical psychology
behavior change
self-discipline
focus
procrastination
attention
habits
simple science-backed actions
low-complexity productivity
```

Important limitation:

The supplied source material contains transcripts, not the channel's real YouTube titles, descriptions, tags, thumbnails, CTR data, search traffic, or analytics.

Therefore:

- topic positioning can be inferred with reasonable confidence;
- exact title syntax cannot yet be claimed as source-derived;
- exact description structure cannot yet be claimed as source-derived;
- thumbnail wording cannot yet be claimed as source-derived;
- SEO strategy is a production recommendation until real metadata samples are analyzed.

When real channel metadata becomes available, recalibrate this file.

---

# 2. Channel metadata positioning

Every metadata package should make the video feel:

```text
practical
specific
easy to understand
behavior-focused
useful immediately
psychology-informed
not overly complicated
```

Avoid positioning the content as:

```text
extreme self-help
hustle culture
biohacking
guru motivation
life transformation overnight
hyper-technical neuroscience
```

The recurring promise should resemble:

> Simple behaviors that make difficult things easier to start, continue or repeat.

---

# 3. Metadata hierarchy

The publishing package should be built in this order:

```text
1. CORE VIEWER PROBLEM
2. CORE OUTCOME
3. VIDEO MECHANISM
4. TITLE
5. THUMBNAIL
6. DESCRIPTION
7. CHAPTERS
8. SEARCH TERMS
9. PINNED COMMENT
```

Do not begin by generating random SEO keywords.

The metadata should reflect the actual promise of the script.

---

# 4. Required input

Use:

```yaml
video_topic:
core_problem:
core_outcome:
number_of_items:
primary_mechanism:
audience:
main_examples:
script:
video_length:
channel_name:
cta:
```

Optional:

```yaml
target_keyword:
competitor_titles:
existing_channel_titles:
thumbnail_visual:
published_video_url:
```

---

# 5. Core metadata thesis

Before writing metadata, compress the video into:

```text
VIEWER HAS:
[problem]

VIEWER WANTS:
[outcome]

VIDEO GIVES:
[specific practical mechanism]
```

Example:

```text
VIEWER HAS:
procrastination and weak focus

VIEWER WANTS:
to start and stay with difficult tasks

VIDEO GIVES:
33 small behavioral habits that train starting, focus and discomfort tolerance
```

This becomes the metadata anchor.

---

# 6. Title Writer

## Objective

The title must create:

```text
recognition
+
specific promise
+
curiosity
```

without becoming sensational or vague.

---

## 7. Title families

Generate titles from multiple families rather than one formula.

### T1 — Number + Outcome

```text
33 Habits That Make Hard Things Easier to Do
7 Morning Habits That Make Discipline Feel Easier
10 Small Habits That Improve Focus
```

Best when:
- video is list-based;
- item count is a meaningful selling point.

---

### T2 — Train Your Brain

```text
How to Train Your Brain to Do Hard Things
Train Your Brain to Stop Procrastinating
How to Train Your Brain to Focus Longer
```

Best when:
- the script repeatedly explains learned behavioral patterns;
- neuroscience/psychology framing is central.

---

### T3 — Stop / Start Contrast

```text
Stop Waiting for Motivation — Do This Instead
Stop Fighting Distraction Like This
Stop Making Hard Tasks Harder Than They Need to Be
```

Best when:
- video contains a strong misconception reversal.

---

### T4 — Behavior Becomes Automatic

```text
7 Habits That Make Better Decisions Feel Automatic
How to Make Focus Feel More Automatic
Small Habits That Make Self-Discipline Easier
```

Best when:
- identity / repetition / automaticity is central.

---

### T5 — Specific Situation

```text
7 Morning Habits That Quietly Train Your Brain
What to Do When You Don't Feel Like Working
How to Start When Your Brain Wants to Avoid the Task
```

Best when:
- video begins with a familiar moment;
- context itself is clickable.

---

### T6 — Hidden / Subtle Mechanism

```text
7 Subtle Habits That Quietly Improve Self-Discipline
The Small Behaviors Training Your Brain to Procrastinate
Why Hard Things Keep Feeling Hard
```

Best when:
- the video reveals an invisible behavioral loop.

Use carefully. Avoid artificial mystery.

---

# 8. Title rules

### Prefer

- one main benefit;
- one main problem;
- plain English;
- concrete verbs;
- strong nouns;
- natural spoken phrasing.

### Avoid

```text
You Won't Believe...
This Changes EVERYTHING
Secret Hack
INSANE
99% of People...
Become Unstoppable
Rewire Your Brain Overnight
```

unless verified as actual channel language later.

---

# 9. Title length

Working target:

```text
45–70 characters
```

This is a practical range, not a hard rule.

The strongest idea should appear early.

Bad:

```text
Some Interesting Ideas About How You Can Potentially Improve Your Ability to Focus
```

Better:

```text
10 Small Habits That Improve Focus
```

---

# 10. Title keyword placement

If a target term matters, place it naturally in the title.

Common semantic groups for this channel:

```text
procrastination
self-discipline
focus
habits
motivation
attention
productivity
morning habits
hard things
distraction
brain
behavior
```

Do not stack synonyms mechanically.

Bad:

```text
Focus Productivity Discipline Motivation Habits
```

---

# 11. Title generation protocol

Generate:

```text
3 SAFE titles
3 CURIOSITY titles
3 SEARCH-LED titles
3 OUTCOME-LED titles
```

Then rank the top 5.

For each finalist output:

```yaml
title:
family:
primary_hook:
primary_keyword:
why_it_works:
risk:
```

---

# 12. Thumbnail Text Writer

## Objective

Thumbnail text should complement the title, not repeat it.

If title says:

```text
33 Habits That Make Hard Things Easier
```

avoid thumbnail:

```text
33 HABITS
```

Prefer a second piece of information:

```text
START ANYWAY
```

---

# 13. Thumbnail text rules

Recommended:

```text
1–5 words
```

Prefer:

- verbs;
- contrast;
- emotional recognition;
- very simple language.

Examples:

```text
DO IT ANYWAY
START BEFORE MOTIVATION
STOP ESCAPING
ONE TASK
MAKE IT EASIER
PROGRESS FIRST
DON'T TOUCH YOUR PHONE
YOUR FIRST THOUGHT
START SMALL
10 MINUTES
```

---

# 14. Thumbnail text families

### TH1 — Command

```text
START ANYWAY
MOVE THE PHONE
DO THIS FIRST
```

### TH2 — Contrast

```text
EFFORT → REWARD
NOT MOTIVATION
PROGRESS FIRST
```

### TH3 — Recognition

```text
YOUR BRAIN DOES THIS
THE ESCAPE LOOP
WHY YOU QUIT
```

### TH4 — Simple mechanism

```text
START SMALL
ONE TASK
10 MINUTES
```

---

# 15. Title + Thumbnail Pairing

Judge the pair, not each element alone.

Example:

```text
TITLE:
How to Train Your Brain to Do Hard Things

THUMBNAIL:
START ANYWAY
```

Good because:
- title explains topic;
- thumbnail gives emotional/behavioral hook.

Another:

```text
TITLE:
7 Morning Habits That Quietly Train Your Brain

THUMBNAIL:
YOUR FIRST THOUGHT
```

---

# 16. Description Writer

## Objective

The description should:

```text
confirm the promise
summarize useful value
include natural search language
make navigation easy
support CTA
```

Do not write a keyword dump.

---

# 17. Description structure

## Block 1 — Two-line value proposition

The first lines should clearly state:

```text
what problem the video addresses
+
what the viewer will learn
```

Template:

```text
If you keep procrastinating, losing focus or waiting to feel motivated, this video breaks down [N] practical habits that make difficult tasks easier to start and easier to continue.

You'll learn how to [benefit 1], [benefit 2], [benefit 3] and [benefit 4] without relying on extreme willpower or complicated productivity systems.
```

---

## Block 2 — What is covered

Use a natural summary.

Example:

```text
We cover practical ideas for reducing phone distraction, making the first action obvious, using short focus blocks, handling the urge to quit, planning difficult tasks, protecting sleep and building consistency gradually.
```

---

## Block 3 — Chapters

Insert timestamped chapters when available.

---

## Block 4 — Channel positioning

Example:

```text
Simple Ways of Life shares practical, psychology-informed ideas for improving focus, habits, self-discipline and everyday decision-making without turning life into an overly complicated productivity system.
```

Adapt channel name as needed.

---

## Block 5 — CTA

Keep concise:

```text
If this was useful, subscribe for more practical videos about focus, habits and behavior change.
```

---

## Block 6 — Disclaimer / sources

If the script contains research claims, optionally include:

```text
Educational content only. Research references used in the video can be listed below.
```

Then include actual sources only if they were genuinely used and verified.

Never invent citations.

---

# 18. Description template

```markdown
If you struggle with [PROBLEM], this video breaks down [NUMBER/FORMAT] practical ways to [OUTCOME].

You'll learn how to [BENEFIT 1], [BENEFIT 2], [BENEFIT 3], and [BENEFIT 4] without relying on [EXTREME / COMMON BAD APPROACH].

In this video:
- [TOPIC 1]
- [TOPIC 2]
- [TOPIC 3]
- [TOPIC 4]
- [TOPIC 5]

## Chapters
[CHAPTERS]

[CHANNEL POSITIONING]

If this video helped, subscribe for more practical videos about [CORE CONTENT PILLARS].

#habits #focus #selfdiscipline
```

---

# 19. Chapter Writer

## Chapter principles

Chapter titles should be:

```text
short
behavioral
easy to scan
consistent
```

Prefer the actual habit title.

Example:

```text
00:00 Why hard things feel harder
01:14 Stop asking whether you feel like it
02:36 Make the first action obvious
04:02 Train starting first
05:17 Use the 10-minute entry
```

Avoid:

```text
Chapter 1
Chapter 2
Part Three
```

unless section names are shown elsewhere.

---

# 20. Chapter formatting

Standard:

```text
00:00 Introduction
01:12 Habit 1 — [Title]
03:05 Habit 2 — [Title]
...
```

For very long list videos, shorter labels improve scanability.

Example:

```text
01:12 Stop waiting for motivation
02:31 Define the first action
03:48 Train starting
```

---

# 21. Keyword Writer

Keywords should be separated into three layers.

### Layer A — Core topic

```text
self discipline
procrastination
focus
habits
motivation
attention
```

### Layer B — Viewer problem

```text
how to stop procrastinating
how to focus
how to be disciplined
how to stop checking phone
how to start hard tasks
```

### Layer C — Video-specific mechanism

```text
10 minute rule
one task focus
implementation intentions
morning habits
instant gratification
distraction management
```

---

# 22. Tag rules

If tags are used, prioritize relevance over volume.

Generate approximately:

```text
8–20 relevant tags
```

Do not create hundreds of variants.

Avoid repeated keyword permutations like:

```text
focus
focus better
better focus
how focus
focus tips
tips focus
```

---

# 23. Hashtag Writer

Use a small set.

Recommended:

```text
2–3 hashtags
```

Example:

```text
#SelfDiscipline
#Focus
#Habits
```

or:

```text
#Procrastination
#Productivity
#Habits
```

Choose based on the actual video's main topic.

---

# 24. Pinned Comment Writer

The pinned comment should create action or conversation.

Do not merely say:

```text
Thanks for watching!
```

Better:

```text
Which habit are you going to try first?
```

Even better, tie it to the video's mechanism:

```text
Pick one thing you've been avoiding. What's the first physical action you can take in the next 10 minutes?
```

---

# 25. Pinned comment formats

### PC1 — Implementation

```text
Don't try all of these at once. Pick one. Which habit are you testing today?
```

### PC2 — Specific action

```text
What's one hard thing you've been avoiding — and what's the smallest first action?
```

### PC3 — Viewer research

```text
What usually breaks your focus first: your phone, boredom, unclear tasks, or low energy?
```

Useful because replies can inform future scripts.

### PC4 — Experiment

```text
Try one habit for seven days and come back to tell us what changed.
```

---

# 26. Community Post Hook

Optional.

Use when repurposing the video.

Template:

```text
Most people try to fix [problem] with [common approach].

A better place to start:
[simple reframe]

New video: [title]
```

Or ask:

```text
Which one makes you procrastinate most?
A) unclear task
B) phone
C) boredom
D) waiting for motivation
```

---

# 27. Metadata package output

The Metadata Writer should return:

```markdown
# METADATA PACKAGE

## VIDEO POSITIONING
Core problem:
Core outcome:
Primary mechanism:
Primary viewer:

## TITLE OPTIONS
1.
2.
3.
4.
5.

## RECOMMENDED TITLE
[title]

Reason:
[short explanation]

## THUMBNAIL TEXT OPTIONS
1.
2.
3.
4.
5.

## RECOMMENDED TITLE + THUMBNAIL PAIR
Title:
Thumbnail:

## DESCRIPTION
[complete description]

## CHAPTERS
[timestamps]

## KEYWORDS
[keyword list]

## TAGS
[tag list]

## HASHTAGS
[2–3]

## PINNED COMMENT
[comment]

## OPTIONAL COMMUNITY POST
[post]
```

---

# 28. Metadata scoring system

Score each title from 1–10.

### Clarity
Does the viewer immediately understand the topic?

### Relevance
Does it accurately represent the script?

### Specificity
Is there a concrete outcome, number, mechanism or situation?

### Curiosity
Is there a reason to click beyond simple description?

### Naturalness
Does it sound like something a human would say?

### Thumbnail synergy
Does it leave room for the thumbnail to add information?

Total:

```text
/60
```

Reject titles under:

```text
45/60
```

unless there is a strategic reason.

---

# 29. Anti-clickbait QA

Before finalizing metadata ask:

- [ ] Does the title accurately match the video?
- [ ] Is the promised result actually discussed?
- [ ] Is "brain" language justified by the script?
- [ ] Are scientific claims appropriately cautious?
- [ ] Does the thumbnail add rather than repeat?
- [ ] Is there only one primary promise?
- [ ] Is the title understandable without insider jargon?
- [ ] Does the description summarize the real content?
- [ ] Are chapters based on actual timing?
- [ ] Are keywords natural and relevant?
- [ ] Are no research citations invented?

---

# 30. Recommended title logic for this content system

For this channel style, prioritize title concepts in this order:

```text
1. recognizable problem
2. practical outcome
3. number / format
4. brain / behavior mechanism
5. curiosity
```

A useful title should usually answer at least two of these:

```text
What problem is this about?
What will improve?
Why is this approach different?
How much value is inside?
```

---

# 31. Example metadata package — Hard Things

## Positioning

```text
Problem:
procrastination, distraction and resistance

Outcome:
start and continue difficult tasks more reliably

Mechanism:
small repeated behavioral habits
```

## Title options

```text
33 Habits That Make Hard Things Easier to Do
How to Train Your Brain to Do Hard Things
33 Small Habits That Build Self-Discipline
Stop Waiting for Motivation: 33 Better Habits
How to Stop Avoiding Hard Things
```

## Thumbnail options

```text
START ANYWAY
DO THE HARD THING
NOT MOTIVATION
STOP ESCAPING
10 MINUTES
```

## Strong pair

```text
TITLE:
How to Train Your Brain to Do Hard Things

THUMBNAIL:
START ANYWAY
```

---

# 32. Example metadata package — Morning Habits

## Positioning

```text
Problem:
starting the morning reactively

Outcome:
better decisions, attention and consistency

Mechanism:
seven subtle morning behaviors that shape what the brain learns
```

## Title options

```text
7 Morning Habits That Quietly Train Your Brain
7 Subtle Morning Habits That Make Discipline Easier
Do These 7 Things Before Your Day Takes Over
7 Morning Habits for Better Focus and Self-Discipline
How to Train Your Brain Before 8 AM
```

## Thumbnail options

```text
YOUR FIRST THOUGHT
BEFORE YOUR PHONE
START HERE
WIN BEFORE 8
DON'T REACT FIRST
```

## Strong pair

```text
TITLE:
7 Morning Habits That Quietly Train Your Brain

THUMBNAIL:
BEFORE YOUR PHONE
```

---

# 33. Calibration protocol

Once real metadata from the target channel is available, collect at least:

```text
20–30 video titles
10–20 descriptions
20+ thumbnails
view counts
publish dates
video lengths
```

Then update:

```text
title length distribution
most common title structures
word frequency
number usage
capitalization
question usage
thumbnail word count
title-thumbnail overlap
recurring SEO terms
description template
chapter format
CTA style
```

At that point, this Metadata Writer can move from:

```text
channel-compatible
```

to:

```text
channel-calibrated
```

---

# 34. Final metadata command

When using this system, provide:

```text
Create the complete YouTube metadata package for this script.

Use the Metadata Writer rules.
Generate 12 title candidates across at least four title families.
Rank the best five.
Choose one recommended title.
Generate five thumbnail text options and select the best title-thumbnail pair.
Write the full description.
Create chapters only if timestamps are available.
Generate a focused keyword/tag set.
Write one pinned comment that encourages implementation.
Do not invent scientific references or timestamps.
Keep all claims faithful to the script.
```
