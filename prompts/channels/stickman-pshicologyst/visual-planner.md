# Visual Planner

## 1. Purpose

The Visual Planner converts narration into production-ready visual beats.

It is the bridge between:

```text
SCRIPT
```

and:

```text
IMAGE PROMPTS / EDIT
```

Its job is not merely to "illustrate what the narrator says."

Its job is to ask:

> What is the fastest visual representation of the current idea?

---

## 2. Visual beat size

The supplied frame sample was extracted at roughly seven-second intervals, so exact edit cadence cannot be measured.

For planning, use a flexible default:

```text
one visual beat every 4–8 seconds
```

Faster for:
- lists;
- examples;
- comparisons;
- action sequences.

Slower for:
- core metaphors;
- major explanations;
- chapter cards.

Do not force a visual change when the same composition can evolve with small additions.

---

## 3. Beat classification

Every narration segment should receive one primary visual type.

### V1 — Literal action
Narration describes something physically visible.

Example:
```text
"put your phone across the room"
```

### V2 — Behavioral metaphor
Abstract psychological idea translated into a physical metaphor.

Example:
```text
"friction makes starting harder"
→ obstacle blocking path
```

### V3 — Comparison
Two alternatives.

Example:
```text
reward first vs progress first
```

### V4 — Process diagram
Causal chain or sequence.

Example:
```text
hard thing → discomfort → escape → relief
```

### V5 — Example montage
Narration lists multiple examples rapidly.

Example:
```text
study / clean / write / exercise
```

### V6 — Object/icon concept
One symbol carries the message.

Example:
```text
timer / calendar / battery
```

### V7 — Chapter card
Numbered habit transition.

### V8 — Emotional character beat
The key idea is the character's internal state.

---

## 4. Planning hierarchy

For each sentence or sentence group:

### Step 1 — Identify the narrative job

Choose one:

```text
HOOK
PROBLEM
EXAMPLE
MECHANISM
RULE
ACTION
CONTRAST
PROOF
TRANSITION
RECAP
CTA
```

### Step 2 — Compress to one idea

Example narration:

```text
You open a difficult report. You feel confused. You check Instagram. Confusion disappears.
```

Compressed idea:

```text
discomfort triggers escape because escape produces relief
```

### Step 3 — Select visual mode

Best visual:

```text
V4 Process diagram
```

### Step 4 — Choose metaphor / props

```text
report
confused character
phone
relief posture
arrows
```

### Step 5 — Choose Angle Builder layout

```text
L05 Cause → Effect
```

### Step 6 — Write scene prompt fields

---

## 5. Planner output format

Use one card per visual beat.

```yaml
SCENE_ID: 001
SCRIPT_RANGE:
NARRATIVE_JOB:
NARRATIVE_IDEA:
VISUAL_TYPE:
VISUAL_METAPHOR:
CHARACTER:
CHARACTER_POSE:
PROPS:
SHOT_SCALE:
LAYOUT:
COMPOSITION:
SCREEN_DIRECTION:
EMOTION:
TEXT_OVERLAY:
TRANSITION_IDEA:
IMAGE_PROMPT_NOTES:
```

---

## 6. Example — opening hook

Narration:

```text
Tomorrow morning, before you touch your phone, notice how fast your hand reaches for it.
```

Planner:

```yaml
SCENE_ID: 001
NARRATIVE_JOB: HOOK
NARRATIVE_IDEA: phone checking is automatic
VISUAL_TYPE: V1
VISUAL_METAPHOR: none; literal action is stronger
CHARACTER: recurring Everyman
CHARACTER_POSE: waking and reaching automatically
PROPS: smartphone
SHOT_SCALE: S3
LAYOUT: L02
COMPOSITION: character left-center, phone right-center, reaching arm creates visual line
SCREEN_DIRECTION: left-to-right
EMOTION: unconscious / automatic
TEXT_OVERLAY: none
TRANSITION_IDEA: add small notification marks after initial clean frame
IMAGE_PROMPT_NOTES: maximize white space; no full bedroom
```

---

## 7. Example — borrowed thoughts

Narration:

```text
Email, news and social media give your brain thoughts before you choose your own.
```

Planner:

```yaml
SCENE_ID: 002
NARRATIVE_JOB: MECHANISM
NARRATIVE_IDEA: outside information occupies attention first
VISUAL_TYPE: V4
VISUAL_METAPHOR: external icons flowing into thought bubble
CHARACTER: recurring Everyman
CHARACTER_POSE: looking at phone
PROPS: email icon, headline rectangle, social bubble
SHOT_SCALE: S6
LAYOUT: L07
COMPOSITION: character center, three simple information sources around upper half
SCREEN_DIRECTION: outside-to-center
EMOTION: passive attention capture
TEXT_OVERLAY: none
TRANSITION_IDEA: icons appear one by one
```

---

## 8. Example — first action

Narration:

```text
Don't start the entire project. Start one visible physical action.
```

Planner:

```yaml
SCENE_ID: 003
NARRATIVE_JOB: RULE
NARRATIVE_IDEA: shrink an abstract project into one concrete start
VISUAL_TYPE: V2
VISUAL_METAPHOR: giant task reduced to first stair
CHARACTER_POSE: stepping onto first stair
PROPS: staircase, small flag
SHOT_SCALE: S5
LAYOUT: L08
COMPOSITION: small character lower-left, staircase rising right, flag upper-right
SCREEN_DIRECTION: left-to-right
EMOTION: manageable determination
TEXT_OVERLAY: FIRST STEP
```

---

## 9. Example — avoidance loop

Narration concept:

```text
hard thing → discomfort → escape → relief
```

Planner:

```yaml
SCENE_ID: 004
NARRATIVE_JOB: MECHANISM
NARRATIVE_IDEA: immediate relief reinforces avoidance
VISUAL_TYPE: V4
VISUAL_METAPHOR: behavioral loop
CHARACTER_POSE: work → stress → phone → relaxed
PROPS: report, scribble, phone
SHOT_SCALE: S6
LAYOUT: L05
COMPOSITION: four nodes in a clean horizontal chain
SCREEN_DIRECTION: left-to-right
EMOTION: stress to relief
TEXT_OVERLAY: optional single words only
TRANSITION_IDEA: draw arrows progressively
```

---

## 10. Example — future self

Narration concept:

```text
prepare today so tomorrow starts more easily
```

Planner:

```yaml
SCENE_ID: 005
NARRATIVE_JOB: EXAMPLE
NARRATIVE_IDEA: current self removes tomorrow's friction
VISUAL_TYPE: V3
VISUAL_METAPHOR: two versions of same character
CHARACTER_POSE: prepare → begin
PROPS: book, shoes, water bottle, moon, sun
SHOT_SCALE: S6
LAYOUT: L03
COMPOSITION: TODAY left, TOMORROW right
SCREEN_DIRECTION: left-to-right
EMOTION: helpful / easy start
TEXT_OVERLAY: TODAY / TOMORROW
```

---

## 11. Example montage rule

When narration lists examples:

```text
study
clean
write
exercise
```

Do not create one dense frame with every prop.

Use either:

### Option A — 4 mini-scenes
```text
book | dishes | laptop | shoes
```

or:

### Option B — rapid visual replacements
Same character position while the main prop changes.

Option B usually creates stronger continuity.

---

## 12. Visual repetition strategy

The same concept may recur across the video.

Do not invent a new metaphor every time.

Reusing visual vocabulary improves comprehension.

Example:

```text
phone = distraction
calendar checks = consistency
stairs = gradual progress
flag = goal
scribble = mental friction/confusion
```

---

## 13. Scene diversity

Across any 8 consecutive beats, aim to include at least:

```text
2 literal character scenes
1 diagram
1 metaphor
1 object/icon shot
1 comparison or sequence
```

The remaining beats can repeat whichever type best serves the narration.

---

## 14. Text overlay rules

Use text when it compresses logic.

Good:

```text
10 MIN
TODAY
TOMORROW
IF
THEN
ONE TASK
```

Avoid subtitles inside the illustration. Full narration belongs in captions/voiceover, not scene art.

---

## 15. Transition planning

Because exact source animation is not available, use neutral production-friendly transitions.

### T1 — Draw-on
Lines appear as if sketched.

### T2 — Pop-in
Simple symbol appears.

### T3 — Replace
One prop swaps for another.

### T4 — Extend
Arrow or path grows.

### T5 — Build diagram
Nodes appear left-to-right.

### T6 — Push composition
Before shifts left while after appears right.

### T7 — Hard cut
Useful for chapter card reset.

Keep motion simple. The illustration style should remain the focus.

---

## 16. Planner decision rule

Always choose the most literal clear image before choosing a more creative one.

Priority:

```text
literal behavior
>
simple comparison
>
simple diagram
>
universal metaphor
>
novel metaphor
```

Clarity beats cleverness.

---

## 17. Final scene QA

- [ ] Does visual match the exact narrative idea?
- [ ] Is it understandable without narration?
- [ ] Is there only one dominant idea?
- [ ] Does it use established props/metaphors?
- [ ] Is the layout different enough from previous two beats?
- [ ] Can the image be generated consistently?
- [ ] Can text be added in post?
- [ ] Is animation simple enough to execute?
