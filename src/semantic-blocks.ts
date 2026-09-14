import type { PhysicalPageLayout, PhysicalTextUnit } from "./physical-layout.js";
import {
  estimateNormalSpacing,
  paragraphGapThreshold,
  type SpacingEstimateSource,
} from "./spacing-evidence.js";
import type { SourceTextRef } from "./source-text.js";

export type SemanticBlockKind = "text";

export type SemanticBlock = {
  index: number;
  kind: SemanticBlockKind;
  unitIndexes: number[];
  text: string;
  sourceRanges?: SourceTextRef[];
};

export type SemanticBoundaryDecision = {
  fromUnit: number;
  toUnit: number;
  gap: number;
  normalGap: number;
  normalGapSource: SpacingEstimateSource;
  normalGapSampleCount: number;
  gapRatio: number;
  previousEndRatio: number;
  nextStartRatio: number;
  join: boolean;
  reason: "physical-wrap" | "large-gap" | "independent-unit";
};

export type SemanticPageBlocks = {
  blocks: SemanticBlock[];
  decisions: SemanticBoundaryDecision[];
  text: string;
};

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function gapBetween(layout: PhysicalPageLayout, fromUnit: number, toUnit: number): number {
  return (
    layout.gaps.find((gap) => gap.fromUnit === fromUnit && gap.toUnit === toUnit)?.distance ?? 0
  );
}

/**
 * Geometry-only evidence that one physical text run reached the page edge and
 * the next begins near the reading-axis start. Shared by same-page wrap and
 * cross-page reflow so serialization never has to inspect language content.
 */
export function hasContinuationEdgeGeometry(
  previousEndRatio: number,
  previousCoverageRatio: number,
  nextStartRatio: number,
): boolean {
  return previousEndRatio >= 0.78 && previousCoverageRatio >= 0.5 && nextStartRatio <= 0.32;
}

function looksLikePhysicalWrap(
  previous: PhysicalTextUnit,
  current: PhysicalTextUnit,
  gap: number,
  normalGap: number,
  bodyFontSize: number,
): boolean {
  if (normalGap <= 0) return false;

  const nearNormalGap =
    gap <= Math.max(normalGap * 1.35, normalGap + Math.max(2, bodyFontSize * 0.35));

  // A true physical wrap normally consumes most of the previous line/column,
  // then restarts near the beginning of the next one. This is deliberately
  // conservative: short adjacent units are preserved as separate blocks.
  return nearNormalGap && hasContinuationEdgeGeometry(
    previous.inlineEndRatio,
    previous.inlineCoverageRatio,
    current.inlineStartRatio,
  );
}

function appendUnit(block: SemanticBlock, unit: PhysicalTextUnit): void {
  block.unitIndexes.push(unit.index);
  block.text += unit.text;
  block.sourceRanges = [...(block.sourceRanges ?? []), ...(unit.sourceRanges ?? []).map((ref) => ({ ...ref }))];
}

export function buildSemanticBlocks(
  layout: PhysicalPageLayout,
  bodyFontSize: number,
): SemanticPageBlocks {
  if (layout.units.length === 0) {
    return { blocks: [], decisions: [], text: "" };
  }

  const spacing = estimateNormalSpacing(
    layout.gaps.map((gap) => gap.distance),
    bodyFontSize,
  );
  const normalGap = spacing.normal;
  const blocks: SemanticBlock[] = [];
  const decisions: SemanticBoundaryDecision[] = [];

  const first = layout.units[0];
  if (!first) return { blocks: [], decisions: [], text: "" };

  let currentBlock: SemanticBlock = {
    index: 0,
    kind: "text",
    unitIndexes: [first.index],
    text: first.text,
    sourceRanges: (first.sourceRanges ?? []).map((ref) => ({ ...ref })),
  };
  blocks.push(currentBlock);

  for (let index = 1; index < layout.units.length; index += 1) {
    const previous = layout.units[index - 1];
    const current = layout.units[index];
    if (!previous || !current) continue;

    const gap = gapBetween(layout, previous.index, current.index);
    const gapRatio = normalGap > 0 ? gap / normalGap : 1;
    const wrap = looksLikePhysicalWrap(previous, current, gap, normalGap, bodyFontSize);
    const largeGap = gap > paragraphGapThreshold(normalGap, bodyFontSize);

    const join = wrap && !largeGap;
    const reason: SemanticBoundaryDecision["reason"] = join
      ? "physical-wrap"
      : largeGap
        ? "large-gap"
        : "independent-unit";

    decisions.push({
      fromUnit: previous.index,
      toUnit: current.index,
      gap: round(gap, 2),
      normalGap: round(normalGap, 2),
      normalGapSource: spacing.source,
      normalGapSampleCount: spacing.sampleCount,
      gapRatio: round(gapRatio, 3),
      previousEndRatio: round(previous.inlineEndRatio, 4),
      nextStartRatio: round(current.inlineStartRatio, 4),
      join,
      reason,
    });

    if (join) {
      appendUnit(currentBlock, current);
      continue;
    }

    currentBlock = {
      index: blocks.length,
      kind: "text",
      unitIndexes: [current.index],
      text: current.text,
      sourceRanges: (current.sourceRanges ?? []).map((ref) => ({ ...ref })),
    };
    blocks.push(currentBlock);
  }

  return {
    blocks,
    decisions,
    text: blocks.map((block) => block.text).join("\n"),
  };
}
