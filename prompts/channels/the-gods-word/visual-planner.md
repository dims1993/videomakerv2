# TheGodsWord Visual Planner Prompt

Voiceover guides the scene. Choose the visual format. Stage it naturally. Apply style. Return JSON.

The assigned `scriptText` is the main director of the `imagePrompt`.

## Output Contract

Return **only valid JSON**. Return a **JSON array only**. No wrapper object, no top-level `scenes`, no markdown or commentary.

[
  {
    "order": 1,
    "scriptText": "",
    "sceneType": "insert",
    "visualPurpose": "",
    "visualIdea": "",
    "duration": 8,
    "imagePrompt": "",
    "status": "planned"
  }
]

## Required Scene Fields

### scriptText

Exact narration fragment. Preserve wording. Keep script order.

### sceneType

Use only: `"avatar"`, `"insert"`, or `"space"`.

- **avatar** — narrative scenes with people or biblical figures.
- **insert** — object/detail inserts, section opener cards, concept cards, scripture/reference cards, comparison cards, devotional visual boards, simple diagrams, word-study cards, and question cards.
- **space** — atmosphere, locations, silence, roads, skies, transitions, breathing room.

### visualPurpose

One short sentence. Not a theology essay.

### visualIdea

One plain visual sentence. Name the visual format when helpful.

Example: `Section opener card: THE CUP BEFORE HIM, subtitle MORE THAN SUFFERING, with clay cup on Gethsemane soil.`

### duration

Whole seconds only. **Hook:** 4–6 seconds. **Body:** 6–11 seconds.

### imagePrompt

Usually 60–120 words. See shapes below.

### status

Always `"planned"`.

## Section Structure

For full videos, divide the script into clear teaching sections (usually 7–10).

Each major section should begin with a **section opener card** (`insert`):
- title: 3–5 words, subtitle: 4–9 words (optional)
- one simple symbol representing the section
- large hand-lettered title, smaller subtitle, parchment background

Do not create section openers for every paragraph — only at major idea shifts.

Do not output the section map. Do not add section fields to the JSON. Use section planning only to decide where section opener cards belong.

Use existing fields only: `visualIdea: Section opener card: [TITLE], subtitle [SUBTITLE], with [symbol].`

## Visual Format

Choose the best format per scene. No new schema field.

1. narrative scene  2. object/detail insert  3. section opener card  4. concept card  5. scripture/reference card  6. comparison card  7. devotional visual board  8. simple diagram  9. word-study card  10. question card  11. atmosphere / space

## Devotional Visual Boards

The reference style often uses devotional visual boards: designed teaching images that explain an idea, not just display a quote.

Use when the narration teaches a relationship, tension, process, contrast, or spiritual mechanism.

May include: short title, 2–4 labels, arrows, side-by-side contrast, cause/effect, before/after, one labeled biblical object, small supporting illustrations.

Do not make most cards only display a single phrase.

Weak: `HE WAS HEARD` with only a cup → Better: `HE WAS HEARD` / `prayer offered → cup remained → strength given`

Weak: `THE CUP REMAINED` with only a cup → Better: `THE CUP REMAINED` / `not removed / not ignored / strengthened`

Weak: `TOO SMALL` with only a decorative frame → Better: `TOO SMALL` / narrow frame labeled `what I asked`, wider garden outside labeled `what God was doing`

Use exact short visible text only. Keep boards clean and uncluttered.

## Visual Rhythm

Mix: section openers, narrative scenes, concept cards, comparison cards, devotional visual boards, diagrams, object inserts, space for breath only.

## Text Policy

**Normal scenes:** No text.

**Card / board / diagram scenes** (section opener, concept, comparison, devotional visual board, simple diagram, question, word-study, scripture/reference): Flow renders exact short visible text (2–8 words). Use exact words from scriptText, key_line, or main_scripture. Simple readable hand-lettered typography. No invented text, extra text, random letters, misspelled text, or filler writing.

## ImagePrompt Shapes

**Normal:** `[style lock]. [scene]. No text, no captions, no letters, no words. [negative].`

**Concept/comparison/question/word-study cards:** `[style lock]. Bible-study concept card with exact text: "[TEXT]". [visual support]. Only requested visible text. [negative].`

**Scripture cards:** `[style lock]. Scripture card: "[QUOTE]" reference: "[REF]". Only requested visible text. [negative].`

**Devotional visual boards:** `[style lock]. Devotional visual board title: "[TITLE]" labels: "[LABEL 1]", "[LABEL 2]", "[LABEL 3]". Arrows, panels, or cause/effect layout. One central biblical object. Parchment background. Only requested visible text. [negative].`

**Section opener cards:** `[style lock]. Section opener card title: "[TITLE]" subtitle: "[SUBTITLE]". One symbol from section. Large title, smaller subtitle, parchment. Only requested visible text. [negative].`

**Simple diagrams:** `[style lock]. Bible-study diagram labels: "[LABELS]". Simple arrows, panels, or process path. Small supporting illustrations. Parchment background. Only requested visible text. [negative].`

## Style Lock

16:9 horizontal hand-painted watercolor and ink Bible study illustration on warm off-white paper, soft sketch outlines, muted earth tones, wheat gold, olive green, dusty blue shadows, burnt umber soil, gentle parchment light, visible paper texture, loose brush texture, clean symbolic composition, calm reverent mood

Return only the JSON array.
