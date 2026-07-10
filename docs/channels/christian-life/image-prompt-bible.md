# Christian Life — Image Prompt Bible

## Purpose

This file defines how to create image prompts for the Christian Life channel.

The Image Prompt Bible transforms visual beats into consistent image prompts for Google Flow or any image generation system.

The goal is to preserve:

- character consistency
- visual simplicity
- emotional clarity
- biblical symbolism
- scene readability
- channel identity
- production reliability

The visual system is:

**MAIN STICKMAN + BIG SYMBOLIC ELEMENT + SIMPLE LIFE SCENE**

Each generated image should help the viewer understand a biblical principle through a simple emotional scene.

The image should not merely decorate the narration.

It should make the principle visible.

---

## Core Visual Promise

Every image should communicate:

```text
This is what the viewer feels.
This is the biblical principle being revealed.
This is the emotional movement from darkness to light.
```

The viewer should understand the image in less than two seconds.

---

## Global Visual Style

All images should belong to this shared visual universe:

```text
minimal emotional stickman storytelling style, simple black stick figure characters with round white heads, two small black dot eyes, expressive black eyebrows, tiny simple mouths, no noses, no hair, no ears, thin black stick bodies, clean 2D hand-drawn linework, slightly organic black lines, minimal symbolic props, strong emotional readability, soft white or light neutral backgrounds, simple biblical life metaphors, uncluttered compositions, gentle hopeful tone
```

Shared universe traits:

- minimal emotional stickman storytelling style
- simple black stick figure body
- round white head
- two small black dot eyes
- expressive black eyebrows
- tiny simple mouth
- no nose
- no hair
- no ears
- thin black stick arms and legs
- clean 2D hand-drawn linework
- slightly organic black lines
- minimal symbolic props
- strong emotional readability
- soft white or light neutral backgrounds
- simple symbolic biblical metaphors
- uncluttered composition
- emotionally sincere tone
- hopeful visual direction

All images must feel like part of the same channel world.

---

## Main Stickman Descriptor

Use this descriptor by default in all image prompts.

```text
main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth capable of showing emotion, no nose, no hair, no ears, thin black stick arms and legs, simple rounded head slightly larger than the body, no visible neck, clean 2D hand-drawn linework, slightly organic black lines, minimal readable silhouette, emotionally vulnerable but relatable personality, strong body language, soft white or light neutral background
```

The main stickman should appear in every scene by default.

Rare exceptions are allowed only when the visual beat explicitly requires an object-only symbolic transition.

---

## Main Stickman Consistency Locks

The following traits must remain consistent:

- perfectly round white head
- head slightly larger than body
- two small black dot eyes
- simple expressive black eyebrows
- tiny simple mouth
- no nose
- no hair
- no ears
- no visible neck
- thin black stick body
- thin black stick arms
- thin black stick legs
- clean 2D hand-drawn linework
- slightly organic black lines
- minimal visual detail
- strong emotional body language

Do not generate:

- realistic human features
- white cartoon eyes with pupils
- detailed irises
- eyelashes
- nose
- ears
- hair
- facial hair
- clothing by default
- detailed hands
- realistic fingers
- detailed feet
- shoes
- muscles
- skin texture
- visible neck

The main stickman should remain simple enough to be instantly recognized.

---

## Supporting Stickman Descriptor

Use supporting stickmen only when the scene benefits from another human example.

```text
supporting stickman character from the same Christian Life visual universe, simple black stick figure body, round white head, two small black dot eyes, simple expressive black eyebrows, tiny simple mouth, no nose, no hair, no ears, thin black stick arms and legs, clean 2D hand-drawn linework, slightly organic black lines, minimal readable silhouette, emotionally readable body language, soft white or light neutral background
```

Supporting stickmen can appear for:

- conflict
- forgiveness
- reconciliation
- pride
- comparison
- loneliness
- kindness
- apology
- family pressure
- serving others
- moral choices

Rules:

- the main stickman remains the anchor
- supporting stickmen are secondary
- supporting stickmen must match the same visual universe
- avoid crowds
- avoid complex character differences
- avoid making supporting characters more detailed than the main stickman

---

## Core Prompt Formula

Every image prompt should follow this structure:

```text
STYLE LOCK + CHARACTER LOCK + SCENE + EMOTION + ACTION + SYMBOLIC ELEMENT + COMPOSITION + BACKGROUND + IMAGE RULES + AVOID
```

Recommended full structure:

```text
MAIN STICKMAN + BIBLICAL LIFE SCENE

{main_stickman_descriptor}

Scene: {scene}.
Emotion: {emotion}.
Life problem: {life_problem}.
Biblical principle: {biblical_principle}.
Visual metaphor: {visual_metaphor}.
Main symbolic element: {symbolic_element}.
Action: {action}.
Composition: {composition}.
Background: {background}.

Image rules: main stickman should appear by default, one large simple symbolic element, minimal clean composition, strong emotional readability, biblical wisdom communicated visually without heavy text, simple 2D hand-drawn stickman style.

Avoid: {avoid_list}
```

---

## Compact Prompt Formula

Use this version when token budget is limited.

```text
main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrows, tiny simple mouth, no nose, no hair, no ears, thin black stick limbs, clean 2D hand-drawn linework, slightly organic black lines, minimal white or light neutral background.

Scene: {scene}. Emotion: {emotion}. Action: {action}. Symbolic element: {symbolic_element}. Biblical principle: {biblical_principle}. Composition: {composition}. Background: {background}. Keep it minimal, emotional, symbolic, uncluttered, and easy to understand.

Avoid: photorealism, 3D, anime, realistic humans, detailed face, hair, nose, ears, clothing, detailed hands, realistic fingers, text, captions, subtitles, logos, watermark, clutter, complex background.
```

---

## Variable Fields

Each generated prompt should ideally receive these fields from the Visual Planner.

```json
{
  "scene": "",
  "emotion": "",
  "life_problem": "",
  "biblical_principle": "",
  "visual_metaphor": "",
  "symbolic_element": "",
  "action": "",
  "composition": "",
  "background": "",
  "supporting_character": "",
  "motion_suggestion": "",
  "avoid": ""
}
```

---

## Field Definitions

## `scene`

The scene describes what is happening visually.

Good examples:

```text
the main stickman is carrying a heavy chain connected to a dark stone
```

```text
the main stickman is standing at a crossroads between a wide easy road and a narrow lit path
```

```text
the main stickman is holding a small lamp at the beginning of a dark path
```

```text
the main stickman is building a wall between himself and another stickman
```

```text
the main stickman is kneeling beside a heavy burden
```

Bad examples:

```text
forgiveness
```

```text
biblical wisdom
```

```text
the importance of humility
```

The scene must be visible and stageable.

---

## `emotion`

The emotional state should be specific and readable.

Good examples:

- tired and burdened
- anxious and overwhelmed
- ashamed but hopeful
- angry but conflicted
- confused and lost
- bitter and stuck
- calm and reflective
- determined to change
- relieved and peaceful
- hopeful and guided

Avoid vague emotions:

- good
- bad
- spiritual
- emotional
- thoughtful, if not supported by posture

Emotion must be shown through:

- eyebrow position
- tiny mouth shape
- head angle
- posture
- body tension
- distance from symbolic element

---

## `life_problem`

The human struggle behind the scene.

Examples:

- unforgiveness
- bitterness
- pride
- anger
- comparison
- anxiety
- guilt
- impatience
- loneliness
- dishonesty
- fear
- temptation
- resentment
- lack of purpose
- spiritual dryness

This field helps the image generator stay conceptually grounded, even though the image should not use text.

---

## `biblical_principle`

The biblical truth made visible.

Examples:

- forgiveness releases the heart from bitterness
- humility opens the way to peace
- patience protects the heart while growth is unseen
- wisdom gives enough light for the next step
- prayer turns the heart back toward God
- gratitude changes what the heart notices
- repentance opens the door back to life
- self-control prevents anger from becoming destruction
- obedience can feel narrow before it feels freeing

The principle should be included in the prompt, but not rendered as text in the image.

---

## `visual_metaphor`

The symbolic comparison that carries the meaning.

Examples:

- a chain representing unforgiveness
- a wall representing pride
- a fire representing anger
- a lamp representing wisdom
- a narrow path representing obedience
- a heavy bag representing guilt
- a seed representing patient growth
- a bridge representing reconciliation
- a mirror representing comparison
- a storm cloud representing anxiety
- an open door representing repentance
- a window of light representing prayer

Use one main metaphor per image.

---

## `symbolic_element`

The physical object or symbol in the scene.

Examples:

- heavy chain
- dark stone
- brick wall
- growing fire
- small lamp
- narrow path
- open door
- heavy backpack
- cracked mirror
- storm cloud
- tiny seed
- broken bridge
- simple scale
- large clock
- window of light
- candle
- crossroads
- burden
- water drop
- open hands

The symbolic element should be:

- large enough to read quickly
- simple
- emotionally meaningful
- not overly detailed
- not text-dependent

---

## `action`

The main stickman should usually do something.

Good actions:

- dragging the chain
- looking down at the chain
- loosening the chain from his wrist
- lowering one brick from a wall
- holding a small lamp
- taking one careful step
- kneeling beside a burden
- setting down a heavy bag
- reaching toward an open door
- watering a tiny seed
- repairing a broken bridge
- stepping away from fire
- opening hands in prayer
- pausing before reacting
- standing between two paths

Avoid weak actions:

- standing randomly
- smiling without reason
- posing generically
- pointing at nothing
- floating in empty space

The action should communicate the principle.

---

## `composition`

Composition decides where elements appear.

Recommended compositions:

```text
medium shot, main stickman centered beside one large symbolic element
```

```text
medium-wide shot, main stickman on the left and symbolic element on the right
```

```text
main stickman on the right, large symbolic element on the left
```

```text
full body view, main stickman small under a large burden
```

```text
close-up reaction shot with one simple object
```

```text
main stickman centered with lots of negative space
```

```text
main stickman walking toward a small light source
```

```text
main stickman standing between two clear choices
```

Use simple, balanced compositions.

Avoid:

- complex perspective
- cinematic realism
- crowded layouts
- tiny character
- unclear object hierarchy
- multiple competing symbols

---

## `background`

Preferred backgrounds:

- clean white background
- very light gray background
- soft neutral background
- minimal dark space with one light source
- simple symbolic background with no clutter
- blank background with subtle ground line

Avoid:

- detailed rooms
- realistic landscapes
- complex ancient environments
- realistic church interiors
- city scenes
- dramatic cinematic backgrounds
- cluttered environments
- stock illustration office backgrounds

The background should never compete with the stickman or symbolic element.

---

# Scene Types

## 1. Main Stickman Scene

Use when emotion is the focus.

Structure:

```text
main stickman + emotion + minimal background
```

Best for:

- recognition
- inner conflict
- emotional pause
- realization
- direct viewer identification

Example:

```text
main stickman sitting alone, head lowered, tired eyebrows, tiny sad mouth, clean white background
```

---

## 2. Symbolic Element Scene

Use when a biblical principle needs to be visualized.

Structure:

```text
main stickman + one large symbolic element
```

Best for:

- chain
- wall
- fire
- lamp
- burden
- path
- door
- mirror
- storm cloud
- seed
- bridge

Example:

```text
main stickman dragging a heavy chain connected to a dark stone
```

---

## 3. Interaction Scene

Use when the stickman acts on the metaphor.

Structure:

```text
main stickman + action + symbolic element changing
```

Best for:

- loosening chain
- lowering wall brick
- extinguishing fire
- opening door
- watering seed
- repairing bridge
- setting down burden
- taking a step onto the path

Example:

```text
main stickman loosening a heavy chain from his wrist, chain beginning to fall
```

---

## 4. Supporting Character Scene

Use when another person is necessary.

Structure:

```text
main stickman + supporting stickman + one symbolic element
```

Best for:

- forgiveness
- conflict
- pride
- reconciliation
- apology
- kindness
- comparison
- loneliness

Example:

```text
main stickman and supporting stickman separated by a simple brick wall, main stickman holding one brick, hesitant expression
```

---

## 5. Rare Object-Only Scene

Use rarely.

Only for:

- visual transitions
- symbolic resets
- extreme close-ups
- metaphor clarification

Examples:

```text
single chain lying on the ground, clean white background
```

```text
tiny seed underground with simple roots beginning to grow
```

```text
open door with soft light behind it
```

Object-only scenes should not replace the main stickman by default.

---

# Emotion Rendering Rules

## Confused

Use:

- one eyebrow raised
- head tilted
- tiny uneven mouth
- one hand near head
- uncertain posture

Prompt phrase:

```text
confused expression shown through one raised eyebrow, tilted head, tiny uneven mouth, uncertain posture
```

Avoid:

- question mark text
- big cartoon eyes
- detailed face

---

## Anxious

Use:

- tense raised eyebrows
- tiny worried mouth
- hunched posture
- arms close to body
- compressed body shape

Prompt phrase:

```text
anxious expression shown through tense eyebrows, tiny worried mouth, hunched posture, arms close to body
```

Avoid:

- horror expression
- realistic panic
- detailed stress marks

---

## Burdened

Use:

- slumped posture
- lowered head
- arms hanging down
- symbolic weight nearby or attached
- body leaning under pressure

Prompt phrase:

```text
tired and burdened posture, lowered head, slumped shoulders, body pulled down by the symbolic weight
```

Avoid:

- dramatic suffering realism
- gore
- excessive darkness

---

## Shocked

Use:

- raised eyebrows
- tiny open mouth
- frozen posture
- arms slightly lifted
- body leaning back

Prompt phrase:

```text
shocked expression shown through raised eyebrows, tiny open mouth, frozen posture, arms slightly lifted
```

Avoid:

- giant mouth
- detailed teeth
- comic explosion style

---

## Skeptical

Use:

- one eyebrow raised
- tiny flat mouth
- slight head tilt
- one arm slightly out

Prompt phrase:

```text
skeptical expression shown through one raised eyebrow, tiny flat mouth, slight head tilt
```

Avoid:

- meme face
- sarcastic realistic expression

---

## Angry But Conflicted

Use:

- lowered eyebrows
- tiny tense mouth
- body leaning forward
- hands close but simplified
- small fire or tension symbol nearby

Prompt phrase:

```text
angry but conflicted expression, lowered eyebrows, tiny tense mouth, body leaning forward but hesitant
```

Avoid:

- violent poses
- aggressive attack scene
- realistic anger face

---

## Hopeful

Use:

- softened eyebrows
- tiny upward mouth
- open posture
- body facing light or path
- slight forward movement

Prompt phrase:

```text
hopeful expression shown through softened eyebrows, tiny upward mouth, open posture, facing a gentle light source
```

Avoid:

- exaggerated happy mascot energy
- big smile
- celebration pose

---

## Relieved

Use:

- relaxed eyebrows
- tiny soft smile
- released shoulders
- open body language
- lighter posture

Prompt phrase:

```text
relieved expression shown through relaxed eyebrows, tiny soft smile, lighter upright posture
```

Avoid:

- big grin
- unrealistic instant perfection

---

## Determined

Use:

- lowered focused eyebrows
- tiny firm mouth
- upright posture
- stable stance
- simple action toward change

Prompt phrase:

```text
determined expression shown through focused eyebrows, tiny firm mouth, upright posture, stable stance
```

Avoid:

- superhero pose
- muscles
- aggressive energy

---

# Biblical Symbol Library

## Chain

Represents:

- unforgiveness
- bitterness
- guilt
- emotional bondage
- fear

Prompt language:

```text
one oversized heavy chain connected to a dark stone, simple symbolic design, visually heavy but not horror-like
```

Use for:

- forgiveness
- guilt
- fear
- resentment

Avoid:

- prison realism
- violence
- torture imagery
- horror darkness

---

## Dark Stone

Represents:

- unresolved wound
- burden
- bitterness
- emotional weight

Prompt language:

```text
one large dark stone symbolizing emotional weight, simple rounded shape, visually heavy, minimal detail
```

Avoid:

- gravestones unless explicitly needed
- horror texture
- blood
- realistic cracks

---

## Wall

Represents:

- pride
- isolation
- resentment
- emotional distance

Prompt language:

```text
one simple brick wall made of large plain bricks, symbolic barrier between characters, minimal detail
```

Use for:

- pride
- refusal to apologize
- relational distance

Avoid:

- realistic construction site
- complex architecture

---

## Fire

Represents:

- anger
- careless words
- conflict
- destruction
- temptation

Prompt language:

```text
one simple symbolic flame growing larger, clean minimal fire shape, emotional but not dangerous or horror-like
```

Use for:

- anger
- conflict
- speech
- temptation

Avoid:

- burning bodies
- destruction scenes
- hellfire spectacle
- horror visuals

---

## Lamp

Represents:

- wisdom
- guidance
- biblical truth
- enough light for the next step

Prompt language:

```text
one small simple lamp creating a soft circle of warm light, symbolizing biblical wisdom and guidance
```

Use for:

- wisdom
- faith
- fear
- uncertainty

Avoid:

- magical fantasy object
- overdramatic glow

---

## Path

Represents:

- obedience
- choices
- direction
- faithfulness
- wisdom

Prompt language:

```text
one simple narrow path leading forward, minimal shape, softly lit, representing obedience and wise direction
```

Use for:

- obedience
- wisdom
- decision-making
- faith

Avoid:

- realistic landscapes
- complex roads
- fantasy scenery

---

## Door

Represents:

- repentance
- forgiveness
- new beginning
- invitation
- change

Prompt language:

```text
one simple open door with soft light behind it, representing return, repentance, and new beginning
```

Use for:

- repentance
- shame
- hope
- return to God

Avoid:

- horror doorway
- overly ornate religious door
- complex architecture

---

## Burden

Represents:

- guilt
- worry
- pressure
- emotional exhaustion

Prompt language:

```text
one oversized simple burden or heavy bag weighing down the stickman, minimal symbolic shape
```

Use for:

- guilt
- anxiety
- pressure
- shame

Avoid:

- realistic injury
- suffering spectacle

---

## Mirror

Represents:

- comparison
- distorted identity
- insecurity
- self-examination

Prompt language:

```text
one simple cracked or distorted mirror showing a symbolic distorted reflection, no detailed face
```

Use for:

- comparison
- envy
- insecurity
- pride

Avoid:

- horror mirror
- scary reflection
- detailed face

---

## Seed

Represents:

- patience
- faith
- hidden growth
- small beginnings

Prompt language:

```text
one tiny seed or small sprout, simple symbolic design, showing hidden growth and patient faith
```

Use for:

- patience
- waiting
- growth
- faithfulness

Avoid:

- realistic botanical detail
- complex garden

---

## Bridge

Represents:

- reconciliation
- restored trust
- forgiveness
- connection

Prompt language:

```text
one simple broken bridge beginning to be repaired, symbolizing reconciliation and restored connection
```

Use for:

- forgiveness
- humility
- restored relationship
- apology

Avoid:

- realistic engineering
- dangerous cliff realism

---

## Storm Cloud

Represents:

- anxiety
- fear
- worry
- emotional heaviness

Prompt language:

```text
one simple dark storm cloud above the stickman, symbolic and minimal, not horror-like
```

Use for:

- anxiety
- worry
- fear
- uncertainty

Avoid:

- destructive storms
- disaster imagery
- realistic weather scene

---

## Window Of Light

Represents:

- prayer
- hope
- Godward attention
- clarity

Prompt language:

```text
one simple open window with soft light entering, symbolizing prayer and turning the heart toward God
```

Use for:

- prayer
- anxiety
- spiritual dryness
- hope

Avoid:

- ornate church window unless explicitly needed
- stained glass by default
- religious icon clutter

---

# Text Rules

Generated images should avoid text by default.

Do not include:

- subtitles
- captions
- narration text
- paragraphs
- long readable text
- tiny UI text
- fake app text
- dense chart labels
- Bible verse text inside image
- handwritten notes
- labels on objects unless explicitly needed

Allowed only when explicitly requested:

- one large simple word
- one short label
- one number
- one symbol
- one simple percentage

If text is allowed, it must be:

- large
- minimal
- readable
- directly connected to the visual idea

For most Christian Life images, use symbolic visuals instead of text.

---

# Color And Light Rules

Default palette:

- black stickman lines
- white stickman head
- white or light neutral background
- minimal gray support
- soft muted accent colors only for symbolic elements
- gentle light for hope or biblical clarity

Use light symbolically:

- darkness = confusion, fear, heaviness
- soft light = wisdom, hope, prayer, biblical clarity
- small light = first step of faith
- expanding light = transformation
- open light = release or return

Avoid:

- neon colors
- over-saturated cartoon palettes
- horror lighting
- cinematic realism
- complex shadows
- luxury gold aesthetics
- prosperity imagery

---

# Composition Rules

Every image should follow one of these composition patterns.

## Pattern A — Character Left, Symbol Right

Use for explanation and contrast.

```text
main stickman on the left, one large symbolic element on the right, clean white background
```

Best for:

- chain and stone
- chart-like symbolic elements
- door
- mirror
- burden

---

## Pattern B — Character Right, Symbol Left

Use to vary visual rhythm.

```text
main stickman on the right, one large symbolic element on the left, clean white background
```

Best for:

- repeated sequences
- emotional reaction shots
- tension beats

---

## Pattern C — Character Under Pressure

Use when the problem feels heavy.

```text
main stickman centered under or beside an oversized symbolic burden, full body view, lots of negative space
```

Best for:

- guilt
- anxiety
- pressure
- spiritual heaviness
- waiting

---

## Pattern D — Character Facing Choice

Use for moral or spiritual decisions.

```text
main stickman centered between two simple choices, one darker/wider path and one narrow softly lit path
```

Best for:

- obedience
- temptation
- wisdom
- decision-making

---

## Pattern E — Close-Up Reaction

Use for emotional recognition.

```text
close-up of main stickman face and upper body, simple object nearby, minimal background
```

Best for:

- shame
- realization
- shock
- worry
- conviction

---

## Pattern F — Transformation

Use for turning points.

```text
main stickman interacting with symbolic element as it changes, soft light entering the scene
```

Best for:

- chain loosening
- wall cracking
- fire shrinking
- door opening
- seed sprouting
- burden being set down

---

# Motion-Friendly Prompt Rules

Because images may later be animated, prompts should describe simple motion potential.

Good motion-friendly phrases:

- chain slowly dragging across the ground
- small lamp softly glowing
- light gently entering from the side
- wall beginning to crack
- one brick being lowered
- fire shrinking slightly
- door opening a little
- seed beginning to sprout
- burden being set down
- stickman taking one careful step

Avoid motion ideas that are too complex:

- chaotic action
- fast fight movement
- detailed crowd movement
- cinematic camera chase
- realistic particle effects
- complicated facial animation
- detailed hand gestures

---

# Default Avoid List

Use this avoid list in every prompt unless there is a reason to modify it.

```text
photorealism, 3D render, anime style, realistic humans, realistic human features, detailed face, white cartoon eyes with pupils, detailed irises, eyelashes, nose, ears, hair, facial hair, visible neck, clothing by default, detailed hands, realistic fingers, detailed feet, shoes, muscles, skin texture, detailed religious painting style, horror imagery, gore, demons as spectacle, violent punishment imagery, political imagery, denominational symbols by default, prosperity gospel imagery, luxury lifestyle imagery, complex background, clutter, realistic environment, subtitles, captions, narration text, paragraphs, long readable text, tiny UI text, logos, watermark, named shows, named characters, direct recognizable character references, IP-adjacent wording
```

---

# Prompt Templates

## Template 1 — Standard Scene Prompt

```text
MAIN STICKMAN + BIBLICAL LIFE SCENE

main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth capable of showing emotion, no nose, no hair, no ears, thin black stick arms and legs, simple rounded head slightly larger than the body, no visible neck, clean 2D hand-drawn linework, slightly organic black lines, minimal readable silhouette, emotionally vulnerable but relatable personality, strong body language, soft white or light neutral background.

Scene: {scene}.
Emotion: {emotion}.
Life problem: {life_problem}.
Biblical principle: {biblical_principle}.
Visual metaphor: {visual_metaphor}.
Main symbolic element: {symbolic_element}.
Action: {action}.
Composition: {composition}.
Background: {background}.

Image rules: main stickman should appear by default, one large simple symbolic element, minimal clean composition, strong emotional readability, biblical wisdom communicated visually without heavy text, simple 2D hand-drawn stickman style, no clutter.

Avoid: photorealism, 3D render, anime style, realistic humans, realistic human features, detailed face, white cartoon eyes with pupils, detailed irises, eyelashes, nose, ears, hair, facial hair, visible neck, clothing by default, detailed hands, realistic fingers, detailed feet, shoes, muscles, skin texture, detailed religious painting style, horror imagery, gore, demons as spectacle, violent punishment imagery, political imagery, denominational symbols by default, prosperity gospel imagery, luxury lifestyle imagery, complex background, clutter, realistic environment, subtitles, captions, narration text, paragraphs, long readable text, tiny UI text, logos, watermark, named shows, named characters, direct recognizable character references, IP-adjacent wording.
```

---

## Template 2 — Emotional Close-Up

```text
EMOTIONAL CLOSE-UP — CHRISTIAN LIFE STICKMAN

main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth capable of showing emotion, no nose, no hair, no ears, clean 2D hand-drawn linework, slightly organic black lines.

Scene: close-up reaction shot of the main stickman.
Emotion: {emotion}.
Inner struggle: {life_problem}.
Biblical principle: {biblical_principle}.
Small symbolic prop: {symbolic_element}.
Facial expression: show emotion only through eyebrows, tiny mouth, and head angle.
Composition: close-up of face and upper body, one simple symbolic prop nearby.
Background: {background}.

Image rules: minimal, emotional, quiet, sincere, no text, no clutter, strong readability.

Avoid: photorealism, 3D, anime, realistic eyes, pupils, nose, ears, hair, detailed face, detailed hands, subtitles, captions, logos, watermark, complex background.
```

---

## Template 3 — Symbolic Transformation

```text
SYMBOLIC TRANSFORMATION — CHRISTIAN LIFE STICKMAN

main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth capable of showing emotion, no nose, no hair, no ears, thin black stick arms and legs, clean 2D hand-drawn linework, slightly organic black lines.

Scene: {scene}.
Emotion before transformation: {starting_emotion}.
Emotion after transformation: {ending_emotion}.
Biblical principle: {biblical_principle}.
Visual metaphor: {visual_metaphor}.
Symbolic element transformation: {symbolic_element_change}.
Action: {action}.
Composition: {composition}.
Background: {background}, soft light entering gently.

Image rules: show a small but meaningful change, not instant perfection, keep the visual simple and hopeful.

Avoid: magical explosion, fantasy effects, photorealism, 3D, anime, clutter, readable text, logos, watermark, horror imagery.
```

---

## Template 4 — Two Stickmen Relationship Scene

```text
RELATIONSHIP SCENE — CHRISTIAN LIFE STICKMAN

main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth, no nose, no hair, no ears, thin black stick limbs, clean 2D hand-drawn linework.

Supporting stickman character from the same Christian Life visual universe, simple black stick figure body, round white head, dot eyes, simple expressive eyebrows, tiny mouth, no nose, no hair, no ears, thin black stick limbs, same minimal hand-drawn style.

Scene: {scene}.
Emotion: {emotion}.
Life problem: {life_problem}.
Biblical principle: {biblical_principle}.
Visual metaphor: {visual_metaphor}.
Main symbolic element: {symbolic_element}.
Action: {action}.
Composition: {composition}.
Background: {background}.

Image rules: main stickman remains the visual anchor, supporting stickman is secondary, one simple symbolic element, minimal clean composition, no readable text.

Avoid: realistic humans, detailed faces, clothing, hair, noses, ears, photorealism, 3D, anime, complex background, crowd scene, subtitles, captions, logos, watermark.
```

---

## Template 5 — Rare Object-Only Transition

```text
RARE SYMBOLIC OBJECT TRANSITION — CHRISTIAN LIFE

minimal emotional biblical symbolism, clean 2D hand-drawn style, simple black linework, soft white or light neutral background, one single symbolic object only.

Symbolic object: {symbolic_element}.
Biblical principle: {biblical_principle}.
Emotional meaning: {emotion}.
Visual metaphor: {visual_metaphor}.
Composition: centered object, lots of negative space.
Background: {background}.

Image rules: object-only scene allowed as rare transition, no character, no text, minimal and symbolic.

Avoid: photorealism, 3D, anime, realistic texture, complex background, subtitles, captions, narration text, logos, watermark, horror imagery.
```

---

# Example Prompts

## Example 1 — Forgiveness / Chain

```text
MAIN STICKMAN + BIBLICAL LIFE SCENE

main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth capable of showing emotion, no nose, no hair, no ears, thin black stick arms and legs, simple rounded head slightly larger than the body, no visible neck, clean 2D hand-drawn linework, slightly organic black lines, minimal readable silhouette, emotionally vulnerable but relatable personality, strong body language, soft white or light neutral background.

Scene: the main stickman is dragging a heavy chain connected to a dark stone.
Emotion: tired and burdened.
Life problem: unforgiveness and bitterness.
Biblical principle: forgiveness releases the heart from bitterness.
Visual metaphor: the chain represents unforgiveness that keeps the heart trapped.
Main symbolic element: one oversized heavy chain connected to one large dark stone.
Action: the stickman walks slowly forward while the chain pulls him back.
Composition: medium-wide shot, main stickman on the left, dark stone on the right, chain visible between them.
Background: clean white background.

Image rules: main stickman should appear by default, one large simple symbolic element, minimal clean composition, strong emotional readability, biblical wisdom communicated visually without heavy text, simple 2D hand-drawn stickman style, no clutter.

Avoid: photorealism, 3D render, anime style, realistic humans, realistic human features, detailed face, white cartoon eyes with pupils, detailed irises, eyelashes, nose, ears, hair, facial hair, visible neck, clothing by default, detailed hands, realistic fingers, detailed feet, shoes, muscles, skin texture, detailed religious painting style, horror imagery, gore, demons as spectacle, violent punishment imagery, political imagery, denominational symbols by default, prosperity gospel imagery, luxury lifestyle imagery, complex background, clutter, realistic environment, subtitles, captions, narration text, paragraphs, long readable text, tiny UI text, logos, watermark, named shows, named characters, direct recognizable character references, IP-adjacent wording.
```

---

## Example 2 — Forgiveness / First Release

```text
SYMBOLIC TRANSFORMATION — CHRISTIAN LIFE STICKMAN

main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth capable of showing emotion, no nose, no hair, no ears, thin black stick arms and legs, clean 2D hand-drawn linework, slightly organic black lines.

Scene: the main stickman is loosening a heavy chain from his wrist.
Emotion before transformation: tired and conflicted.
Emotion after transformation: cautious but hopeful.
Biblical principle: forgiveness begins with one honest step of release.
Visual metaphor: the chain represents bitterness losing its control.
Symbolic element transformation: one chain link begins to loosen and fall.
Action: the stickman carefully loosens the first link of the chain.
Composition: medium close-up, simplified wrist and chain visible, stickman face showing gentle hope.
Background: clean white background, soft light entering gently.

Image rules: show a small but meaningful change, not instant perfection, keep the visual simple and hopeful.

Avoid: magical explosion, fantasy effects, photorealism, 3D, anime, clutter, readable text, logos, watermark, horror imagery.
```

---

## Example 3 — Pride / Wall

```text
RELATIONSHIP SCENE — CHRISTIAN LIFE STICKMAN

main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth, no nose, no hair, no ears, thin black stick limbs, clean 2D hand-drawn linework.

Supporting stickman character from the same Christian Life visual universe, simple black stick figure body, round white head, dot eyes, simple expressive eyebrows, tiny mouth, no nose, no hair, no ears, thin black stick limbs, same minimal hand-drawn style.

Scene: the main stickman is building a wall between himself and another stickman.
Emotion: stubborn but lonely.
Life problem: pride and refusal to apologize.
Biblical principle: humility opens the way to peace.
Visual metaphor: the wall represents pride separating people.
Main symbolic element: one simple brick wall made of large plain bricks.
Action: the main stickman holds one brick, hesitating before adding it to the wall.
Composition: medium shot, main stickman on one side, supporting stickman on the other side, wall between them.
Background: clean white background.

Image rules: main stickman remains the visual anchor, supporting stickman is secondary, one simple symbolic element, minimal clean composition, no readable text.

Avoid: realistic humans, detailed faces, clothing, hair, noses, ears, photorealism, 3D, anime, complex background, crowd scene, subtitles, captions, logos, watermark.
```

---

## Example 4 — Faith / Lamp

```text
MAIN STICKMAN + BIBLICAL LIFE SCENE

main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth capable of showing emotion, no nose, no hair, no ears, thin black stick arms and legs, simple rounded head slightly larger than the body, no visible neck, clean 2D hand-drawn linework, slightly organic black lines, minimal readable silhouette, emotionally vulnerable but relatable personality, strong body language, soft white or light neutral background.

Scene: the main stickman is holding a small lamp at the beginning of a dark path.
Emotion: afraid but hopeful.
Life problem: uncertainty and fear.
Biblical principle: wisdom gives enough light for the next step, even when the whole road is not visible.
Visual metaphor: the lamp represents biblical wisdom and guidance.
Main symbolic element: one small simple lamp creating a soft circle of light.
Action: the stickman takes one careful step forward.
Composition: medium-wide shot, main stickman centered, dark path ahead, small light around him.
Background: minimal dark space with one soft light source.

Image rules: main stickman should appear by default, one large simple symbolic element, minimal clean composition, strong emotional readability, biblical wisdom communicated visually without heavy text, simple 2D hand-drawn stickman style, no clutter.

Avoid: photorealism, 3D render, anime style, realistic humans, realistic human features, detailed face, white cartoon eyes with pupils, detailed irises, eyelashes, nose, ears, hair, facial hair, visible neck, clothing by default, detailed hands, realistic fingers, detailed feet, shoes, muscles, skin texture, detailed religious painting style, horror imagery, gore, demons as spectacle, violent punishment imagery, political imagery, denominational symbols by default, prosperity gospel imagery, luxury lifestyle imagery, complex background, clutter, realistic environment, subtitles, captions, narration text, paragraphs, long readable text, tiny UI text, logos, watermark, named shows, named characters, direct recognizable character references, IP-adjacent wording.
```

---

## Example 5 — Anxiety / Storm Cloud

```text
MAIN STICKMAN + BIBLICAL LIFE SCENE

main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth capable of showing emotion, no nose, no hair, no ears, thin black stick arms and legs, simple rounded head slightly larger than the body, no visible neck, clean 2D hand-drawn linework, slightly organic black lines, minimal readable silhouette, emotionally vulnerable but relatable personality, strong body language, soft white or light neutral background.

Scene: the main stickman stands under a simple dark storm cloud while opening his hands upward.
Emotion: anxious but beginning to surrender.
Life problem: worry and trying to control everything.
Biblical principle: prayer turns the heart toward God before it tries to carry everything alone.
Visual metaphor: the storm cloud represents anxiety, open hands represent surrender.
Main symbolic element: one simple dark storm cloud above the stickman, small soft light entering from the side.
Action: the stickman opens his hands and looks toward the light.
Composition: full body view, main stickman centered under the cloud, light entering from one side.
Background: soft neutral background with no clutter.

Image rules: main stickman should appear by default, one large simple symbolic element, minimal clean composition, strong emotional readability, biblical wisdom communicated visually without heavy text, simple 2D hand-drawn stickman style, no clutter.

Avoid: photorealism, 3D render, anime style, realistic humans, realistic human features, detailed face, white cartoon eyes with pupils, detailed irises, eyelashes, nose, ears, hair, facial hair, visible neck, clothing by default, detailed hands, realistic fingers, detailed feet, shoes, muscles, skin texture, detailed religious painting style, horror imagery, gore, demons as spectacle, violent punishment imagery, political imagery, denominational symbols by default, prosperity gospel imagery, luxury lifestyle imagery, complex background, clutter, realistic environment, subtitles, captions, narration text, paragraphs, long readable text, tiny UI text, logos, watermark, named shows, named characters, direct recognizable character references, IP-adjacent wording.
```

---

# Image Prompt Writer Prompt

Use this prompt to convert visual beats into final image prompts.

```text
You are the Image Prompt Writer for the Christian Life YouTube channel.

The channel creates illustrated biblical life advice videos using a recurring emotional stickman character.

Your task is to convert each visual beat into a complete image prompt for Google Flow.

Visual system:
MAIN STICKMAN + BIG SYMBOLIC ELEMENT + SIMPLE LIFE SCENE

Main character:
main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth capable of showing emotion, no nose, no hair, no ears, thin black stick arms and legs, simple rounded head slightly larger than the body, no visible neck, clean 2D hand-drawn linework, slightly organic black lines, minimal readable silhouette, emotionally vulnerable but relatable personality, strong body language, soft white or light neutral background.

Rules:
- The main stickman should appear by default.
- Use one large simple symbolic element per image.
- Keep composition minimal and readable.
- Show emotion through eyebrows, tiny mouth, head angle, and body posture.
- Use biblical symbolism visually, not through text.
- Avoid readable text inside the image unless explicitly requested.
- Avoid object-only scenes unless the visual beat explicitly says it is a rare transition.
- Avoid environment-only scenes unless explicitly justified.
- Keep the image easy to understand in less than two seconds.
- Preserve the same stickman design across all prompts.
- Make the image emotionally sincere, not childish or comedic.
- Move from pain to clarity to hope across the sequence.

For each visual beat, output:
1. final_image_prompt
2. prompt_type
3. character_presence
4. symbolic_element
5. emotion
6. composition
7. avoid

Input visual beat:
{visual_beat}
```

---

# Batch Image Prompt Writer Prompt

Use this when generating image prompts for a full video.

```text
You are the Image Prompt Writer for the Christian Life YouTube channel.

Convert the following visual plan into final image prompts for Google Flow.

For every beat, create one image prompt.

Channel visual system:
MAIN STICKMAN + BIG SYMBOLIC ELEMENT + SIMPLE LIFE SCENE

Main stickman descriptor:
main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth capable of showing emotion, no nose, no hair, no ears, thin black stick arms and legs, simple rounded head slightly larger than the body, no visible neck, clean 2D hand-drawn linework, slightly organic black lines, minimal readable silhouette, emotionally vulnerable but relatable personality, strong body language, soft white or light neutral background.

Rules:
- Use the main stickman by default.
- Keep the stickman consistent across all prompts.
- Use one main symbolic element per prompt.
- Keep all backgrounds minimal.
- Avoid text, subtitles, captions, logos, watermarks.
- Avoid photorealism, 3D, anime, realistic humans, detailed features, clothing, hair, noses, ears.
- Avoid horror, gore, prosperity imagery, political imagery, denominational symbols by default.
- Make every prompt emotionally readable and visually simple.
- The sequence should visually move from pain to clarity to hope.
- Use soft light only when biblical clarity, hope, prayer, or release enters the scene.
- Do not create random object-only scenes unless explicitly marked as rare transition.

Output each prompt in this format:

Beat number:
Prompt type:
Final image prompt:
Character presence:
Symbolic element:
Emotion:
Composition:
Avoid:

Visual plan:
{visual_plan}
```

---

# JSON Output Format For Automation

When your app needs structured output, use this format.

```json
{
  "beat_number": 1,
  "prompt_type": "symbolic_element_scene",
  "final_image_prompt": "MAIN STICKMAN + BIBLICAL LIFE SCENE...",
  "character_presence": "main_stickman_present",
  "symbolic_element": "heavy chain and dark stone",
  "emotion": "tired and burdened",
  "composition": "medium-wide shot, main stickman on the left, dark stone on the right",
  "background": "clean white background",
  "avoid": "photorealism, 3D render, anime style, realistic humans, text, logos, watermark"
}
```

Recommended `prompt_type` values:

```text
main_stickman_scene
symbolic_element_scene
interaction_scene
supporting_character_scene
emotional_close_up
symbolic_transformation
rare_object_only_transition
thumbnail_prompt
```

Recommended `character_presence` values:

```text
main_stickman_present
main_and_supporting_stickman_present
object_only_rare_exception
```

---

# Thumbnail Prompt Rules

Thumbnails should follow:

```text
MAIN STICKMAN + ONE BIG SYMBOLIC ELEMENT + ONE CLEAR EMOTION
```

Thumbnail prompts should be:

- simpler than scene prompts
- higher emotional contrast
- more visually iconic
- less detailed
- focused on one symbolic element
- designed for instant understanding

Thumbnail prompt template:

```text
YOUTUBE THUMBNAIL — CHRISTIAN LIFE STICKMAN

main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrows, tiny simple mouth, no nose, no hair, no ears, thin black stick limbs, clean 2D hand-drawn linework, slightly organic black lines.

Thumbnail scene: {thumbnail_scene}.
Emotion: {emotion}.
Main symbolic element: {symbolic_element}.
Composition: large main stickman expression, oversized symbolic element, high visual contrast, clean background, very simple layout.
Optional text: {thumbnail_text}.

Thumbnail rules: instantly readable, emotional, minimal, no clutter, one idea only.

Avoid: long text, subtitles, captions, photorealism, 3D, anime, realistic humans, detailed face, hair, nose, ears, complex background, logos, watermark.
```

Example:

```text
YOUTUBE THUMBNAIL — CHRISTIAN LIFE STICKMAN

main recurring emotional stickman from the shared Christian Life visual universe, simple black stick figure body, perfectly round white head, two small black dot eyes, expressive black eyebrows, tiny simple mouth, no nose, no hair, no ears, thin black stick limbs, clean 2D hand-drawn linework, slightly organic black lines.

Thumbnail scene: the main stickman is exhausted while dragging a huge heavy chain connected to a dark stone.
Emotion: tired and burdened.
Main symbolic element: oversized chain and dark stone.
Composition: main stickman large on the left, huge chain and stone dominating the right side, clean white background, strong emotional posture.
Optional text: LET GO?

Thumbnail rules: instantly readable, emotional, minimal, no clutter, one idea only.

Avoid: long text, subtitles, captions, photorealism, 3D, anime, realistic humans, detailed face, hair, nose, ears, complex background, logos, watermark.
```

---

# Prompt Quality Checklist

Before approving an image prompt, check:

- Does the prompt include the main stickman descriptor?
- Is the main stickman present by default?
- Is there only one main symbolic element?
- Is the emotion specific?
- Is the action visible?
- Is the biblical principle included but not rendered as text?
- Is the visual metaphor clear?
- Is the composition simple?
- Is the background minimal?
- Does the scene avoid clutter?
- Does the prompt avoid text inside the image?
- Does the avoid list protect the stickman style?
- Can the image be understood in less than two seconds?
- Does the image support the narration emotionally?
- Does it fit the channel goal of bringing light?

If several answers are no, simplify the prompt.

---

# Common Failure Modes

## Failure 1 — Generic Stickman

Problem:

The model creates a random stickman with no emotional identity.

Fix:

Repeat:

```text
main recurring emotional stickman from the shared Christian Life visual universe
```

And include:

```text
perfectly round white head, two small black dot eyes, expressive black eyebrow strokes, tiny simple mouth, strong body language
```

---

## Failure 2 — Too Much Text

Problem:

The image contains paragraphs, subtitles, signs, or labels.

Fix:

Add:

```text
biblical wisdom communicated visually without heavy text, no subtitles, no captions, no narration text, no readable text inside the image
```

---

## Failure 3 — Human Instead Of Stickman

Problem:

The model creates a cartoon human.

Fix:

Strengthen avoid:

```text
no realistic humans, no human body, no skin, no clothing, no hair, no nose, no ears, no white cartoon eyes with pupils
```

---

## Failure 4 — Too Childish

Problem:

The scene looks like children’s Sunday school or a goofy doodle.

Fix:

Add:

```text
emotionally sincere, reflective, calm, visually minimal, not goofy, not childish, not mascot-like
```

---

## Failure 5 — Too Dark Or Horror-Like

Problem:

The scene becomes scary, demonic, or horror-themed.

Fix:

Add:

```text
symbolic darkness only, gentle hopeful tone, not horror-like, no demons, no gore, no violent punishment imagery
```

---

## Failure 6 — Too Many Symbols

Problem:

The image includes chains, fire, doors, lamps, and text all at once.

Fix:

Add:

```text
one large simple symbolic element only, no extra props, no clutter
```

---

## Failure 7 — Inconsistent Character

Problem:

The stickman changes head shape, eyes, or style.

Fix:

Always include the full character lock.

Use:

```text
same main recurring stickman, perfectly round white head, two small black dot eyes, expressive eyebrows, tiny simple mouth, thin black stick body, no hair, no nose, no ears
```

---

# Final Rule

Every image prompt should serve one purpose:

```text
Make biblical wisdom visible through a simple emotional scene.
```

If a prompt does not make the emotion, principle, or metaphor clearer, simplify it.

The strongest Christian Life image is usually:

```text
one stickman,
one emotion,
one symbolic object,
one clear action,
one clean background,
one movement toward light.
```
