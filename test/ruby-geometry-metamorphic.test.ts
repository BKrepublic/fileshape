import assert from "node:assert/strict";
import test from "node:test";
import { associateRubySpans } from "../src/ruby-spans.js";
import { glyphPage, rubyRuns, type Run } from "./glyph-fixtures.js";

function cloneRuns(runs: Run[]): Run[] {
  return runs.map((run) => ({
    ...run,
    chars: [...run.chars],
    advances: [...run.advances],
  }));
}

function exactBaseRanges(runs: Run[], rotation = 0, scale = 1) {
  const span = associateRubySpans(glyphPage(runs, rotation, scale), 14)[0];
  assert.equal(span?.status, "exact");
  return span.baseSourceRanges;
}

test("small coordinate jitter preserves exact ruby source spans across orientation and rotation", () => {
  for (const vertical of [true, false]) {
    for (const rotation of [0, 90, 180, 270]) {
      const baseline = rubyRuns(vertical);
      const expected = exactBaseRanges(baseline, rotation);
      const perturbed = cloneRuns(baseline);
      perturbed[0]!.x += 0.25;
      perturbed[0]!.y -= 0.3;
      perturbed[1]!.x -= 0.2;
      perturbed[1]!.y += 0.35;

      assert.deepEqual(exactBaseRanges(perturbed, rotation), expected);
    }
  }
});

test("small measured advance perturbations preserve exact source selection", () => {
  for (const vertical of [true, false]) {
    const baseline = rubyRuns(vertical);
    const expected = exactBaseRanges(baseline);
    const perturbed = cloneRuns(baseline);
    perturbed[0]!.advances = [14.2, 13.8];
    perturbed[1]!.advances = [6.8, 7.15, 7.05];

    assert.deepEqual(exactBaseRanges(perturbed), expected);
  }
});

test("coordinate jitter remains scale-invariant", () => {
  const baseline = rubyRuns();
  const expected = exactBaseRanges(baseline);
  const perturbed = cloneRuns(baseline);
  perturbed[0]!.x += 0.2;
  perturbed[0]!.y -= 0.25;
  perturbed[1]!.x -= 0.15;
  perturbed[1]!.y += 0.3;

  for (const scale of [0.5, 1, 3]) {
    assert.deepEqual(exactBaseRanges(perturbed, 270, scale), expected);
  }
});

test("cross-axis perturbations beyond the accepted ruby window remain unresolved", () => {
  for (const vertical of [true, false]) {
    const tooNear = cloneRuns(rubyRuns(vertical));
    const tooFar = cloneRuns(rubyRuns(vertical));

    if (vertical) {
      tooNear[1]!.x = 206;
      tooFar[1]!.x = 220;
    } else {
      tooNear[1]!.y = 94;
      tooFar[1]!.y = 80;
    }

    assert.equal(associateRubySpans(glyphPage(tooNear), 14)[0]?.status, "unresolved");
    assert.equal(associateRubySpans(glyphPage(tooFar), 14)[0]?.status, "unresolved");
  }
});
