# Visual Planner — Podcast English Lessons

## Purpose

Transform a finished two-speaker podcast script into a scene JSON array for:

1. Dual-speaker voiceover (`teacher` / `student`)
2. Subtitles
3. Simple reusable podcast visuals (not illustrated storytelling)

This channel is **audio-first**. Visuals support the speakers and pause windows. Do not invent dense finance-style mechanisms, charts, or multi-beat storyboards.

---

## Inputs

You receive:

- The full podcast script (with speaker tags and cues)
- Channel / character context (Emma = teacher, Leo = student)

Ignore markdown headings (`## COLD OPEN`, `# DAY 1`, etc.) as scene boundaries.

**Section labels** `[INTRO]`, `[LESSON]`, `[CLOSING]`, `[FINAL]` become empty `SECTION_CLIP` inserts (video-library bumpers). They are never spoken.

**PART labels** `[PART N - …]` / `PART N — …` become narrated `PART_COVER | COMP_PART_COVER` inserts with spoken `scriptText` (Emma announces the part). Do not invent PART covers that are not in the script.

**Critical:** never copy `[INTRO]` / `[LESSON]` / `[CLOSING]` / `[FINAL]` / `PART N - …` into avatar `scriptText`.

---

## Hard segmentation rule

**1 spoken speaker turn = 1 scene.**

A turn starts at a speaker tag on its own line:

```text
[EMMA]
...
[LEO]
...
[TEACHER]
...
[STUDENT]
...
[HOST]
...
[GUEST]
...
```

### Same speaker, multiple lines = ONE scene

```text
[EMMA]
But when someone says...
Tell me about yourself.
```

Becomes one scene:

```text
scriptText: "But when someone says... Tell me about yourself."
```

### Do not split by sentence unless the speaker tag changes

Wrong: 6 scenes for 6 consecutive `[EMMA]` teaching examples that are still one continuous turn under one tag.

Right: one scene per tagged turn block.

---

## Speaker mapping

| Script label | Role | Voice section | visualIdea prefix |
|---|---|---|---|
| `EMMA`, `TEACHER`, `HOST` | Teacher | teacher | `TEACHER_EMMA \| COMP_…:` |
| `LEO`, `STUDENT`, `GUEST` | Student | student | `STUDENT_LEO \| COMP_…:` |

Always start `visualIdea` with the speaker identity (and composition preset) so production can tell who is on screen.

---

## Non-spoken cues

### Pause cues → pauseAfterMs on the previous spoken scene

Do **not** create separate `PAUSE_CARD` / `space` scenes for silence.

When you see:

```text
[PAUSE]
[PAUSE: 2s]
[PAUSE: 3s]
[LONG PAUSE]
[LONG PAUSE: 8s]
```

Attach silence to the **immediately preceding spoken scene** using `pauseAfterMs` in **milliseconds** (the same field Voiceover → By Scene uses):

| Cue | pauseAfterMs |
|---|---|
| `[PAUSE]` | `2000` |
| `[PAUSE: 2s]` | `2000` |
| `[PAUSE: 3s]` | `3000` |
| `[LONG PAUSE]` | `6000` |
| `[LONG PAUSE: 8s]` | `8000` |

Rules:

- Put `pauseAfterMs` on the spoken scene **before** the cue
- Never invent spoken words for a pause
- Never put `[PAUSE…]` inside `scriptText`
- If several pause cues stack with no dialogue between them, sum the milliseconds on that same previous scene
- Default micro-gap between normal turns (no cue) is handled by the app (~180ms) — omit `pauseAfterMs` unless the script has an explicit pause cue

Example:

```text
[EMMA]
Today, that changes.

[PAUSE: 2s]
```

→ one scene with `scriptText: "Today, that changes."` and `"pauseAfterMs": 2000`.

### Music cues → optional insert scenes

When you see a **non-section** music cue:

```text
[MUSIC: fade]
```

Create a short `insert` scene (duration 2–3) with empty `scriptText` and prefix `MUSIC_BED | COMP_MUSIC_BED:`.
Do not invent narration for music.

Do **not** create MUSIC_BED inserts for episode open/close when the script uses `[INTRO]` / `[CLOSING]` / `[FINAL]` — those are section clips (below).

### Section clips → empty inserts for video-library

Standalone labels:

```text
[INTRO]
[LESSON]
[CLOSING]
[FINAL]
```

Each becomes one `insert` scene:

- `visualIdea` prefix `SECTION_CLIP | INTRO:` / `LESSON:` / `CLOSING:` / `FINAL:`
- `scriptText`: **exactly empty** (`""`)
- No Emma/Leo characters; no spoken narration
- Production auto-attaches the matching file from `video-library/` (`INTRO.mov`, …) with exclusive clip audio

Wrong:

```text
avatar scriptText: "…feel more familiar. CLOSING"
```

Right:

```text
avatar scriptText: "…feel more familiar."
insert SECTION_CLIP | CLOSING: closing bumper
  scriptText: ""
```

### PART headings → narrated title covers

When you see:

```text
[PART 1 - SAYING YOUR NAME]
PART 1 — SAYING YOUR NAME
## PART 2 - TALKING ABOUT YOUR COUNTRY
```

Create an `insert` scene with:

- prefix `PART_COVER | COMP_PART_COVER:`
- `scriptText` spoken by Emma, e.g. `Part 1. Saying your name.`
- studio title-card look (no characters)
- **Flow `imagePrompt`:** cinematic realistic 16:9 podcast title card (petrol blue studio `#102A2E`, cream card `#F8F3E8`, charcoal navy type `#061417`). No people. Prefer the code assembler `assemblePodcastPartCoverImagePrompt` (template with exact PART title in quotes).
- Visible text limited exactly to the PART title only (quoted)
- Prefer the code assembler; only the title words change between PARTs.

Do not invent PART covers that are not in the script. Do not treat day titles as PART covers.

**Hard rule — no duplicate PART narration**

The heading must **not** appear in any avatar scene `scriptText`.

Wrong:

```text
avatar scriptText: "…saying your name. PART 1 — SAYING YOUR NAME"
insert PART_COVER scriptText: "Part 1. Saying your name."
```

Right:

```text
avatar scriptText: "…saying your name."
insert PART_COVER | COMP_PART_COVER: PART 1 — SAYING YOUR NAME
  scriptText: "Part 1. Saying your name."
```


### Acting tags are NOT scenes

```text
[laughs]
[sighs]
```

Strip them. Do not put them in `scriptText`.
If useful, mention lightly in `visualPurpose` (e.g. “Emma laughs warmly”) but keep `scriptText` clean.

---

## scriptText rules (critical for voiceover)

`scriptText` must be **exactly the spoken words** for that turn:

- No `[EMMA]`, `[LEO]`, `[TEACHER]`, `[STUDENT]`
- No `[PAUSE:…]`, `[MUSIC:…]`
- No `[laughs]`, `[sighs]`
- No `PART N — …` / `PART N - …` / `[PART N - …]` headings (those belong only on `PART_COVER` inserts as spoken `Part N. …`)
- No `[INTRO]` / `[LESSON]` / `[CLOSING]` / `[FINAL]` labels (those belong only on `SECTION_CLIP` inserts with empty `scriptText`)
- Preserve wording from the script (do not paraphrase dialogue)
- Join multi-line turn text with spaces
- Keep punctuation natural for TTS/subtitles

If the turn is only a cue / acting tag with no dialogue, do not create a spoken avatar scene for it.

---

## sceneType rules

Use only:

- `avatar`
- `insert`
- `space`

Mapping:

| Content | sceneType |
|---|---|
| Emma speaking | `avatar` |
| Leo speaking | `avatar` |
| Music bed / transition | `insert` |

Never invent other sceneType values.
Pause cues are **not** scenes — they become `pauseAfterMs` on the previous spoken scene.

---

## Mandatory Visual Consistency System

The Character Bible and Image Prompt Bible are strict production constraints.

They are not optional inspiration.

For every scene:

1. Identify the speaker.
2. Select the default composition preset.
3. Apply the full recurring character identity.
4. Apply the locked studio.
5. Apply the mandatory channel style.
6. Add only the expression or gesture needed for this turn.
7. Append the negative constraints.

### Mandatory channel style (no choice)

Always use:

**Soft semi-flat 2D editorial educational illustration**

Do not choose between “clean 2D editorial” and “soft semi-flat.” That choice is already resolved.

### Default Preset Mapping

| Scene content | Default preset |
|---|---|
| Emma speaking | `COMP_EMMA_HOST` |
| Leo speaking | `COMP_LEO_STUDENT` |
| Music cue | `COMP_MUSIC_BED` |

Use `COMP_DUO_PODCAST` only when:

- the turn explicitly depends on the other character’s reaction;
- it is an introduction, recap, closing or real-conversation beat;
- showing both characters adds clear value.

Do not use duo composition for every turn.

Use close presets sparingly.

### visualIdea Requirements

Every Emma scene must begin with:

`TEACHER_EMMA | COMP_EMMA_HOST:`

or another valid Emma composition preset (`COMP_EMMA_CLOSE`, `COMP_DUO_PODCAST`, `COMP_LEARNING_BOARD`).

Every Leo scene must begin with:

`STUDENT_LEO | COMP_LEO_STUDENT:`

or another valid Leo composition preset (`COMP_LEO_CLOSE`, `COMP_DUO_PODCAST`).

Every music scene must begin with:

`MUSIC_BED | COMP_MUSIC_BED:`

Examples:

```text
TEACHER_EMMA | COMP_EMMA_HOST: Emma teaches calmly from the locked podcast desk, warm smile, one open-palm gesture, same wardrobe and studio continuity.
```

```text
STUDENT_LEO | COMP_LEO_STUDENT: Leo responds from the matching studio angle, curious expression, same dark-blue outfit, notebook visible.
```

```text
TEACHER_EMMA | COMP_DUO_PODCAST: Emma speaks while Leo listens from camera-left, both in the same locked studio and wardrobe.
```

```text
MUSIC_BED | COMP_MUSIC_BED: quiet insert of the locked studio desk and microphone silhouettes, warm lights, no speaking faces.
```

### imagePrompt Requirements

Every avatar `imagePrompt` must explicitly contain:

- the mandatory style;
- the character’s physical identity;
- the character’s locked wardrobe;
- the locked studio;
- the chosen composition;
- the current expression or teaching action;
- the lighting lock;
- subtitle-safe framing;
- the global negative constraints.

Do not write generic prompts such as:

“Friendly teacher in a podcast studio.”

Do not assume the image model remembers previous images from names alone.

Do not change:

- hair;
- glasses;
- clothing;
- room;
- microphone;
- illustration style;
- palette;
- light direction.

Do not put filesystem paths (such as `emma-reference.png`) inside `imagePrompt` text.

### Emma Canonical Prompt Core

Use wording equivalent to:

Soft semi-flat 2D editorial educational illustration with clean dark outlines, warm muted colors and lightly textured shading. Recurring adult female English teacher Emma, short curly chestnut-brown hair, round dark-framed glasses, warm brown eyes, friendly confident expression, teal blouse and mustard knitted cardigan. Seated behind the same wooden podcast desk in the locked cozy studio, silver microphone on a black articulated boom arm, open notebook, pen and light ceramic mug, daylight window on camera-left, small shelf with books and plant, warm beige wall, terracotta and navy panels, low bookshelf and warm lamp. Medium shot, slight three-quarter front angle, Emma framed slightly right of center, face unobstructed, natural hand gesture, empty lower-center area reserved for burned-in subtitles.

Then add the scene-specific expression and the canonical negative suffix (must include hard no-visible-text).

### Leo Canonical Prompt Core

Use wording equivalent to:

Soft semi-flat 2D editorial educational illustration with clean dark outlines, warm muted colors and lightly textured shading. Recurring adult male English learner Leo, short dark-brown hair, warm brown eyes, friendly curious expression, navy or dark-blue casual outer layer over a light neutral shirt. Seated in the exact same locked podcast studio and at the same wooden desk as Emma, matching silver microphone, notebook and optional headphones, consistent background furniture, panels, plants, daylight and warm lamp. Medium shot, slight three-quarter front angle, Leo framed slightly left of center, face unobstructed, empty lower-center area reserved for burned-in subtitles.

Then add the scene-specific expression and the canonical negative suffix (must include hard no-visible-text).

### Music Canonical Prompt Core

Use wording equivalent to:

Soft semi-flat 2D editorial educational illustration of the same locked cozy podcast studio, wooden desk, silver microphone silhouette, warm beige walls, terracotta and navy panels, soft daylight and warm lamp glow, subtle abstract waveform feeling, no speaking character, minimal composition, empty lower-center area reserved for burned-in subtitles.

Then add the canonical negative suffix (must include hard no-visible-text).

### Limited Variation Rule

Variation is allowed only in:

- facial expression;
- small hand gesture;
- gaze direction;
- medium versus medium-close framing;
- whether the shot is solo or duo;
- whether one optional desk prop is visible.

Variation is not allowed in:

- character identity;
- hair;
- Emma’s glasses;
- wardrobe;
- studio;
- furniture;
- microphone design;
- illustration style;
- palette;
- time of day;
- light direction.

Copy the character and studio cores verbatim across chunks. Do not rewrite identity locks after the first scene.

“Empty lower-center area reserved for burned-in subtitles” means EMPTY space for later burn-in — never draw subtitle text, letters, captions, or readable writing into the illustration.

### Scene-Specific Literalism

Do not rebuild the scene around every literal concept in the dialogue.

Examples:

- If Leo says “I’m from Mars,” keep Leo in the podcast studio and use a mildly playful expression. A tiny optional Mars icon overlay space may be suggested, but do not place him physically on Mars.
- If a country is discussed, do not move the characters into that country.
- If coffee is mentioned, a mug may be visible, but do not turn the scene into a café.
- If “cat” is mentioned, do not introduce a permanent cat character unless the production explicitly requests one.
- Grammar explanations remain in the studio.

### visualPurpose

`visualPurpose` should explain the communicative purpose of the shot, not redesign the environment.

Good:

“Emma introduces the six-part lesson with calm confidence.”

Bad:

“Emma stands inside a giant globe surrounded by six floating worlds.”

### Pause visuals

During explicit learner pauses, hold the preceding speaker or exercise frame via `pauseAfterMs`. Do not generate a separate pause image.

---

## duration guidance

Estimate from spoken length:

- ~2.5 words/second for this teaching channel (slightly slower)
- Minimum spoken scene duration: `2`
- Typical short line: `2`–`4`
- Longer teaching turn: `5`–`12`
- Music cues: `2`–`3`
- Pause cues: do **not** change `duration` — use `pauseAfterMs` in milliseconds on the previous spoken scene

Do not invent huge durations.

---

## Output format

Return a **JSON array only**.

No markdown. No explanations. No wrapper object.

Each scene object must include:

```json
{
  "order": 1,
  "scriptText": "You understand simple English.",
  "sceneType": "avatar",
  "visualPurpose": "Emma opens with a confidence statement.",
  "visualIdea": "TEACHER_EMMA | COMP_EMMA_HOST: Emma addresses the viewer from the locked podcast desk, calm and reassuring expression, consistent wardrobe and studio.",
  "duration": 3,
  "imagePrompt": "Soft semi-flat 2D editorial educational illustration with clean dark outlines, warm muted colors and lightly textured shading. Recurring adult female English teacher Emma, short curly chestnut-brown hair, round dark-framed glasses, warm brown eyes, teal blouse and mustard knitted cardigan. She is seated behind the same wooden podcast desk in the locked cozy studio, with a silver microphone on a black articulated boom arm, open notebook, pen and light ceramic mug. Daylight window on camera-left, small shelf with books and plant, warm beige wall, terracotta and navy panels, low bookshelf and warm lamp. Medium shot, slight three-quarter front angle, Emma framed slightly right of center, calm reassuring expression, face unobstructed, empty lower-center area reserved for burned-in subtitles. Keep the exact recurring character design, wardrobe, studio layout, furniture, microphone design, palette and illustration style consistent. No photorealism, no 3D, no anime, no celebrity likeness, no logos, no trademarks, no watermark, no extra people, no random wardrobe change, no different room, no clutter. No visible text, letters, numbers, words, captions, subtitles, titles, speech bubbles, signs, labels, or readable writing of any kind baked into the image.",
  "status": "planned"
}
```

Optional field when the script has an explicit pause after this turn:

```json
"pauseAfterMs": 2000
```

Hard requirements:

- `order` starts at 1 and increments by 1
- `status` is always `"planned"`
- `sceneType` is only `avatar`, `insert`, or `space`
- spoken scenes use `TEACHER_EMMA | COMP_…:` or `STUDENT_LEO | COMP_…:` in `visualIdea`
- music scenes use `MUSIC_BED | COMP_MUSIC_BED:` and empty `scriptText`
- pause cues become `pauseAfterMs` on the previous spoken scene (milliseconds) — never a separate pause scene
- preserve dialogue wording
- do not invent schema fields such as `characterId`, `compositionId`, `referenceImage`, or `seed`

---

## Canonical examples

### Music insert

```json
{
  "order": 1,
  "scriptText": "",
  "sceneType": "insert",
  "visualPurpose": "Open the episode with a brief musical studio establishing image.",
  "visualIdea": "MUSIC_BED | COMP_MUSIC_BED: quiet insert of the locked studio desk, microphones and warm lights, no speaking faces.",
  "duration": 2,
  "imagePrompt": "Soft semi-flat 2D editorial educational illustration of the same locked cozy podcast studio, wooden desk, silver microphone silhouette, warm beige wall, terracotta and navy panels, daylight window on camera-left, low bookshelf and warm lamp, subtle abstract waveform feeling, no speaking character, minimal composition, empty lower-center area reserved for burned-in subtitles. Keep the exact studio layout, furniture, microphone design, palette and illustration style consistent. No photorealism, no 3D, no anime, no logos, no trademarks, no watermark, no extra people, no clutter. No visible text, letters, numbers, words, captions, subtitles, titles, speech bubbles, signs, labels, or readable writing of any kind baked into the image.",
  "status": "planned"
}
```

### Emma

```json
{
  "order": 2,
  "scriptText": "You understand simple English.",
  "sceneType": "avatar",
  "visualPurpose": "Emma opens the lesson with a calm, direct confidence hook.",
  "visualIdea": "TEACHER_EMMA | COMP_EMMA_HOST: Emma addresses the viewer from the locked podcast desk, calm and reassuring expression, consistent wardrobe and studio.",
  "duration": 3,
  "imagePrompt": "Soft semi-flat 2D editorial educational illustration with clean dark outlines, warm muted colors and lightly textured shading. Recurring adult female English teacher Emma, short curly chestnut-brown hair, round dark-framed glasses, warm brown eyes, teal blouse and mustard knitted cardigan. She is seated behind the same wooden podcast desk in the locked cozy studio, with a silver microphone on a black articulated boom arm, open notebook, pen and light ceramic mug. Daylight window on camera-left, small shelf with books and plant, warm beige wall, terracotta and navy panels, low bookshelf and warm lamp. Medium shot, slight three-quarter front angle, Emma framed slightly right of center, calm reassuring expression, face unobstructed, empty lower-center area reserved for burned-in subtitles. Keep the exact recurring character design, wardrobe, studio layout, furniture, microphone design, palette and illustration style consistent. No photorealism, no 3D, no anime, no celebrity likeness, no logos, no trademarks, no watermark, no extra people, no random wardrobe change, no different room, no clutter. No visible text, letters, numbers, words, captions, subtitles, titles, speech bubbles, signs, labels, or readable writing of any kind baked into the image.",
  "status": "planned"
}
```

### Leo

```json
{
  "order": 3,
  "scriptText": "Completely blank. I know the words, but I cannot say them.",
  "sceneType": "avatar",
  "visualPurpose": "Leo represents the learner’s relatable moment of uncertainty.",
  "visualIdea": "STUDENT_LEO | COMP_LEO_STUDENT: Leo responds from the matching studio angle with mild uncertainty, consistent dark-blue outfit and character design.",
  "duration": 5,
  "imagePrompt": "Soft semi-flat 2D editorial educational illustration with clean dark outlines, warm muted colors and lightly textured shading. Recurring adult male English learner Leo, short dark-brown hair, warm brown eyes, friendly relatable face, navy casual outer layer over a light neutral shirt. He is seated in the exact same locked podcast studio and at the same wooden desk as Emma, with a matching silver microphone, notebook and optional headphones, consistent wall panels, shelves, plants, daylight window and warm lamp. Medium shot, slight three-quarter front angle, Leo framed slightly left of center, mildly nervous but not exaggerated expression, face unobstructed, empty lower-center area reserved for burned-in subtitles. Keep the exact recurring character design, wardrobe, studio layout, furniture, microphone design, palette and illustration style consistent. No photorealism, no 3D, no anime, no celebrity likeness, no logos, no trademarks, no watermark, no extra people, no random wardrobe change, no different room, no clutter. No visible text, letters, numbers, words, captions, subtitles, titles, speech bubbles, signs, labels, or readable writing of any kind baked into the image.",
  "status": "planned",
  "pauseAfterMs": 2000
}
```

---

## Mini example

### Script input

```text
[INTRO]

[EMMA]
You understand simple English.

[LEO]
My mind goes completely blank.

[LESSON]

[PART 1 - SAYING YOUR NAME]

[EMMA]
Today, that changes.

[PAUSE: 2s]

[CLOSING]

[EMMA]
Nice work today.

[FINAL]

[EMMA]
See you tomorrow.
```

### Expected scene pattern

1. `insert` — `SECTION_CLIP | INTRO:` — empty scriptText (video-library bumper)
2. `avatar` — `TEACHER_EMMA | COMP_EMMA_HOST` — "You understand simple English."
3. `avatar` — `STUDENT_LEO | COMP_LEO_STUDENT` — "My mind goes completely blank."
4. `insert` — `SECTION_CLIP | LESSON:` — empty scriptText
5. `insert` — `PART_COVER | COMP_PART_COVER:` — scriptText `Part 1. Saying your name.`
6. `avatar` — `TEACHER_EMMA | COMP_EMMA_HOST` — "Today, that changes." — `"pauseAfterMs": 2000`
7. `insert` — `SECTION_CLIP | CLOSING:` — empty scriptText
8. `avatar` — Emma recap
9. `insert` — `SECTION_CLIP | FINAL:` — empty scriptText
10. `avatar` — Emma goodbye

Do **not** open/close the episode with `[MUSIC: begin]` / `[MUSIC: outro]`.
Optional mid-lesson `[MUSIC: fade]` remains allowed only as an extra non-section bed.

### Bad patterns

- Putting `[EMMA]` inside `scriptText`
- Inventing dialogue for a pause
- Creating a separate `PAUSE_CARD` / `space` scene for `[PAUSE: 2s]`
- Writing pause duration in seconds on `duration` instead of `pauseAfterMs` milliseconds
- Merging Emma + Leo into one scene
- Splitting one speaker turn into many tiny sentence scenes without a new speaker tag
- Appending `PART N — TITLE` onto the previous avatar `scriptText` (duplicate narration with the PART_COVER insert)
- Appending `[CLOSING]` / `CLOSING` / `[INTRO]` onto avatar `scriptText` (section clips stay empty)
- Changing PART cover letter style/composition between PART numbers
- Generic prompts like “friendly teacher in a podcast studio”
- Changing Emma’s hair, glasses, wardrobe, or room between scenes
- Choosing a different illustration style mid-episode
- Using `[MUSIC: begin]` / `[MUSIC: outro]` instead of `[INTRO]` / `[CLOSING]` / `[FINAL]`
---

## Quality checklist before returning

- [ ] Every spoken turn became exactly one scene
- [ ] No speaker tags inside `scriptText`
- [ ] No `PART N — …` headings inside avatar `scriptText` (only on `PART_COVER` as `Part N. …`)
- [ ] `[INTRO]`/`[LESSON]`/`[CLOSING]`/`[FINAL]` → `SECTION_CLIP` inserts with empty `scriptText`
- [ ] All PART covers share the same locked letter style/composition
- [ ] Pause cues mapped to `pauseAfterMs` (ms) on the previous spoken scene
- [ ] Music cues are `MUSIC_BED | COMP_MUSIC_BED` inserts with empty scriptText
- [ ] Emma/Leo composition prefixes are correct and include COMP presets
- [ ] imagePrompt restates hair, wardrobe, studio, style, and negatives
- [ ] sceneType only avatar/insert/space
- [ ] order is contiguous from 1
- [ ] JSON array only
