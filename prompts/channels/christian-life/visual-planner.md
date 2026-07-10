# Christian Life — Visual Planner

## Purpose

This file defines how to transform a Christian Life video angle or script into a clear visual plan.

The Visual Planner exists to make sure every scene has:

- one clear emotional purpose
- one biblical principle behind it
- one simple symbolic image
- one readable action from the main stickman
- one composition that is easy to generate and understand

The visual style of the channel is:

**MAIN STICKMAN + BIG SYMBOLIC ELEMENT + SIMPLE LIFE SCENE**

The viewer should understand the image quickly, emotionally, and visually.

The image should support the narration, not simply repeat the narration.

---

## Core Function

The Visual Planner receives:

```text
Topic:
Angle:
Biblical principle:
Human pain:
Visual metaphor:
Emotional transformation:
Script segment:
```

And produces a sequence of visual beats.

Each visual beat should answer:

```text
What does the viewer feel?
What does the viewer see?
What is the main stickman doing?
What symbolic element carries the meaning?
What biblical principle is being made visible?
What should the next image generator prompt contain?
```

---

## Default Visual System

Every scene should follow this structure:

```text
MAIN STICKMAN + ONE SYMBOLIC ELEMENT + ONE EMOTION + ONE ACTION
```

The main stickman should appear by default.

The symbolic element should be large, simple, and emotionally meaningful.

The background should stay minimal.

The image should avoid unnecessary details.

---

## Visual Planning Philosophy

Do not illustrate every sentence literally.

Instead, identify the emotional and spiritual meaning of each segment.

A good visual plan should convert narration into:

- emotional states
- simple metaphors
- symbolic actions
- visual contrast
- transformation moments
- clear character decisions

Weak visual planning:

```text
Narration says “forgiveness is important,” so the image shows the word forgiveness.
```

Strong visual planning:

```text
Narration says “forgiveness releases the heart,” so the image shows the main stickman loosening a heavy chain from his wrist.
```

---

# Visual Beat Output Format

Each visual beat should use this format:

```text
Beat number:
Script segment:
Narrative function:
Emotional state:
Biblical principle:
Visual metaphor:
Main stickman action:
Symbolic element:
Supporting character:
Composition:
Background:
Motion suggestion:
Prompt notes:
Avoid:
```

---

# Field Definitions

## Beat Number

The order of the visual beat.

Example:

```text
Beat 01
Beat 02
Beat 03
```

---

## Script Segment

The exact narration fragment or summarized segment that this visual beat supports.

The segment should be short.

Good:

```text
“You keep replaying what they did to you.”
```

Bad:

```text
A full paragraph with five different ideas.
```

One beat should usually support one idea.

---

## Narrative Function

The job of the beat in the video.

Possible functions:

- hook
- emotional recognition
- human scenario
- tension
- wrong response
- consequence
- biblical principle
- visual metaphor introduction
- escalation
- turning point
- practical application
- hope
- closing image

Each beat should have a reason to exist.

---

## Emotional State

The feeling the image should communicate.

Examples:

- anxious
- burdened
- bitter
- confused
- ashamed
- lonely
- angry
- trapped
- conflicted
- tired
- hopeful
- relieved
- peaceful
- determined
- guided
- humbled
- comforted

The emotion should be visible through:

- eyebrows
- mouth
- posture
- head angle
- distance from symbolic element
- weight or pressure in the composition

---

## Biblical Principle

The principle being visualized.

Examples:

- forgiveness releases bitterness
- humility lowers the wall pride builds
- wisdom gives light for the next step
- patience allows hidden growth
- prayer turns the heart toward God
- gratitude changes what the heart notices
- anger must be controlled before it spreads
- repentance opens the door back to life

The principle should be practical, not abstract.

---

## Visual Metaphor

The metaphor that carries the idea visually.

Examples:

- chain = unforgiveness
- wall = pride
- fire = anger
- lamp = wisdom
- narrow path = obedience
- burden = guilt or worry
- seed = patience and growth
- bridge = reconciliation
- mirror = comparison
- storm cloud = anxiety
- open door = repentance
- window of light = prayer
- crossroads = decision
- scale = moral choice

Use one main metaphor per beat whenever possible.

---

## Main Stickman Action

The main stickman must usually do something.

Good actions:

- carrying a burden
- dragging a chain
- looking at a wall
- building a wall
- lowering a brick
- holding a lamp
- taking one step
- kneeling beside a burden
- dropping a stone
- reaching toward a door
- standing at a crossroads
- watering a seed
- repairing a bridge
- looking into a mirror
- stepping away from fire
- opening hands
- pausing before speaking
- choosing silence
- praying
- helping another stickman

Weak actions:

- standing randomly
- looking at nothing
- floating in empty space
- smiling without reason

The action should make the principle visible.

---

## Symbolic Element

This is the large object or visual idea in the scene.

Examples:

- huge chain
- dark stone
- brick wall
- growing fire
- small lamp
- narrow path
- open door
- heavy backpack
- cracked mirror
- storm cloud
- seed and roots
- broken bridge
- simple scale
- large clock
- two roads
- small candle
- window of light

The element should be:

- simple
- large enough to read quickly
- emotionally connected to the narration
- easy to generate
- easy to animate
- not text-dependent

---

## Supporting Character

Supporting characters appear only when needed.

Use supporting stickmen for:

- forgiveness
- conflict
- reconciliation
- comparison
- family pressure
- loneliness
- kindness
- pride
- serving others
- apology
- mercy

Rules:

- the main stickman remains the anchor
- supporting stickmen stay visually simple
- supporting stickmen must belong to the same stickman universe
- supporting stickmen should not replace the main character
- avoid crowd scenes unless absolutely necessary

Possible values:

```text
None
One supporting stickman on the other side of the wall
One supporting stickman walking away
One supporting stickman receiving help
One supporting stickman standing silently nearby
```

---

## Composition

Composition defines where the character and symbol appear.

Useful composition patterns:

```text
main stickman on the left, symbolic element on the right
main stickman on the right, symbolic element on the left
main stickman centered under a large burden
main stickman small beside oversized symbolic element
main stickman in foreground, symbolic element behind
main stickman between two choices
main stickman facing another stickman across a wall
close-up reaction shot with one simple object
medium-wide shot with lots of negative space
full body view when posture matters
```

Composition should support emotional clarity.

---

## Background

Background should stay simple.

Preferred backgrounds:

- clean white background
- very light gray background
- soft neutral background
- minimal dark space with one light source
- simple symbolic background
- blank background with subtle ground line

Avoid:

- detailed rooms
- realistic landscapes
- complex biblical environments
- cluttered city scenes
- photorealistic lighting
- excessive decoration

---

## Motion Suggestion

This field helps if the scene is later animated.

Examples:

- slow zoom toward the chain
- slight camera push-in on the stickman’s face
- chain slowly becoming heavier
- wall brick added one by one
- small lamp flickers softly
- stickman slowly lowers the burden
- fire grows slightly
- door opens a little
- light expands gently
- seed root appears slowly
- bridge piece moves into place
- stickman takes one small step forward

Keep motion simple.

The animation should support the emotional idea, not distract from it.

---

## Prompt Notes

Prompt notes are specific instructions for the Image Prompt Writer.

Examples:

- keep the chain oversized and visually heavy
- make the stickman visibly tired through posture
- no readable text on the bill
- use one symbolic element only
- keep the background white
- make the light source soft and hopeful
- avoid scary imagery
- do not show a literal Bible unless needed
- keep the supporting stickman secondary
- make the metaphor easy to understand without captions

---

## Avoid

Each beat should include an avoid field when needed.

Default avoid:

```text
Avoid photorealism, 3D render, anime, realistic humans, detailed religious painting style, horror imagery, gore, political imagery, prosperity gospel imagery, luxury lifestyle imagery, complex background, clutter, subtitles, captions, narration text, long readable text, logos, watermark, named shows, named characters, direct recognizable character references, IP-adjacent wording.
```

---

# Visual Beat Types

## 1. Hook Beat

Purpose:

Capture emotional attention immediately.

Use:

- strong emotional posture
- one powerful symbolic element
- visual mystery
- simple tension

Examples:

- stickman dragging a chain
- stickman crushed by a burden
- stickman facing two roads
- stickman staring at a cracked mirror
- stickman holding a tiny lamp in darkness

Avoid:

- abstract religious symbols without story
- calm scenes with no tension
- object-only visuals
- generic peaceful imagery at the beginning

---

## 2. Recognition Beat

Purpose:

Make the viewer feel seen.

Use everyday emotional situations.

Examples:

- stickman replaying a painful memory as shadow shapes behind him
- stickman holding a phone, comparing himself to another life
- stickman sitting alone with a burden
- stickman trying to hide a heavy bag
- stickman smiling outwardly while carrying weight

The recognition beat should say visually:

```text
This is what it feels like inside.
```

---

## 3. Wrong Response Beat

Purpose:

Show the viewer’s natural but unwise reaction.

Examples:

- stickman adds another brick to a wall
- stickman feeds a small fire
- stickman tightens the chain
- stickman takes a shortcut toward danger
- stickman hides behind a burden
- stickman covers a cracked mirror instead of facing it

The wrong response should be understandable, not cartoonishly evil.

---

## 4. Consequence Beat

Purpose:

Show what happens when the wrong response continues.

Examples:

- wall becomes taller
- fire grows larger
- chain becomes heavier
- mirror becomes more distorted
- storm cloud expands
- bridge breaks further
- path becomes darker
- burden bends the stickman down

This beat increases emotional tension.

---

## 5. Biblical Principle Beat

Purpose:

Introduce the biblical wisdom visually.

Examples:

- small lamp appears
- door with light opens
- narrow path becomes visible
- seed appears in the ground
- window opens toward light
- chain begins to loosen
- wall shows a crack
- fire begins to shrink

This beat should feel like light entering the scene.

Avoid making it overly magical.

The principle should feel gentle, clear, and hopeful.

---

## 6. Turning Point Beat

Purpose:

Show the main stickman making a small choice.

Examples:

- dropping the chain
- lowering one brick
- taking one step onto the narrow path
- opening hands
- kneeling in prayer
- turning away from the shortcut
- watering the seed
- reaching toward another stickman
- telling the truth
- closing the matchbox before the fire grows

The turning point should be specific and practical.

---

## 7. Transformation Beat

Purpose:

Show the emotional result of the principle being applied.

Examples:

- stickman stands lighter
- chain lies on the ground
- bridge begins to reconnect
- light expands
- burden is set down
- seed becomes a sprout
- wall has an opening
- fire is reduced to smoke
- path ahead is still narrow but visible

Avoid unrealistic instant perfection.

The ending should show hope, not fantasy.

---

## 8. Closing Hope Beat

Purpose:

Leave the viewer with light.

Examples:

- stickman holding lamp on a path
- stickman standing beside an open door
- stickman looking at a small sunrise
- stickman walking forward with lighter posture
- stickman sitting peacefully after setting down a burden
- stickman extending a hand toward another person

The final image should feel calm, hopeful, and spiritually meaningful.

---

# Default Visual Arc

Most videos should follow this visual arc:

```text
1. Pain or confusion
2. Symbolic problem appears
3. Wrong response makes it worse
4. Consequence becomes visible
5. Biblical principle enters as light or clarity
6. Main stickman makes a small wise choice
7. Symbolic transformation begins
8. Viewer leaves with hope
```

---

# Visual Planner Template

Use this template for each beat.

```text
Beat number:
Script segment:
Narrative function:
Emotional state:
Biblical principle:
Visual metaphor:
Main stickman action:
Symbolic element:
Supporting character:
Composition:
Background:
Motion suggestion:
Prompt notes:
Avoid:
```

---

# Visual Planner Prompt

Use this prompt to generate a visual plan from a script or angle.

```text
You are the Visual Planner for the Christian Life YouTube channel.

The channel creates illustrated biblical life advice videos using a recurring emotional stickman character.

Your job is to transform the provided angle or script into a sequence of visual beats.

Visual system:
MAIN STICKMAN + BIG SYMBOLIC ELEMENT + SIMPLE LIFE SCENE

Character:
main recurring emotional stickman from the shared Stickman Channel universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth capable of showing emotion, no nose, no hair, no ears, thin black stick arms and legs, clean 2D hand-drawn linework, slightly organic black lines, minimal readable silhouette, emotionally vulnerable but relatable personality, strong body language.

Rules:
- The main stickman should appear by default.
- Each beat should communicate one clear idea.
- Do not illustrate every sentence literally.
- Translate narration into emotional state, action, metaphor, and composition.
- Use one main symbolic element per beat whenever possible.
- Keep visuals minimal, readable, and emotionally clear.
- Avoid object-only scenes unless explicitly justified.
- Avoid environment-only scenes unless explicitly justified.
- Avoid readable text inside images unless absolutely necessary.
- Avoid photorealism, 3D, anime, realistic humans, complex backgrounds, clutter, logos, watermark.
- The visual sequence should move from pain to clarity to hope.
- Biblical wisdom should be communicated visually through metaphor, not through heavy text.

For each beat, output:

Beat number:
Script segment:
Narrative function:
Emotional state:
Biblical principle:
Visual metaphor:
Main stickman action:
Symbolic element:
Supporting character:
Composition:
Background:
Motion suggestion:
Prompt notes:
Avoid:

Input:
{angle_or_script}
```

---

# Beat Density Rules

The number of visual beats depends on the video length.

## Short Video: 3–6 minutes

Recommended:

```text
12–24 visual beats
```

Use:

- fewer scenes
- stronger symbols
- clear emotional arc
- more repeated visual motifs

---

## Medium Video: 8–12 minutes

Recommended:

```text
30–60 visual beats
```

Use:

- one major metaphor
- several emotional variations
- more scene progression
- clear beginning, middle, and ending

---

## Long Video: 15–22 minutes

Recommended:

```text
70–120 visual beats
```

Use:

- one main metaphor
- two or three secondary metaphors
- repeated visual callbacks
- stronger emotional escalation
- visual chapters

---

# Visual Rhythm Rules

A good visual rhythm alternates between:

## 1. Character Emotion

The stickman reacts, feels, struggles, or realizes something.

Examples:

- close-up worried face
- slumped posture
- confused head tilt
- tired sitting pose

---

## 2. Symbolic Object

A large object communicates the spiritual or emotional idea.

Examples:

- chain
- wall
- fire
- burden
- lamp
- path
- bridge

---

## 3. Character Interaction

The stickman physically interacts with the metaphor.

Examples:

- dragging the chain
- adding a brick
- holding the lamp
- lowering the burden
- repairing the bridge

---

## 4. Transformation

The visual metaphor changes.

Examples:

- chain loosens
- wall cracks
- fire shrinks
- light expands
- seed sprouts
- bridge reconnects

---

## Recommended Pattern

Use this pattern often:

```text
emotion → symbol → interaction → consequence → principle → decision → transformation
```

This keeps the video from feeling visually repetitive.

---

# Visual Motif Rules

A motif is a symbol that returns throughout the video.

Use motifs to improve retention and coherence.

Examples:

## Forgiveness Video

Main motif:

```text
chain
```

Progression:

```text
chain appears → chain grows heavier → stickman notices it → chain loosens → chain drops
```

---

## Pride Video

Main motif:

```text
wall
```

Progression:

```text
first brick → taller wall → isolation → crack in wall → brick removed → opening appears
```

---

## Patience Video

Main motif:

```text
seed
```

Progression:

```text
seed planted → nothing visible → roots grow underground → sprout appears → stickman understands waiting
```

---

## Faith Video

Main motif:

```text
lamp
```

Progression:

```text
darkness → small lamp → one visible step → path continues → stickman walks forward
```

---

## Anger Video

Main motif:

```text
fire
```

Progression:

```text
spark → flame → spreading fire → pause → water/extinguishing → peace
```

---

# Visual Continuity Rules

Visual continuity helps the video feel like one story.

Use:

- repeated symbolic elements
- repeated emotional posture
- clear progression of the same metaphor
- consistent stickman proportions
- minimal background changes
- smooth emotional transitions
- recurring composition callbacks

Avoid:

- random unrelated images
- changing metaphor too often
- switching visual worlds
- too many props
- too many supporting characters
- complex scenes that feel disconnected

---

# Scene Complexity Rules

Each beat should use one of these complexity levels.

## Level 1 — Simple Emotion

```text
main stickman + emotion + blank background
```

Use for:

- recognition
- inner conflict
- close-up reaction
- emotional pause

Example:

```text
main stickman sitting alone, head lowered, tired expression, clean white background
```

---

## Level 2 — Emotion + Prop

```text
main stickman + one small prop
```

Use for:

- everyday life scenarios
- bills, phone, mirror, letter, cup, chair

Example:

```text
main stickman holding a phone, comparing himself, worried expression
```

---

## Level 3 — Main Symbolic Element

```text
main stickman + one large symbolic element
```

Use for:

- core metaphor
- tension
- transformation
- thumbnail scenes

Example:

```text
main stickman dragging a large chain connected to a dark stone
```

---

## Level 4 — Two Characters + Symbol

```text
main stickman + supporting stickman + one symbolic element
```

Use for:

- forgiveness
- pride
- reconciliation
- kindness
- apology
- conflict

Example:

```text
main stickman and supporting stickman separated by a brick wall
```

---

## Level 5 — Rare Visual Exception

```text
symbolic object only or environment-only scene
```

Use only when:

- transition needs a visual reset
- the object itself is the idea
- the narration specifically requires no character
- the scene would become clearer without the stickman

Examples:

```text
single seed underground with roots beginning to grow
single open door with light behind it
single cracked mirror
```

Use rarely.

---

# Visual Safety Rules

Because the channel deals with spiritual and emotional topics, avoid visuals that create the wrong tone.

Avoid:

- horror-like demons
- gore
- violent punishment imagery
- overly dark religious fear imagery
- political symbolism
- denominational symbolism as default
- prosperity imagery
- luxury reward visuals
- hellfire spectacle
- realistic suffering
- graphic wounds
- manipulation through terror

Prefer:

- symbolic darkness
- soft light
- burdens
- paths
- doors
- chains
- walls
- fire as controlled metaphor
- gentle transformation
- hope after conviction

---

# Image Prompt Handoff Format

The Visual Planner should hand off each beat to the Image Prompt Writer in this compact format:

```text
visual_scene:
emotion:
action:
symbolic_element:
composition:
background:
supporting_character:
motion_suggestion:
avoid:
```

Example:

```text
visual_scene: main stickman dragging a heavy chain connected to a dark stone
emotion: tired and burdened
action: dragging the chain slowly while looking down
symbolic_element: oversized chain and dark stone representing bitterness
composition: medium-wide shot, stickman on the left, stone on the right
background: clean white background
supporting_character: none
motion_suggestion: slow camera push-in, chain slightly dragging across floor
avoid: text, logos, photorealism, 3D, anime, complex background
```

---

# Example Visual Plan — Forgiveness Angle

## Input Angle

```text
Topic: Forgiveness
Human pain: the viewer keeps replaying what someone did to them
Biblical principle: forgiveness releases the heart from bitterness
Visual metaphor: chain connected to a dark stone
Transformation: from bitterness to release
```

---

## Beat 01

**Script segment:**
“Sometimes the heaviest thing you carry is not what happened to you.”

**Narrative function:**
Hook.

**Emotional state:**
Tired and burdened.

**Biblical principle:**
The heart can become weighed down by bitterness.

**Visual metaphor:**
Heavy invisible emotional burden made visible.

**Main stickman action:**
Walking slowly with slumped posture.

**Symbolic element:**
Large dark stone behind him, not fully revealed yet.

**Supporting character:**
None.

**Composition:**
Medium-wide shot, stickman on the left, dark stone partially visible behind him.

**Background:**
Clean white background.

**Motion suggestion:**
Slow camera push-in as the stone becomes more visible.

**Prompt notes:**
The stone should feel heavy but not horror-like.

**Avoid:**
No text, no gore, no realistic pain, no dark horror style.

---

## Beat 02

**Script segment:**
“It is what you refuse to release.”

**Narrative function:**
Visual metaphor introduction.

**Emotional state:**
Burdened and stuck.

**Biblical principle:**
Unforgiveness keeps the heart attached to pain.

**Visual metaphor:**
Chain.

**Main stickman action:**
Looking down and noticing a chain around his wrist.

**Symbolic element:**
Large chain connected to the dark stone.

**Supporting character:**
None.

**Composition:**
Medium shot, chain clearly visible between stickman and stone.

**Background:**
Clean white background.

**Motion suggestion:**
Chain slowly becomes visible.

**Prompt notes:**
The chain should be oversized and simple.

**Avoid:**
No readable text, no scary imagery.

---

## Beat 03

**Script segment:**
“You think holding on protects you.”

**Narrative function:**
Wrong response.

**Emotional state:**
Defensive and wounded.

**Biblical principle:**
Bitterness can disguise itself as protection.

**Visual metaphor:**
The chain as false protection.

**Main stickman action:**
Holding the chain close to his chest as if it protects him.

**Symbolic element:**
Chain wrapped loosely around him.

**Supporting character:**
None.

**Composition:**
Close-up reaction shot, chain visible in foreground.

**Background:**
Very light gray background.

**Motion suggestion:**
Small tightening motion of the chain.

**Prompt notes:**
Make the character defensive, not villainous.

**Avoid:**
No aggressive revenge imagery.

---

## Beat 04

**Script segment:**
“But it keeps the wound alive.”

**Narrative function:**
Consequence.

**Emotional state:**
Trapped and tired.

**Biblical principle:**
Bitterness keeps pain active.

**Visual metaphor:**
Stone becomes heavier.

**Main stickman action:**
Trying to walk but being pulled backward.

**Symbolic element:**
Dark stone now larger and heavier.

**Supporting character:**
None.

**Composition:**
Full body view, stickman pulled backward by chain.

**Background:**
Clean white background.

**Motion suggestion:**
Subtle backward pull.

**Prompt notes:**
Make the physical pull clear.

**Avoid:**
No gore, no visible wound.

---

## Beat 05

**Script segment:**
“Forgiveness does not mean the wound was small.”

**Narrative function:**
Clarification.

**Emotional state:**
Serious and reflective.

**Biblical principle:**
Forgiveness does not deny pain.

**Visual metaphor:**
The stickman looks at the chain honestly.

**Main stickman action:**
Kneeling beside the chain and looking at it.

**Symbolic element:**
Chain and stone resting on ground.

**Supporting character:**
None.

**Composition:**
Medium shot, stickman kneeling beside chain.

**Background:**
Soft neutral background.

**Motion suggestion:**
Still pause.

**Prompt notes:**
This beat should feel honest and quiet.

**Avoid:**
No smiling, no instant victory.

---

## Beat 06

**Script segment:**
“It means refusing to let bitterness own your future.”

**Narrative function:**
Biblical principle.

**Emotional state:**
Hopeful and determined.

**Biblical principle:**
Forgiveness releases the heart from bitterness.

**Visual metaphor:**
Chain loosening.

**Main stickman action:**
Beginning to loosen the chain from his wrist.

**Symbolic element:**
Chain loosening, small light appearing.

**Supporting character:**
None.

**Composition:**
Medium close-up, hand/wrist area simplified.

**Background:**
Clean white background with soft light.

**Motion suggestion:**
Chain slowly loosens.

**Prompt notes:**
Keep hands simplified; no detailed fingers.

**Avoid:**
No magical explosion, no realistic hands.

---

## Beat 07

**Script segment:**
“The first step may be small.”

**Narrative function:**
Practical application.

**Emotional state:**
Cautious but hopeful.

**Biblical principle:**
Release can begin with one faithful step.

**Visual metaphor:**
First link drops.

**Main stickman action:**
Letting one chain link fall.

**Symbolic element:**
One broken or loosened chain link.

**Supporting character:**
None.

**Composition:**
Close-up of stickman and falling chain link.

**Background:**
Clean white background.

**Motion suggestion:**
One chain link falls slowly.

**Prompt notes:**
The action should feel small but meaningful.

**Avoid:**
No dramatic instant transformation.

---

## Beat 08

**Script segment:**
“The chain can be dropped.”

**Narrative function:**
Hopeful close.

**Emotional state:**
Relieved and peaceful.

**Biblical principle:**
Forgiveness brings release.

**Visual metaphor:**
Chain on the ground.

**Main stickman action:**
Standing upright beside the dropped chain.

**Symbolic element:**
Chain lying on the ground, dark stone behind but no longer attached.

**Supporting character:**
None.

**Composition:**
Full body shot, stickman centered, chain on the ground.

**Background:**
Soft white background with gentle light.

**Motion suggestion:**
Light expands slightly.

**Prompt notes:**
Show hope, not unrealistic perfection.

**Avoid:**
No big grin, no prosperity imagery, no text.

---

# Visual Quality Checklist

Before approving a visual plan, check:

- Does every beat have one clear idea?
- Is the main stickman present by default?
- Is the emotion visible?
- Is the symbolic element simple?
- Does the visual metaphor match the biblical principle?
- Does the sequence move from pain to clarity to hope?
- Are there too many props?
- Are there too many metaphors?
- Is any scene too literal or too abstract?
- Can the image be understood without text?
- Can the scene be animated simply?
- Does the final image bring light?
- Does the plan avoid fear-based or manipulative imagery?

If the plan fails several checks, simplify it.

---

# Final Rule

A good Christian Life visual plan should not just show what the narration says.

It should show what the viewer feels, what biblical wisdom reveals, and what changes when light enters the situation.
