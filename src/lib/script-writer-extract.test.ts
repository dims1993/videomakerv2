import assert from "node:assert/strict";
import { test } from "node:test";

import { extractScriptFromResponse } from "@/lib/script-writer-extract";

test("extractScriptFromResponse keeps plain narration", () => {
  const script = extractScriptFromResponse(
    [
      "There is a quiet moment most people overlook.",
      "",
      "It begins with something smaller than a dramatic decision.",
      "",
      "And once you see that mechanism, the story changes.",
    ].join("\n"),
  );

  assert.match(script, /quiet moment/);
  assert.match(script, /story changes/);
});

test("extractScriptFromResponse unwraps fenced narration and lead-in", () => {
  const script = extractScriptFromResponse(`Here is the final script:

\`\`\`
There is a quiet moment most people overlook when they think about mercy.

It does not begin with a dramatic decision. It begins with something smaller.
\`\`\`
`);

  assert.doesNotMatch(script, /Here is the final script/i);
  assert.doesNotMatch(script, /```/);
  assert.match(script, /quiet moment/);
});

test("extractScriptFromResponse unwraps {script} JSON envelopes", () => {
  const script = extractScriptFromResponse(
    JSON.stringify({
      script: "[INTRO]\n\n[EMMA]\nHello.\n\n[LESSON]\n\n[PART 1 - HI]\n\n[LEO]\nHi.\n\n[CLOSING]\n\n[EMMA]\nBye.\n\n[FINAL]\n\n[EMMA]\nThanks.",
    }),
  );
  assert.match(script, /^\[INTRO\]/);
  assert.doesNotMatch(script, /"script"/);
  assert.match(script, /\[FINAL\]/);
});

test("extractScriptFromResponse unwraps revisedNarrationScript envelopes", () => {
  const script = extractScriptFromResponse(
    JSON.stringify({
      revisedNarrationScript:
        "The moving truck is already gone, the keys are on the counter, and the new apartment looks like a win.\n\nOn paper the upgrade made sense.",
    }),
  );
  assert.match(script, /^The moving truck/);
  assert.doesNotMatch(script, /revisedNarrationScript/);
  assert.match(script, /upgrade made sense/);
});

test("extractScriptFromResponse rejects score JSON", () => {
  assert.throws(
    () =>
      extractScriptFromResponse(
        JSON.stringify({
          score: 9.0,
          briefReason: "Too long.",
        }),
      ),
    /score\/critique JSON/i,
  );
});

test("extractScriptFromResponse accepts Max & Sara plain podcast scripts", () => {
  const script = extractScriptFromResponse(
    [
      "[INTRO]",
      "",
      "[MAX]",
      "Sara, I opened the group chat.",
      "",
      "[SARA]",
      "And the plan got less clear?",
      "",
      "[LESSON]",
      "",
      "[PART 1 - THE SPIRAL]",
      "",
      "[MAX]",
      "That is the Group Chat Spiral.",
      "",
      "[CLOSING]",
      "",
      "[SARA]",
      "Write one short sentence in the comments.",
      "",
      "[FINAL]",
      "",
      "[MAX]",
      "Thanks for listening. See you in the next conversation.",
      "",
      "[SARA]",
      "Bye for now.",
    ].join("\n"),
  );

  assert.match(script, /^\[INTRO\]/);
  assert.match(script, /\[MAX\]/);
  assert.match(script, /\[SARA\]/);
  assert.match(script, /Bye for now/);
  assert.doesNotMatch(script, /"script"/);
});

test("looksLikeNarrationScript recognizes Max & Sara speaker tags", async () => {
  const { looksLikeNarrationScript } = await import(
    "@/lib/script-writer-extract"
  );
  assert.equal(
    looksLikeNarrationScript(
      "[MAX]\nThanks for listening. See you in the next conversation.\n\n[SARA]\nBye for now.",
    ),
    true,
  );
});
