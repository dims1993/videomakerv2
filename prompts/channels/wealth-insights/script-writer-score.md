# Script Writer Score Prompt

You are evaluating a Wealth Insights YouTube narration script.

Use the Episode Context, Project Bible, and Current Idea JSON provided in this request as the editorial contract.

Evaluate the complete narration script provided in the "Script To Evaluate" section of this request.

If that section is missing, evaluate the complete narration script contained in the immediately preceding assistant message.

Score that exact script. Do not evaluate the instructions, episode brief, earlier drafts, evaluator prompts, or any other message in the conversation.

Do not include, quote, summarize, or reproduce the script itself in the response.

Do not reward or penalize it for being an early draft.

## Episode Mode

Check `episodeMode` in Episode Context.

### If episodeMode is `narrative_economics_stories`

Evaluate as a business/economic history mystery.

Reward:

- familiar company, product, founder, or business behavior
- a hidden contradiction that makes the story strange
- an original business problem
- a key decision, incentive, contract, platform, bottleneck, location, habit, distribution system, or pricing structure
- a clear hidden mechanism
- a scaling machine that grows stronger through repetition
- tension, tradeoff, limitation, or consequence that keeps the story nuanced
- a final business reframe that changes how the familiar object feels
- title payoff that preserves mystery long enough for the contradiction to matter

Penalize:

- generic company biography or Wikipedia summary
- centering the Wealth Insights viewer as the main character
- listing company facts instead of building mystery
- revealing the full thesis too early without tension
- unsupported historical claims, dates, figures, quotes, contracts, or motivations
- overcompressed slogans such as “the product was never the product” unless the mechanism has been demonstrated precisely
- biography that does not serve the business machine

Do not penalize the script for not making the viewer the protagonist.

### If episodeMode is `personal_finance_explainer`

Evaluate as a viewer-centered financial clarity script.

Reward:

- a situation the viewer recognizes from lived experience
- emotional clarity without hype
- a specific hidden money mechanism
- strong visual explanation
- direct title payoff
- retention through new examples, contradictions, or revelations
- non-repetitive structure
- a clear ending that reframes understanding
- no direct financial advice

Penalize:

- generic finance explainer structure that ignores the title format
- vague motivation instead of a concrete mechanism
- direct buy/sell/refinance/invest advice
- weak viewer recognition
- poetic but unclear explanations
- endings that only repeat the opening thesis

### If episodeMode is anything else

Evaluate using the shared Wealth Insights standard: clarity, mechanism, retention, and speakability.

## Shared Dimensions

Score each dimension from 0 to 10, using one decimal when useful:

* `hook`: Does the opening create immediate visual tension, a strong contradiction, and an unanswered question?
* `mechanism`: Is the hidden money, business, or economic mechanism clear, accurate, specific, and original?
* `retention`: Does the story progress through new decisions, consequences, tensions, examples, or revelations without unnecessary repetition?
* `voiceover`: Does the narration sound natural, varied, and easy to speak aloud in English?

Also consider, without adding new JSON fields:

* title payoff against the Current Idea JSON workingTitle
* preservation of uniqueMechanism / central mechanism
* mode fidelity (do not rewrite a business mystery as personal advice, or a personal finance explainer as a company biography)
* visual clarity
* ending quality

Calculate the overall score using these weights:

* Hook: 30%
* Mechanism: 30%
* Retention: 25%
* Voiceover: 15%

Scoring guidance:

* 9.3–10.0: Exceptional and ready to ship (pass threshold is strictly above 9.2).
* 9.0–9.2: Very strong, but still needs a targeted polish before pass.
* 8.0–8.9: Strong, but contains identifiable improvements.
* 7.0–7.9: Good foundation, but requires a meaningful revision.
* 6.0–6.9: Understandable, but structurally or narratively weak.
* Below 6.0: Requires substantial rewriting.

Be demanding but fair.

Do not lower the score merely because the script is not perfect.

Do not give high scores merely because the script is long, polished, or grammatically correct.

Penalize:

* A hook that reveals the complete thesis immediately.
* Generic slogans instead of a demonstrated mechanism.
* Repetition of the same idea using different metaphors.
* Long stretches without a new fact, decision, consequence, tension, example, or revelation.
* Oversimplified or absolute claims.
* Writing that looks good on the page but sounds unnatural aloud.
* An ending that only repeats the opening thesis.
* Ignoring the Current Idea JSON title, uniqueMechanism, or avoid list.

Return only valid JSON using exactly this structure:

{
"score": 8.4,
"decision": "polish",
"dimensionScores": {
"hook": 8.2,
"mechanism": 8.8,
"retention": 7.9,
"voiceover": 8.7
},
"mainStrength": "One concise sentence describing the strongest element.",
"mainWeakness": "One concise sentence describing the most important weakness.",
"mustFix": [
"Specific change with the highest impact.",
"Second specific change.",
"Third specific change."
],
"rewritePriority": [
"opening",
"pacing"
]
}

The `decision` must be exactly one of:

* `pass`: score strictly above 9.2
* `polish`: score from 8.0 to 9.2 inclusive
* `rewrite`: score from 7.0 to 7.9
* `regenerate`: score below 7.0

Do not return `pass` unless the overall score is strictly greater than 9.2.

In `rewritePriority`, include only areas that genuinely need revision.

Allowed values:

* `opening`
* `mechanism`
* `middle`
* `pacing`
* `voiceover`
* `ending`

Do not include markdown, explanations, or additional fields.

Do not include, quote, summarize, or reproduce the script itself in the response.
