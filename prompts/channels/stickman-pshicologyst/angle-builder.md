# Angle Builder

## 1. Principle

This channel does not primarily use cinematic camera language.

It behaves more like a **visual whiteboard**.

Therefore, "angle" should mean:

```text
composition
+
scale
+
spatial relationship
+
information hierarchy
```

not:

```text
lens
depth of field
dramatic lighting
cinematic camera movement
```

---

## 2. Shot scale library

### S1 — Icon / object close concept

Frame dominated by one object.

Use for:
- phone;
- clock;
- battery;
- checklist;
- question;
- calendar.

### S2 — Character close/medium

Character dominates.

Use for:
- realization;
- hesitation;
- emotional response;
- direct internal choice.

### S3 — Character + prop

Most useful general shot.

Examples:
- character + laptop;
- character + phone;
- character + book;
- character + couch.

### S4 — Full-body action

Use when body movement carries meaning.

Examples:
- walking;
- pushing;
- climbing;
- reaching;
- putting on shoes.

### S5 — Environmental metaphor

Character small, metaphor large.

Examples:
- giant mountain;
- long staircase;
- large pile of work.

### S6 — Diagram view

Multiple mini-elements or panels.

Use for:
- sequence;
- comparison;
- if/then;
- before/after.

---

## 3. Layout library

### L01 — Hero Concept

```text
       [symbol/thought]

            ○
           /|\
           / \
```

Use for:
- opening idea;
- single emotional state;
- simple claim.

---

### L02 — Character + Object

```text
     ○        [OBJECT]
    /|\   →
    / \
```

Use for:
- behavior;
- temptation;
- task.

---

### L03 — Before / After

```text
[BEFORE]      →      [AFTER]
```

Use for:
- habit change;
- environment redesign;
- restart;
- progress.

---

### L04 — Bad / Better Split

```text
BAD            BETTER
 ✕               ✓
```

Use for:
- contrast;
- common mistake;
- recommended alternative.

Keep both sides visually symmetrical.

---

### L05 — Cause → Effect

```text
[CUE] → [ACTION] → [RESULT]
```

Use for:
- behavioral loops;
- reward ordering;
- distraction loops;
- if/then plans.

---

### L06 — Sequential Strip

```text
1 → 2 → 3 → 4
```

Use for:
- micro-story;
- routine;
- multi-step behavior.

Limit to four stages.

---

### L07 — Central Character + Satellites

```text
         object
           |
object — person — object
           |
         object
```

Use for:
- competing demands;
- distractions;
- choices;
- thought overload.

---

### L08 — Dominant Metaphor

```text
          FLAG
           ⚑
        /     \
      /         \
   tiny person
```

Use for:
- difficulty;
- progress;
- long-term goal;
- effort.

---

### L09 — Visual Equation

```text
A + B = C
```

or:

```text
CUE → ROUTINE → REWARD
```

Use for:
- mechanism;
- concise explanation.

---

### L10 — Chapter Card

Text-dominant white frame.

Use at the start of numbered sections when a reset is useful.

---

## 4. Composition decision tree

### Step 1
Is the narration a literal visible action?

If yes:
```text
use L02 or S4
```

### Step 2
Is it comparing two behaviors?

If yes:
```text
use L03 or L04
```

### Step 3
Is it describing a behavioral mechanism?

If yes:
```text
use L05 or L09
```

### Step 4
Is it describing multiple simultaneous distractions/options?

If yes:
```text
use L07
```

### Step 5
Is the idea abstract and emotional?

If yes:
```text
use L08
```

### Step 6
Is it a numbered section transition?

If yes:
```text
use L10
```

---

## 5. Horizontal placement

Useful anchor positions:

```text
LEFT        20–30%
CENTER      50%
RIGHT       70–80%
```

### Default causal layout

```text
cause on left
effect on right
```

### Default goal layout

```text
character left
goal right
```

### Default temptation layout

If the character should turn away from the goal:

```text
task right
character center
temptation left
```

or mirror consistently.

---

## 6. Vertical placement

The style generally benefits from stable ground-like alignment even when no floor is drawn.

Character feet should usually align around:

```text
70–85% frame height
```

Thought bubbles, symbols and labels occupy upper space.

Avoid placing every object exactly center-screen.

---

## 7. Scale logic

### Emotion important
Make character larger.

### Concept important
Make object/metaphor larger.

### Process important
Make all nodes smaller and evenly weighted.

### Overwhelm
Make problem larger than character.

### Mastery
Make character equal to or larger than obstacle.

---

## 8. Variation algorithm

Do not repeat the same layout more than two consecutive visual beats.

Recommended cycle:

```text
S3 character + prop
→ S1 icon
→ S6 diagram
→ S4 action
→ S5 metaphor
→ S3 character + prop
```

Variation should come from composition, not from changing the visual style.

---

## 9. Angle-builder output schema

For every visual beat, output:

```yaml
shot_scale: S1-S6
layout: L01-L10
subject_position: left | center | right
subject_size: small | medium | large
secondary_position:
screen_direction: left-to-right | right-to-left | static
dominant_shape:
negative_space_target: high
text_zone:
reason:
```

---

## 10. Example

Narration:

```text
Put the difficult activity before the easy reward.
```

Angle Builder:

```yaml
shot_scale: S6
layout: L04
subject_position: center
subject_size: medium
screen_direction: left-to-right
dominant_shape: two parallel sequences
negative_space_target: high
text_zone: top center
reason: compare reward-first and task-first ordering instantly
```

Visual:

```text
BAD:
PHONE → TASK DELAYED

BETTER:
TASK → PHONE/REWARD
```

---

## 11. Reject these "angles"

Unless the visual language changes intentionally, avoid:

- extreme low angle;
- extreme high angle;
- fisheye;
- cinematic close-up;
- Dutch angle;
- shallow depth of field;
- over-the-shoulder realism;
- dramatic perspective distortion.

They add cinema but weaken the whiteboard explainer identity.
