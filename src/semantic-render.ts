import type { ConsecutiveLineBreakPolicy } from "./conversion-options.js";
import type { PhysicalPageLayout } from "./physical-layout.js";
import type { SemanticPageBlocks } from "./semantic-blocks.js";

function lowerQuartile(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((sorted.length - 1) * 0.25);
  return sorted[index] ?? 0;
}

function estimateNormalGap(layout: PhysicalPageLayout): number {
  const positive = layout.gaps.map((gap) => gap.distance).filter((distance) => distance > 0);
  if (positive.length === 0) return 0;
  if (positive.length === 1) return positive[0] ?? 0;
  return lowerQuartile(positive);
}

function gapBetween(layout: PhysicalPageLayout, fromUnit: number, toUnit: number): number {
  return (
    layout.gaps.find((gap) => gap.fromUnit === fromUnit && gap.toUnit === toUnit)?.distance ?? 0
  );
}

function inferredBreakCount(gap: number, normalGap: number): number {
  if (normalGap <= 0 || gap <= 0) return 1;
  return Math.min(20, Math.max(1, Math.round(gap / normalGap)));
}

export function renderSemanticText(
  semantic: SemanticPageBlocks,
  layout: PhysicalPageLayout,
  policy: ConsecutiveLineBreakPolicy,
): string {
  if (semantic.blocks.length === 0) return "";

  const normalGap = estimateNormalGap(layout);
  let output = semantic.blocks[0]?.text ?? "";

  for (let index = 1; index < semantic.blocks.length; index += 1) {
    const previous = semantic.blocks[index - 1];
    const current = semantic.blocks[index];
    if (!previous || !current) continue;

    const previousUnit = previous.unitIndexes.at(-1);
    const currentUnit = current.unitIndexes[0];
    const gap =
      previousUnit === undefined || currentUnit === undefined
        ? 0
        : gapBetween(layout, previousUnit, currentUnit);

    let breaks = inferredBreakCount(gap, normalGap);
    if (policy.mode === "cap") {
      const max = Math.max(1, Math.floor(policy.maxConsecutiveLineBreaks));
      breaks = Math.min(breaks, max);
    }

    output += "\n".repeat(breaks) + current.text;
  }

  return output;
}
