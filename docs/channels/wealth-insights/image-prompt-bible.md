# Wealth Insights - Image Prompt Bible

## Core Visual Philosophy

Each image should faithfully interpret the narration beat, then simplify that interpretation into a clean, instantly readable visual.

The current visual system is:

MAIN HOST + BIG EXPLANATORY ELEMENTS

Every image should include the main host by default.

The main host is the constant visual anchor of Wealth Insights.

The host can present, point at, react to, participate in, stand beside, or explain the visual idea.

Other characters may appear, but the main host should still appear with them.

For now, avoid object-only scenes and environment-only scenes.

The image should feel connected to the exact line of narration it illustrates.

The viewer should understand the visual idea in less than one second.

This channel should not look like generic AI finance art.

It should look like a controlled clean 2D cartoon finance explainer with a consistent main host and a simple visual world.

---

## Main Host Rule

Every image should include the main host unless there is a rare, explicitly justified exception.

The main host may be:

- large in the foreground
- medium-sized beside the visual idea
- smaller when a large symbol or object needs to dominate
- facing the viewer
- pointing at an element
- reacting to an element
- physically participating in the metaphor
- standing beside another character
- guiding the viewer through a simple visual explanation

The image should ask:

"How does the main host appear with the visual idea?"

Do not build the image as an object-only or environment-only scene by default.

---

## Main Prompt Shape

Use this prompt shape for most images:

"Consistent clean 2D cartoon finance explainer style, main host scene, [main host descriptor], [host role/action], [one dominant explanatory element that illustrates the narration], [optional supporting elements only if useful], [clear relationship between host and dominant element], [emotion or tone], soft neutral background, simple readable composition, no subtitles, no captions, no narration text, no long readable text, no photorealism, no 3D, 16:9 composition."

Main host descriptor:

"main recurring finance host from the shared Wealth Insights character universe, with an oversized cartoon head, narrow forehead area, broad lower face, cleft chin with a visible central crease, clean-shaven face, heavy jaw and cheek area, no visible neck, head directly attached to the shirt collar, simple rounded cartoon nose, wide white cartoon eyes with small black pupils, small rounded ears, short simple brown hair, thick eyebrows, slim small upright body, white collared shirt, navy blazer, dark trousers, clean black outlines, flat colors, light soft shading"

If another character appears, describe them briefly as:

"supporting human character from the same Wealth Insights cartoon family, with an oversized or large cartoon head, narrow forehead area, broad lower face, simple rounded cartoon nose, wide white cartoon eyes with small black pupils, small rounded ears, simple stylized hair with a clean cartoon silhouette, no visible neck, head close to the shirt collar or shoulders, clean black outlines, flat colors, light soft shading"

The supporting character should appear beside the host, not instead of the host.

The main host must appear in the frame, but the host does not always need to be the largest visual object.

When the explanatory element carries the narration, make the element large and visually dominant.

The host can be:

- beside the dominant element
- pointing at it
- reacting to it
- touching it
- holding it
- being blocked by it
- being squeezed by it
- being surrounded by it
- standing with another character while the element dominates the frame

The host anchors the channel identity.

The dominant explanatory element carries the meaning of the narration beat.

Do not shrink important symbols just because the host is present.

Do not let the host become a generic presenter pose disconnected from the visual idea.

---

## Narrative-To-Visual Mechanism Rule

The visual planner should not only illustrate a related topic or symbol from the sentence.

It should illustrate the mechanism, consequence, emotional action, or decision pressure inside the sentence.

For every scriptText, silently ask:

1. What is actually happening in this sentence?
2. Is the sentence about pressure, blame, urgency, choice, danger, relief, control, waiting, saying no, or a changed identity?
3. What cause-and-effect mechanism should the viewer understand?
4. What visible action or consequence can show that mechanism?
5. What is the one dominant explanatory element that makes the mechanism readable?
6. How does the main host connect to that mechanism?

Do not generate a visualIdea that is only a decorative symbol.

Good visual ideas should usually show one of these:

- a person being pressured
- a person making a choice
- a bad option becoming the only visible option
- a safer option blocked by lack of buffer
- a bill, loan, rent notice, or deadline forcing urgency
- the host protecting a person from blame
- the host showing cause and effect
- the host reacting to a concrete financial threat
- the host physically participating in the metaphor

Bad pattern:
scriptText -> related symbol

Better pattern:
scriptText -> visible mechanism or consequence -> dominant explanatory element

Examples:

Bad:
"when they have no buffer" -> empty shield

Better:
"no buffer causes worse money decisions" -> a stressed person pushed toward a red bad option because the green safer option is blocked by an empty BUFFER shield

Bad:
"they are not stupid" -> crossed-out blame symbol

Better:
"they are not stupid" -> the host stands beside a stressed person and pushes away a large red accusing finger crossed out with an X

Bad:
"car repair is dangerous" -> blank paper

Better:
"car repair is dangerous" -> a giant repair bill labeled CAR REPAIR $1,200 beside a broken car with a warning triangle

Bad:
"choice becomes urgent" -> clock

Better:
"choice becomes urgent" -> a huge urgent clock pushing the host or a stressed person toward a red bill decision

Bad:
"you buy the cheaper thing that breaks sooner" -> generic bad choice symbol

Better:
"you buy the cheaper thing that breaks sooner" -> a cheap cracked appliance in the foreground while a stronger intact option sits farther away

---

## Host Roles

Use these as planning logic only. Do not add them as JSON fields.

### Host presents

The main host presents or points at large explanatory elements.

### Host reacts

The main host reacts emotionally to a bill, rent notice, number, chart, warning symbol, or situation.

### Host participates

The main host is physically inside the metaphor: squeezed, blocked, pulled, surrounded, balancing, holding, lifting, or resisting something.

### Host observes

The main host stands with or beside another character who is experiencing the financial situation.

### Host explains

The main host stands beside a simple diagram, comparison, chart, or symbolic mechanism.

---

## Elements And Symbols

Keep symbols and visual elements.

Do not remove them.

The visual system should rely on:

- main host
- one dominant explanatory element
- optional supporting elements
- simple symbolic objects
- simple readable metaphors

Allowed recurring elements:

- bills
- rent notices
- repair papers
- warning shapes
- arrows
- shields
- buffers
- clocks
- calendars
- simple charts
- phone screens
- bank balance blocks
- house icons
- doors
- barriers
- scales
- weights
- ropes
- money jars
- savings blocks
- small labels like "$10K", "RENT", "BILLS", "BUFFER", "DEBT", "SAVINGS", "MORTGAGE", "INCOME"

Element rules:

- every scene should have one dominant explanatory element
- the dominant element should be concrete, large, visually simple, and understandable without reading long text
- the dominant element should directly illustrate the narration beat
- supporting elements are optional
- supporting elements must clarify the dominant element
- usually use zero to three supporting elements
- allow up to four supporting elements only when useful
- avoid tiny icons and clutter
- avoid complex dashboards
- avoid object lists
- avoid lots of small text
- elements may dominate the frame while the host points, reacts, explains, or participates

The elements are not decorative.

They should carry the meaning of the narration.

Prefer concrete, instantly recognizable symbols over vague abstract symbolic phrases.

The dominant explanatory element should be something the viewer can understand in under one second.

Avoid vague symbolic phrases unless they are made visually concrete.

Avoid phrases like:

- blame symbol
- cushion symbol
- decision sign
- financial pressure symbol
- bad choice symbol
- abstract money stress symbol
- generic finance symbol

Instead use concrete visual objects:

- pointing finger
- red X mark
- heavy red weight
- oversized bill
- rent notice
- repair bill
- broken appliance
- cracked phone
- cracked chair
- urgent clock
- blocked door
- green shield
- empty green shield outline
- savings block
- phone balance
- warning triangle
- barrier
- scale
- rope
- calendar
- simple chart

If a concept is abstract, translate it into a concrete object or simple physical metaphor.

Bad:
"blame symbol"

Good:
"a large red pointing finger crossed out with a red X"

Bad:
"cushion symbol"

Good:
"an empty green shield outline labeled BUFFER"

Bad:
"decision sign"

Good:
"two large paths splitting left and right, one with a red bill icon and one with a green shield icon"

Bad:
"financial pressure symbol"

Good:
"one heavy red weight pressing down on a stack of bills"

Bad:
"bad choice symbol"

Good:
"a cheap cracked appliance in the foreground with a stronger intact appliance farther away"

Supporting elements are allowed only if they clarify the dominant element.

Do not let supporting elements compete with the dominant element.

Do not use object lists.

Do not use vague symbols when a concrete object would be clearer.

Do not make every image realistic.

Do not remove symbols.

Do not make large elements small just because the host is present.

Do not make symbols realistic by default.

Do not make every scene a literal real-world environment.

Symbols and large explanatory elements remain central to the style.

---

## Text Rules

Forbidden in images:

- subtitles
- captions
- full sentences
- paragraphs
- script text
- voiceover text
- explanatory sentence overlays
- large blocks of readable text

Allowed sparingly:

- "$10K"
- "RENT"
- "BILLS"
- "BUFFER"
- "DEBT"
- "SAVINGS"
- "MORTGAGE"
- "INCOME"
- "CAR REPAIR"
- "$1,200"
- "BAD LOAN"
- "PAYCHECK"
- "DUE"
- "LATE"

The image should not depend on reading text.

Functional object labels are allowed when they make an object instantly recognizable.

Functional labels should be:

- short
- object-identifying
- easy to read
- not full sentences
- not narration text
- not explanatory paragraphs

Examples:

Bad:
"a giant blank repair bill"

Good:
"a giant repair bill labeled CAR REPAIR $1,200"

Bad:
"a blank loan paper"

Good:
"a loan paper labeled BAD LOAN"

Bad:
"a blank rent notice"

Good:
"a rent notice labeled RENT"

Bad:
"a generic empty paper"

Good:
"a bill paper labeled BILLS"

Do not overuse labels.

Short labels should be large, simple, and easy to understand at a glance.

---

## Composition Rules

Default composition:

- main host visible in the frame
- one dominant explanatory element
- optional supporting elements only if useful
- one clear visual idea
- soft neutral background
- plenty of empty space
- no clutter

The host should be visually connected to the dominant explanatory element.

Good connections:

- host points at the element
- host touches or holds the element
- host reacts to the element
- host is squeezed, blocked, pulled, or surrounded by the element
- host stands beside another character and gestures toward the element
- host stands beside a simple comparison, chart, or symbolic mechanism

Avoid:

- object lists with no relationship to the host
- tiny finance icons scattered around the frame
- complex dashboards
- crowded diagrams
- purely decorative money imagery
- environments that do not explain the narration

---

## Examples

Script:
"You think your first $10,000 saved is just a number."

Prompt style:
"Consistent clean 2D cartoon finance explainer style, main host scene, main recurring finance host from the shared Wealth Insights character universe, with an oversized cartoon head, narrow forehead area, broad lower face, cleft chin with a visible central crease, clean-shaven face, heavy jaw and cheek area, no visible neck, head directly attached to the shirt collar, simple rounded cartoon nose, wide white cartoon eyes with small black pupils, small rounded ears, short simple brown hair, thick eyebrows, slim small upright body, white collared shirt, navy blazer, dark trousers, clean black outlines, flat colors, light soft shading, standing beside a large savings block labeled $10K, one hand resting on the block, calm direct-to-viewer expression, soft neutral background, simple readable composition, no subtitles, no captions, no narration text, no long readable text, no photorealism, no 3D, 16:9 composition."

Script:
"Before that number, every bill feels like a threat."

Prompt style:
"Consistent clean 2D cartoon finance explainer style, main host scene, main recurring finance host from the shared Wealth Insights character universe, with an oversized cartoon head, narrow forehead area, broad lower face, cleft chin with a visible central crease, clean-shaven face, heavy jaw and cheek area, no visible neck, head directly attached to the shirt collar, simple rounded cartoon nose, wide white cartoon eyes with small black pupils, small rounded ears, short simple brown hair, thick eyebrows, slim small upright body, white collared shirt, navy blazer, dark trousers, clean black outlines, flat colors, light soft shading, reacting to an oversized red bill paper looming beside him, the bill is the largest element in the frame, worried expression, soft neutral background, simple readable composition, no subtitles, no captions, no narration text, no long readable text, no photorealism, no 3D, 16:9 composition."

Script:
"They choose badly because they are trapped."

Prompt style:
"Consistent clean 2D cartoon finance explainer style, main host scene, main recurring finance host from the shared Wealth Insights character universe, with an oversized cartoon head, narrow forehead area, broad lower face, cleft chin with a visible central crease, clean-shaven face, heavy jaw and cheek area, no visible neck, head directly attached to the shirt collar, simple rounded cartoon nose, wide white cartoon eyes with small black pupils, small rounded ears, short simple brown hair, thick eyebrows, slim small upright body, white collared shirt, navy blazer, dark trousers, clean black outlines, flat colors, light soft shading, squeezed between two oversized red bill shapes closing in from left and right, trapped but understandable expression, soft neutral background, simple readable composition, no subtitles, no captions, no narration text, no long readable text, no photorealism, no 3D, 16:9 composition."

Script:
"A rent increase does not feel inconvenient. It feels personal."

Prompt style:
"Consistent clean 2D cartoon finance explainer style, main host scene, main recurring finance host from the shared Wealth Insights character universe, with an oversized cartoon head, narrow forehead area, broad lower face, cleft chin with a visible central crease, clean-shaven face, heavy jaw and cheek area, no visible neck, head directly attached to the shirt collar, simple rounded cartoon nose, wide white cartoon eyes with small black pupils, small rounded ears, short simple brown hair, thick eyebrows, slim small upright body, white collared shirt, navy blazer, dark trousers, clean black outlines, flat colors, light soft shading, standing beside a stressed renter from the same Wealth Insights cartoon family, oversized rent notice leaning toward both characters, the host looks concerned and gestures toward the notice, soft neutral background, simple readable composition, no subtitles, no captions, no narration text, no long readable text, no photorealism, no 3D, 16:9 composition."

Script:
"They do not choose badly because they are stupid."

Prompt style:
"Consistent clean 2D cartoon finance explainer style, main host scene, main recurring finance host from the shared Wealth Insights character universe, with an oversized cartoon head, narrow forehead area, broad lower face, cleft chin with a visible central crease, clean-shaven face, heavy jaw and cheek area, no visible neck, head directly attached to the shirt collar, simple rounded cartoon nose, wide white cartoon eyes with small black pupils, small rounded ears, short simple brown hair, thick eyebrows, slim small upright body, white collared shirt, navy blazer, dark trousers, clean black outlines, flat colors, light soft shading, standing beside a stressed person from the same Wealth Insights cartoon family and pushing away a large red accusing finger crossed out with an X, the accused person is protected from blame while a heavy red pressure weight shows the real cause, reassuring serious expression, soft neutral background, simple readable composition, no subtitles, no captions, no narration text, no long readable text, no photorealism, no 3D, 16:9 composition."

Script:
"When you have no cushion, every choice becomes urgent."

Prompt style:
"Consistent clean 2D cartoon finance explainer style, main host scene, main recurring finance host from the shared Wealth Insights character universe, with an oversized cartoon head, narrow forehead area, broad lower face, cleft chin with a visible central crease, clean-shaven face, heavy jaw and cheek area, no visible neck, head directly attached to the shirt collar, simple rounded cartoon nose, wide white cartoon eyes with small black pupils, small rounded ears, short simple brown hair, thick eyebrows, slim small upright body, white collared shirt, navy blazer, dark trousers, clean black outlines, flat colors, light soft shading, standing beside a stressed person being pushed by a huge urgent clock toward a red bad option labeled BAD LOAN, while an empty green shield outline labeled BUFFER blocks the safer path, tense worried expression, soft neutral background, simple readable composition, no subtitles, no captions, no narration text, no long readable text, no photorealism, no 3D, 16:9 composition."

Script:
"But it changes how every decision feels."

Prompt style:
"Consistent clean 2D cartoon finance explainer style, main host scene, main recurring finance host from the shared Wealth Insights character universe, with an oversized cartoon head, narrow forehead area, broad lower face, cleft chin with a visible central crease, clean-shaven face, heavy jaw and cheek area, no visible neck, head directly attached to the shirt collar, simple rounded cartoon nose, wide white cartoon eyes with small black pupils, small rounded ears, short simple brown hair, thick eyebrows, slim small upright body, white collared shirt, navy blazer, dark trousers, clean black outlines, flat colors, light soft shading, standing between two large branching paths, one red path with an oversized bill icon and one green path with a shield icon, the branching paths are the dominant explanatory element, thoughtful expression, soft neutral background, simple readable composition, no subtitles, no captions, no narration text, no long readable text, no photorealism, no 3D, 16:9 composition."

---

## Final Quality Check

Before finalizing an imagePrompt, check:

- Does the prompt include "main host scene"?
- Does every scene include the main host by default?
- Does the main host use the final tested descriptor?
- Does the host have an oversized cartoon head?
- Does the host have a narrow forehead area?
- Does the host have a broad lower face?
- Does the host have a cleft chin with a visible central crease?
- Is the host clean-shaven?
- Did we avoid facial hair, beard, and mustache?
- Does the host have a heavy jaw and cheek area?
- Does the host have no visible neck?
- Is the head directly attached to the shirt collar?
- Does the host have a simple rounded cartoon nose?
- Does the host have wide white cartoon eyes with small black pupils?
- Does the host keep short simple brown hair and thick eyebrows?
- Does the scene have one dominant explanatory element?
- Is the dominant element concrete and instantly recognizable?
- Did we avoid vague phrases like "blame symbol", "cushion symbol", or "decision sign"?
- Does the image show the mechanism, consequence, emotional action, or decision pressure in the scriptText?
- Did we avoid a visualIdea that is only a related decorative symbol?
- If the scriptText contains cause and effect, does the image show that cause and effect in one simple composition?
- Is the dominant explanatory element directly connected to the narration beat?
- Is the host visually connected to the dominant element?
- Are supporting elements optional and useful, not decorative?
- Are there too many objects competing for attention?
- If another character appears, does the host still appear?
- If another character appears, does that character belong to the same Wealth Insights cartoon family?
- Does the image avoid subtitles, captions, narration text, and long readable text?
- Does the image avoid photorealism and 3D?
- Is the visual idea understandable in under one second?
- Did we avoid reintroducing insert-layout rules or old category complexity?
- Did we avoid adding new JSON fields?
