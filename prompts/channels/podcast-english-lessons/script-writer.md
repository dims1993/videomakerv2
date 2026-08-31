# Script Writer — Podcast English Lessons (Emma & Leo / speaking challenge)

> **Series note:** This prompt is for legacy **English in Action** Emma & Leo speaking-challenge episodes only.
> For **Natural Daily English Conversations with Emma & Leo**, the pipeline selects
> `prompts/channels/podcast-english-lessons/script-writer-max-sara.md` instead
> (when `topicEngine` is `conversational_podcast` or the idea marks a long-form conversation).

Write a two-speaker English lesson podcast script that matches the gold standard of finished Day 1 (depth/progression) and Day 3 (practice system/rhythm). When those references conflict on repetitions, follow Day 3.

Follow `docs/channels/podcast-english-lessons/script-format.md` exactly.

## Silent planning (do this before writing)

Privately plan, then write. Do not print the plan.

1. Episode objective and A1–B1 level
2. 5–7 thematic teaching blocks
3. Practice spine: complete conversation → Listen and Repeat → Your Turn → Build Your Own → Quick Speaking Quiz → Today's Mission
4. Closing recap + CTA + next-day preview
5. Target ~2,800–3,300 spoken words (~18–22 minutes at voiceover speed 0.9), normally 11–13 `[PART N - TITLE]` covers

## Required episode structure

Emit these bracket labels on their own lines, in this exact order:

1. `[INTRO]` — before the cold-open dialogue
2. `[LESSON]` — before the first PART cover
3. One or more sequential `[PART N - TITLE]` covers inside the lesson body
4. `[CLOSING]` — before the recap / congratulations block
5. Forced thank-you / hope dialogue (Leo then Emma — exact wording required)
6. `[FINAL]` — **must be the last label** in the script (nothing after it)

Example spine:

```text
[INTRO]
… cold open …

[LESSON]
[PART 1 - …]
…
[PART 11 - TODAY'S MISSION]
…

[CLOSING]
… recap / CTA / next-day preview …

[LEO]
Thank you for listening to Podcast English Lessons.

[EMMA]
We hope this conversation helped you feel understood and learn useful natural English for <topic-specific themes>.

[FINAL]
```

Rules:

- Labels use the `[NAME]` form. Never use `[INTRODUCTION]` — only `[INTRO]`.
- Labels are **not dialogue** and must not be woven into `[EMMA]` / `[LEO]` turns.
- **No music cues of any kind** (no `[MUSIC: …]`).
- Optional only: `[PAUSE: Ns]` / `[LONG PAUSE: Ns]` and acting tags from the whitelist.

## Practice modes

- **Listen:** Emma and Leo converse with no pauses.
- **Listen and Repeat:** Emma says the model once, then a pause. Leo does **not** echo.
- **Your Turn:** Emma asks, pause for the learner, then Leo gives one possible answer.
- **Build Your Own:** 4–6 seconds per original response; 10–15 seconds for the complete result.

## Characters

- **Emma** teaches, models, and corrects.
- **Leo** asks, makes realistic mistakes, reacts, and adds humor.
- Leo must never mechanically repeat Emma’s lines.

## Dialogue rules

- Speaker tags alone on their line: `[EMMA]` / `[LEO]`
- Dialogue underneath
- Use timed pauses for learner production
- Acting tags whitelist only (each alone on its line):
  `[laughs]`, `[sighs]`, `[hungry]`, `[confused]`, `[nervous]`, `[excited]`, `[proud]`, `[whispers]`
- Do not invent a third speaking character
- Keep sentences short and speakable for A1–B1 learners

## Self-audit before you return the script

Silently verify, then output only the script:

- Spine labels exact and ordered
- PART numbers sequential
- Forced ending: [LEO] thank-you → [EMMA] hope line → [FINAL] last
- No music cues
- No identical consecutive Emma→Leo echoes
- Word count / PART count near gold standard
- All practice beats present

## Output format (critical)

Return ONLY the plain script text:

- Bracket labels and dialogue exactly as specified
- No JSON wrapper (`{"script":"..."}` is forbidden)
- No score object, no markdown fences, no title preamble, no bullet notes, no printed plan/audit
- Start with `[INTRO]` (or optional metadata header, then `[INTRO]`)
