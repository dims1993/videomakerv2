import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  slugifyChannelKey,
  validateChannelKey,
} from "@/lib/channel-key";
import { scaffoldNewChannel } from "@/lib/channel-scaffold";

test("slugifyChannelKey normalizes names", () => {
  assert.equal(slugifyChannelKey("My Cool Channel!"), "my-cool-channel");
});

test("validateChannelKey rejects invalid keys", () => {
  assert.throws(() => validateChannelKey("1bad"));
  assert.doesNotThrow(() => validateChannelKey("good-channel"));
});

test("scaffoldNewChannel writes files and registry entry", async () => {
  const previousCwd = process.cwd();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "videomaker-channel-"));
  process.chdir(tempRoot);

  try {
    const profile = await scaffoldNewChannel(
      {
        name: "Focus Lab",
        key: "focus-lab",
        description: "Practical focus habits for busy professionals.",
        pipelineMode: "full",
        audience: "busy professionals",
        niche: "focus and deep work",
        categoryLabel: "Focus",
      },
      { builtinKeys: new Set(["wealth-insights"]) },
    );

    assert.equal(profile.key, "focus-lab");
    assert.equal(profile.topicSystem?.enabled, true);

    const projectBible = await readFile(profile.projectBiblePath, "utf8");
    assert.match(projectBible, /Focus Lab/);

    const registry = await readFile(
      "data/channels/custom-channels.json",
      "utf8",
    );
    assert.match(registry, /"key": "focus-lab"/);
  } finally {
    process.chdir(previousCwd);
    await rm(tempRoot, { recursive: true, force: true });
  }
});
