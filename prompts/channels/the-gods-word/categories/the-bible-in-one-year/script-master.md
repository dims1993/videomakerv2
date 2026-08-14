# MASTER SCRIPT TEMPLATE — THE BIBLE IN ONE YEAR

## OBJECTIVE

Generate a complete English script for one episode of the YouTube series The Bible in One Year.

The main purpose is to help the listener complete the Bible in one year through a simple, manageable daily reading.

The script must feel warm, peaceful, encouraging, and easy to follow, especially for an American audience over 65 years old.

The Bible reading is the main content. The introduction, reflection, prayer, and closing must remain brief.

Do not include production notes, explanations, citations, markdown headings, or commentary outside the final script.

---

## INPUT VARIABLES

DAY_NUMBER:
{{DAY_NUMBER}}

JOURNEY_ACTION:
{{JOURNEY_ACTION}}
Possible values:
- begin
- continue

TODAY_READING_DISPLAY:
{{TODAY_READING_DISPLAY}}

NEXT_READING_DISPLAY:
{{NEXT_READING_DISPLAY}}

LISTENING_FOCUS:
{{LISTENING_FOCUS}}

CHAPTER_BLOCKS:
{{CHAPTER_BLOCKS}}

Each chapter block contains:

- BOOK_NAME: Normal capitalization, such as Genesis or Matthew.
- BOOK_NAME_UPPERCASE: Uppercase, such as GENESIS or MATTHEW.
- CHAPTER_NUMBER: Numeric chapter.
- WEBUS_TEXT: Optional exact chapter text from the World English Bible, American English Edition. If empty, use authentic WEBUS for that book/chapter only.

REFLECTION_MAIN_THOUGHT:
{{REFLECTION_MAIN_THOUGHT}}

REFLECTION_APPLICATION:
{{REFLECTION_APPLICATION}}

PRAYER_POINTS:
{{PRAYER_POINTS}}

---

## NON-NEGOTIABLE STRUCTURE

The script must use only these section labels:

[INTRODUCTION]

[CHAPTER COVER — BOOK CHAPTER]

[REFLECTION AND PRAYER]

[CLOSING]

These labels are structural markers for the Visual Planner. They mark where a **cover scene with spoken voiceover** begins. Do not read the brackets aloud. Do not write the bracket text into narration.

Create one chapter-cover label for every chapter in CHAPTER_BLOCKS.

The chapter labels must follow this exact format:

[CHAPTER COVER — {{BOOK_NAME_UPPERCASE}} {{CHAPTER_NUMBER}}]

Do not create verse labels.

Do not create extra sections.

Do not add subtitles to the chapter labels.

Immediately after each label, write the spoken opener that the cover will voice:

- After `[INTRODUCTION]`, start with the spoken series title line, then continue the introduction.
- After `[CHAPTER COVER — …]`, start with the natural chapter announcement (`{{BOOK_NAME}}, chapter {{CHAPTER_NUMBER}}.`); that announcement is the cover voiceover.
- After `[REFLECTION AND PRAYER]`, start with the reflection transition line (this becomes the reflection parchment cover), then continue.
- After `[CLOSING]`, start with the thank-you line. `[CLOSING]` is segmentation only — it must not become a cover scene.

---

## SCRIPTURE READING RULES

1. Prefer the exact WEBUS text supplied in each chapter block when `WEBUS_TEXT` is present and non-empty.
2. If `WEBUS_TEXT` is empty or missing for a chapter, retrieve and use the authentic World English Bible, American English Edition (WEBUS) text for that exact book and chapter only.
3. Never paraphrase, summarize, modernize, shorten, correct, or invent Bible wording.
4. Never mix another translation (KJV, NIV, ESV, NLT, etc.) into the reading.
5. Preserve the original verse order.
6. Preserve all dialogue, poetry, punctuation, and paragraph meaning.
7. Do not announce verse numbers.
8. Before each chapter text, announce it naturally:

{{BOOK_NAME}}, chapter {{CHAPTER_NUMBER}}.

9. Do not interrupt the Bible reading with explanations or commentary.
10. Do not add transitions between verses.
11. After one chapter finishes, move directly to the next chapter-cover label.
12. Only use the chapters listed in CHAPTER_BLOCKS. Do not add extra chapters, verses, or books.
13. If you are unsure of the exact WEBUS wording for a supplied chapter, do not invent filler. Reproduce the authentic WEBUS chapter text for that reference as faithfully as possible.

---

## INTRODUCTION RULES

The introduction should normally be between 110 and 160 words.

It must:

- Welcome the listener warmly.
- Mention the current day number.
- Express that the journey is being completed together.
- Present the daily reading as simple and manageable.
- Reduce pressure: the listener does not need to understand everything at once or complete the journey perfectly.
- Encourage the listener to return one day at a time.
- Explain that carrying away one applicable thought already makes the reading worthwhile.
- Mention the Bible version.
- Announce today's reading.
- Introduce one listening focus.
- End exactly with: Let us begin.

Use this structure:

[INTRODUCTION]

The Bible in One Year — Day {{DAY_NUMBER}}.

Welcome to Day {{DAY_NUMBER}} of The Bible in One Year.

I'm truly glad you are here as we {{JOURNEY_ACTION}} this journey through God's Word together.

Through this series, we are walking through the Bible one day at a time, with a simple and manageable daily reading. You do not need to understand everything at once or complete this journey perfectly. Simply listen, receive what God's Word has for you today, and return for the next reading.

And if, after today's reading, you can carry with you just one thought that speaks to your life, then the time we have spent together will already have been worthwhile.

Our readings come from the World English Bible, American English Edition, also known as the WEBUS.

Today, we will read {{TODAY_READING_DISPLAY}}.

As you listen, {{LISTENING_FOCUS}}.

Let us begin.

---

## CHAPTER BLOCK TEMPLATE

Repeat this complete block once for every item in CHAPTER_BLOCKS, preserving the supplied order:

[CHAPTER COVER — {{BOOK_NAME_UPPERCASE}} {{CHAPTER_NUMBER}}]

{{BOOK_NAME}}, chapter {{CHAPTER_NUMBER}}.

{{WEBUS_TEXT}}

Do not place additional labels or commentary inside a chapter block.

---

## REFLECTION AND PRAYER RULES

The full reflection-and-prayer section should normally contain between 170 and 250 words.

The reflection should:

- Begin exactly with: You've completed today's reading. Well done. Now let's take a little time to reflect and pray.
- Focus on one central truth from the assigned reading.
- Briefly connect the reading with the listener's life.
- Be understandable without theological jargon.
- Avoid trying to explain every chapter.
- Avoid denominational controversy.
- Avoid introducing unrelated passages or teachings.
- Encourage the listener to carry one thought into daily life.
- Last approximately 45 to 75 seconds.

The prayer should:

- Begin exactly with: Pray with me.
- Address God as Father.
- Arise directly from the reading and reflection.
- Use simple, sincere, pastoral language.
- Include the ideas supplied in PRAYER_POINTS.
- Last approximately 40 to 60 seconds.
- End exactly with: In Jesus' name, amen.

Use this structure:

[REFLECTION AND PRAYER]

You've completed today's reading. Well done. Now let's take a little time to reflect and pray.

{{A_BRIEF_REFLECTION_BASED_ON_REFLECTION_MAIN_THOUGHT}}

{{A_SIMPLE_PERSONAL_APPLICATION_BASED_ON_REFLECTION_APPLICATION}}

Pray with me.

Father,

{{A_BRIEF_PRAYER_BASED_ON_THE_READING_AND_PRAYER_POINTS}}

In Jesus' name, amen.

---

## CLOSING RULES

The closing should be generic enough for someone listening in the morning, afternoon, or before sleeping.

`[CLOSING]` is a Visual Planner segmentation marker only. It must not be read aloud and must not become a cover title.

It must keep these five independent spoken beats (never merge them into one paragraph):

1. Thank you for joining Day {{DAY_NUMBER}} of The Bible in One Year.
2. To mark your progress, comment "Day {{DAY_NUMBER}} complete" below.
3. If one verse or thought stayed with you, you are welcome to share it.
4. We will continue with {{NEXT_READING_DISPLAY}}.
5. May God's Word remain with you.

Then end with the plain bumper marker (not spoken):

[FINAL]

Use this exact structure:

[CLOSING]

Thank you for joining Day {{DAY_NUMBER}} of The Bible in One Year.

To mark your progress, comment "Day {{DAY_NUMBER}} complete" below.

If one verse or thought stayed with you, you are welcome to share it.

We will continue with {{NEXT_READING_DISPLAY}}.

May God's Word remain with you.

[FINAL]

---

## STYLE RULES

- Write in natural American English.
- Use a warm, calm, personal, and pastoral voice.
- Prefer short and clear sentences.
- Speak to one listener rather than addressing a crowd.
- Avoid academic or technical language.
- Avoid exaggerated emotional claims.
- Avoid guilt-based motivation.
- Do not sound like a sermon during the Bible reading.
- Do not make the introduction overly promotional.
- Do not ask the listener to like or subscribe.
- Do not mention the time of day.
- Do not add emojis.
- Do not use markdown formatting in the output.
- Preserve curly quotation marks when appropriate.
- Keep the non-Bible sections concise so the episode remains focused on Scripture.

---

## OUTPUT CONTRACT

Return only the complete finished script.

The output must begin with:

[INTRODUCTION]

The output must end with:

[FINAL]

(after the spoken closing line `May God's Word remain with you.`)

Do not include placeholder names in the final script.

Do not include this instruction document in the output.
