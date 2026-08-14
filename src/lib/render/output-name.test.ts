import assert from "node:assert/strict";
import { test } from "node:test";

import {
  renderFinalVideoBaseName,
  renderFinalVideoFileName,
} from "./output-name";

test("renderFinalVideoBaseName slugifies title", () => {
  assert.equal(
    renderFinalVideoBaseName("Video Sobre Amor"),
    "video-sobre-amor",
  );
  assert.equal(
    renderFinalVideoBaseName("Bigger Apartment vs Smaller Apartment: The Cost Nobody Calculates"),
    "bigger-apartment-vs-smaller-apartment-the-cost-nobody-calculates",
  );
  assert.equal(renderFinalVideoFileName("Hello World"), "hello-world.mp4");
  assert.equal(renderFinalVideoBaseName("   "), "video");
});
