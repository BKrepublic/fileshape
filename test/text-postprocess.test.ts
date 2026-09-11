import assert from "node:assert/strict";
import test from "node:test";
import { applyConsecutiveLineBreakPolicy } from "../src/text-postprocess.js";

test("preserves consecutive line breaks by default policy", () => {
  const source = "本文1\n\n\n\n本文2";
  assert.equal(applyConsecutiveLineBreakPolicy(source, { mode: "preserve" }), source);
});

test("caps consecutive line breaks at two when requested", () => {
  const source = "本文1\n\n\n\n本文2";
  assert.equal(
    applyConsecutiveLineBreakPolicy(source, {
      mode: "cap",
      maxConsecutiveLineBreaks: 2,
    }),
    "本文1\n\n本文2",
  );
});

test("does not collapse ordinary single line breaks", () => {
  const source = "本文1\n本文2";
  assert.equal(
    applyConsecutiveLineBreakPolicy(source, {
      mode: "cap",
      maxConsecutiveLineBreaks: 2,
    }),
    source,
  );
});
