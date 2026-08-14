# THE BIBLE IN ONE YEAR — VISUAL PLAN RULES

This request uses the **compact-flow Bible in One Year format only**.

## FORMAT PRIORITY RULE

Ignore marker systems from other formats unless those markers actually appear in the provided script.

Do not invent `[CHAPTER N - TITLE]`, `[FINAL — TITLE]`, silent covers, or scenes not grounded in spoken lines.

Priority order (higher wins on conflict):

1. JSON validity and importer compatibility
2. Exact spoken script coverage
3. No silent / empty `scriptText` scenes
4. Correct section and chapter-cover behavior
5. Allowed scene schema and `sceneType` values
6. Visual-first storytelling, text-by-sceneType limits, and visual quality

Conflict clarifications:

- Cover / progress title text is an intentional exception to Visual-First for designated insert scenes only.
- `visualIdea` prefix `Chapter cover:` is a schema label. It does **not** mean `imagePrompt` should say “card”.
- Prefer image-first language in `imagePrompt` even when `visualIdea` uses `Chapter cover:`.

## JSON AND IMPORTER COMPATIBILITY RULES

Return a strict valid JSON array only. No markdown, no explanations, no wrapper object, no trailing commas.

### Hard quote rule

1. Never put raw unescaped straight double quotes inside any JSON string.
2. In `scriptText`, never use backslash-escaped quotes like `\"`.
3. If the spoken script contains straight double quotes, encode each one as `\u0022`.
4. After `JSON.parse`, those `\u0022` sequences must become normal quotation marks in spoken text.
5. Curly quotes (“ ”) may remain only when they already appear in the source spoken script (common in WEBUS).
6. Do not add new quotation marks of any kind in `imagePrompt`, `visualIdea`, or `visualPurpose`.

Example source line:

```text
To mark your progress, comment "Day 1 complete" below.
```

Correct JSON fragment:

```json
"scriptText": "To mark your progress, comment \u0022Day 1 complete\u0022 below."
```

Incorrect:

```json
"scriptText": "To mark your progress, comment \"Day 1 complete\" below."
"scriptText": "To mark your progress, comment "Day 1 complete" below."
```

## SCRIPT COVERAGE RULE

Every spoken word must be covered exactly once, in original narration order.

You may split long paragraphs at natural sentence or clause boundaries.

Do not paraphrase, summarize, omit, reorder, or invent narration.

Structural labels are excluded from narration and must never appear in `scriptText`.

Validation: join parsed `scriptText` values in order and compare to the source script with structural labels removed and whitespace normalized.

## SECTION AND COVER RULES

Structural labels are never narrated and never copied into `scriptText`.

A label never creates a silent scene. The first spoken line after a section label is the voiced cover / opener for that section.

Markers that may appear in this format:

- `[INTRODUCTION]`
- `[CHAPTER COVER — BOOK CHAPTER]`
- `[REFLECTION AND PRAYER]`
- `[CLOSING]`
- `[FINAL]` (plain end bumper — video library)
- `[HOOK]` / `[END HOOK]` (segmentation only; never covers)

How covers work:

1. `[INTRODUCTION]` → first spoken line (usually `The Bible in One Year — Day N.`) is the intro cover insert with voiceover.
2. `[CHAPTER COVER — …]` → do not invent an extra empty cover. The following chapter announcement (`Genesis, chapter 1.`) **is** the chapter-cover scene.
3. If a chapter announcement appears without a label, it is still a chapter-cover scene.
4. `[REFLECTION AND PRAYER]` / `[CLOSING]` → first spoken line is the voiced opener cover; then continue narration.
5. Plain `[FINAL]` (exact, no title after it) → **exception**: create one silent video-library bumper scene at the end:
   - `scriptText: ""`
   - `visualIdea: "SECTION_CLIP | FINAL: end bumper"`
   - `visualPurpose: "Video-library FINAL bumper (empty scriptText; exclusive clip audio)."`
   - `imagePrompt: ""`
   - Do not invent spoken narration for this marker.
6. Never create a spoken cover with empty `scriptText` (the plain `[FINAL]` bumper is the only empty-scriptText insert).

### Chapter cover example

Spoken line: `Genesis, chapter 1.`

- `sceneType`: `insert`
- `visualIdea`: `Chapter cover: GENESIS 1, with a restrained open-Bible composition`
- `scriptText`: `Genesis, chapter 1.`
- `imagePrompt`: begin with the narrated-cover style lock from FINAL IMAGE PROMPT CONTRACT, then an image-first open-Bible composition with clear negative space for the title, page wording indistinct, `visible text limited to: GENESIS 1`, then the negative lock

Visible title may simplify (`GENESIS 1`). `scriptText` must keep the spoken wording.

## SCENE TYPE MEANING

Use only: `avatar`, `insert`, or `space`.

- **avatar** — host, older listener, biblical people, human gesture or emotion
- **insert** — covers, close objects/details, short title/progress inserts
- **space** — landscapes, environments, creation scenes, quiet rooms without a dominant character focus

## VISUAL-FIRST RULE

The image does the primary storytelling. Visible text is secondary and rare.

If a scene communicates clearly without text, do not add visible text.

Prefer one meaningful object, one biblical environment, one human gesture, or one focused detail.

## TEXT BY SCENE TYPE

### avatar

- Default: `No visible text.`
- Rare exception only: 1 to 3 essential words.

### space

- Default: `No visible text.`
- Environment/action must carry the meaning.
- Rare exception only: 2 to 3 essential words.

### insert

- Default for Scripture-reading inserts: `No visible text.`
- Covers and short progress/next-reading inserts may include essential title text.
- Non-cover inserts: prefer 1 to 4 words max when text is truly needed.
- Only these insert classes may exceed 4 words when necessary:
  - episode / chapter / section covers
  - progress title inserts (`DAY N COMPLETE`)
  - next-reading title inserts (`NEXT — GENESIS 3–5`)

## COVER AND TITLE TEXT RULE

When an insert is allowed to show text, show only the essential title. No subtitle. No explanatory sentence. No decorative supporting words.

Allowed on-screen titles (UPPERCASE, no quotation marks):

- `THE BIBLE IN ONE YEAR — DAY 1`
- `GENESIS 1`
- `GENESIS 2`
- `GENESIS 1–2`
- `REFLECTION AND PRAYER`
- `PRAYER`
- `CLOSING`
- `DAY 1 COMPLETE`
- `NEXT — GENESIS 3–5`

Canonical `imagePrompt` phrases:

- No text: `No readable writing, visible text, captions, letters, numbers, logos, or words.`
- With text: `visible text limited to: TITLE`
- Then: `No other readable writing, captions, letters, numbers, logos, or words.`

Do not write quoted titles, `exact readable visible text: Day 1 complete.`, or `Use only this exact visible text: ...`.

Spoken `scriptText` preserves original casing/punctuation. On-screen title may be normalized to the short UPPERCASE form.

## FINAL IMAGE PROMPT CONTRACT — FIRST-PASS PRODUCTION OUTPUT

The `imagePrompt` returned in every scene is the **final production prompt**.

It will be sent directly to the image-generation model without rewriting, compilation, expansion, correction, access to the other scene fields, or access to this visual brief.

Therefore every `imagePrompt` must be standalone, complete, production-ready, visually specific, consistent with the channel style, and understandable without reading `scriptText`, `visualPurpose`, or `visualIdea`.

Never return a short base prompt, shorthand prompt, placeholder, summary, or prompt that depends on later processing.

Do not assume that another system will add aspect ratio, art medium, palette, character continuity, composition instructions, text restrictions, negative restrictions, Bible-page safety, or title restrictions.

### Final prompt order

1. format and visual style  
2. principal subject and framing  
3. observable action or visual state  
4. spatial relationship and script-specific detail  
5. semantic or emotional clarification when needed  
6. composition guard  
7. Bible-page or character-continuity rule when applicable  
8. visible-text rule  
9. negative restrictions  

### Style locks (begin every prompt with exactly one)

**Avatar:**

```text
16:9 horizontal hand-painted watercolor and ink Bible-study illustration on warm off-white textured paper, with soft sketch outlines, muted earth tones, wheat gold, olive green, dusty blue shadows, burnt umber, and gentle parchment light.
```

**Insert without cover:**

```text
16:9 horizontal hand-painted watercolor and ink object-detail insert on warm off-white textured paper, with soft sketch outlines, muted earth tones, wheat gold, olive green, dusty blue shadows, burnt umber, and gentle parchment light.
```

**Landscape / exterior space:**

```text
16:9 horizontal hand-painted watercolor and ink Bible-study landscape on warm off-white textured paper, with soft sketch outlines, muted earth tones, wheat gold, olive green, dusty blue shadows, burnt umber, and gentle parchment light.
```

**Interior space:**

```text
16:9 horizontal hand-painted watercolor and ink Bible-study interior on warm off-white textured paper, with soft sketch outlines, muted earth tones, wheat gold, olive green, dusty blue shadows, burnt umber, and gentle parchment light.
```

**Narrated cover:**

```text
16:9 horizontal hand-painted watercolor and ink restrained Bible-study title composition on warm off-white textured paper, with soft sketch outlines, muted earth tones, wheat gold, olive green, dusty blue shadows, burnt umber, and gentle parchment light.
```

### Character continuity locks (copy verbatim into every relevant imagePrompt)

**Host:**

```text
Recurring American pastor host: about 55–65, warm fair complexion, short neatly kept silver-gray hair with slightly darker sides, closely trimmed salt-and-pepper beard, calm brown or hazel eyes, gentle expression lines around the eyes and forehead, softly defined facial features, medium build, open-collar dusty-blue cotton shirt beneath a warm beige lightweight cardigan, relaxed upright posture, restrained welcoming smile, painted as simplified watercolor-and-ink storybook forms without photorealism or celebrity likeness
```

**Listener:**

```text
Recurring older listener: about 65–80, soft white or gray hair, warm complexion, quiet lined face, receptive eyes, modest knit sweater, calm seated or standing posture, simplified watercolor treatment without celebrity likeness
```

**Adam:**

```text
Adam as a dignified first man: youthful adult, short dark hair, warm olive-tan complexion, strong but gentle features, simple unadorned biblical-era wrap, respectful non-erotic framing with natural modesty, watercolor-and-ink storybook treatment
```

**Eve:**

```text
Eve as a dignified first woman: youthful adult, long dark hair, warm olive-tan complexion, calm features, simple unadorned biblical-era wrap, respectful non-erotic framing with natural modesty, watercolor-and-ink storybook treatment
```

### Open Bible safety

Whenever an open Bible/page/document is visible and no readable text is authorized, include:

```text
The page layout and line structure may be suggested, but all printed or handwritten wording must remain indistinct and unreadable.
```

### Default negative lock (end every prompt)

```text
No photorealism, 3D rendering, glossy digital art, cinematic realism, dramatic movie lighting, neon, excessive clutter, watermark, logo, celebrity likeness, stock-photo styling, anime, comic-book styling, plastic textures, modern advertising design, infographic layout, miniature panels, or decorative religious filler.
```

### Independence test

Before returning each scene: could the image model create the intended image correctly if it received only this `imagePrompt` and none of the other JSON fields? If no, complete the prompt.

The compact request also injects the full FINAL IMAGE PROMPT CONTRACT with examples and silent validation checklist. Obey that contract for every scene.

## IMAGE PROMPT STYLE

Describe image first, then text if allowed.

Do not write card-first prompts such as: source card, reading plan card, clear comment card, next-reading card, WEBUS card.

Avoid the word **card** in `imagePrompt`. Prefer: chapter opener, title insert, closing insert, open Bible, quiet reading space.

Obey FINAL IMAGE PROMPT CONTRACT. Never return a short base prompt that expects later compilation.
## VISUAL QUALITY RULES

Warm watercolor-and-ink Bible study aesthetic: peaceful, reverent, clear, uncluttered, easy for listeners over 65.

One clear focal idea per scene. No crowded symbolism, abstract religious clichés, or repeated generic images.

### During Scripture reading

- Literal, calm visuals tied to the narrated text
- No modern listener stand-ins
- No sermon energy, guilt imagery, or dramatic fantasy
- Never depict God as a visible human figure
- Prefer landscapes, objects, animals, light, water, plants, garden scenes, respectful biblical figures when the text needs them

### During introduction, reflection, prayer, and closing

- Modern older-adult stand-ins allowed
- Quiet rooms, open Bibles, hands in prayer, warm morning/evening light
- Gentle, companionable, reassuring tone

Vary structure across the episode: wide peaceful space | close insert detail | restrained title insert | calm human moment | biblical landscape | concrete object

## VISUALIDEA PREFIXES

Every `visualIdea` must start with exactly one allowed prefix:

- `Narrative scene:`
- `Object/detail insert:`
- `Chapter cover:`
- `Atmosphere/space:`
- `Concept card:` (rare; discouraged)
- `Scripture/reference card:` (rare; discouraged)

Prefer `Chapter cover:` for intro/chapter/reflection/closing openers.

Prefer `Narrative scene:` / `Object/detail insert:` / `Atmosphere/space:` for body scenes.

Even when using `Chapter cover:`, write `imagePrompt` as an image-first composition, not a card template.

## DURATION GUIDANCE

Whole seconds only. Minimum 2.

- Cover / chapter announcement openers: about 4 to 6 seconds
- WEBUS reading scenes: pace to natural listening (often 6 to 11 seconds)
- Reflection and prayer: allow breathing room
- Closing: concise and calm

Do not merge independent beats only to pad duration.

## SCHEMA NOTES

- `sceneType` must be exactly `avatar`, `insert`, or `space`
- `status` is always `planned`
- Never create empty `scriptText` covers
