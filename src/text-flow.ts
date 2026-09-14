import {
  emptyAttachedRunEvidence,
  measureAttachedRunEvidence,
  type AttachedRunEvidence,
} from "./attached-run-evidence.js";
import {
  clusterTextItemsByAxis,
  clusterVerticalGlyphColumns,
  glyphSequenceRatios,
  ordinaryCrossAxisTolerance,
  singleCharItemRatio as measureSingleCharItemRatio,
  verticalTextLayoutMode,
} from "./layout-clustering.js";
import type { InspectPage, InspectTextItem } from "./pdf-inspection-model.js";
import {
  decideMetricOrientation,
  type OrientationMetrics,
  type WritingOrientation,
} from "./orientation-decision.js";
import {
  estimateNormalSpacing,
  paragraphGapThreshold,
  type SpacingEstimateSource,
} from "./spacing-evidence.js";
import { collectTextItemEvidence } from "./text-item-evidence.js";

export type { WritingOrientation } from "./orientation-decision.js";

export type FlowGroup = {
  position: number;
  itemCount: number;
  text: string;
};

export type FlowBoundary = {
  gap: number;
  normalPitch: number;
  normalPitchSource: SpacingEstimateSource;
  normalPitchSampleCount: number;
  gapRatio: number;
  estimatedLineBreaks: number;
};

export type PageFlowResult = {
  orientation: WritingOrientation;
  bodyFontSize: number;
  primaryItemCount: number;
  annotationItemCount: number;
  marginNoiseItemCount: number;
  groupCount: number;
  metrics: OrientationMetrics;
  /** Sparse endpoint-attachment evidence retained without promoting it to a page label. */
  attachedRunEvidence: AttachedRunEvidence;
  groups: FlowGroup[];
  boundaries: FlowBoundary[];
  /** Logical text: physical line/column wrapping removed, paragraph boundaries normalized to one LF. */
  text: string;
  /** Fidelity view: inferred empty physical columns/lines are retained as consecutive LFs. */
  sourceSpacingText: string;
};

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function charCount(text: string): number {
  return [...text.trim()].length;
}

function dominantFontSize(items: InspectTextItem[]): number {
  const buckets = new Map<number, number>();

  for (const item of items) {
    const count = charCount(item.text);
    if (count === 0 || item.fontSize <= 0) continue;
    const size = Math.round(item.fontSize * 10) / 10;
    buckets.set(size, (buckets.get(size) ?? 0) + count);
  }

  let bestSize = 0;
  let bestWeight = -1;
  for (const [size, weight] of buckets) {
    if (weight > bestWeight || (weight === bestWeight && size > bestSize)) {
      bestSize = size;
      bestWeight = weight;
    }
  }

  return bestSize;
}

function detectOrientation(items: InspectTextItem[]): {
  orientation: WritingOrientation;
  metrics: PageFlowResult["metrics"];
  attachedRunEvidence: AttachedRunEvidence;
} {
  if (items.length === 0) {
    return {
      orientation: "unknown",
      metrics: {
        singleCharItemRatio: 0,
        verticalRunRatio: 0,
        horizontalRunRatio: 0,
        verticalBaselineRatio: 0,
        horizontalBaselineRatio: 0,
        sequenceVerticalRatio: 0,
        sequenceHorizontalRatio: 0,
      },
      attachedRunEvidence: emptyAttachedRunEvidence(),
    };
  }

  const singleCharItemRatio = measureSingleCharItemRatio(items);
  const multiCharItems = items.filter((item) => charCount(item.text) >= 2);
  const verticalRuns = multiCharItems.filter((item) => item.height > item.width * 1.5).length;
  const horizontalRuns = multiCharItems.filter((item) => item.width > item.height * 1.5).length;

  let verticalBaselines = 0;
  let horizontalBaselines = 0;

  for (const item of items) {
    const [a = 0, b = 0] = item.displayTransform;
    if (Math.abs(b) > Math.abs(a) * 1.5) verticalBaselines += 1;
    if (Math.abs(a) > Math.abs(b) * 1.5) horizontalBaselines += 1;
  }

  const verticalRunRatio = multiCharItems.length === 0 ? 0 : verticalRuns / multiCharItems.length;
  const horizontalRunRatio = multiCharItems.length === 0 ? 0 : horizontalRuns / multiCharItems.length;
  const verticalBaselineRatio = verticalBaselines / items.length;
  const horizontalBaselineRatio = horizontalBaselines / items.length;
  const sequence = glyphSequenceRatios(items);
  const rawMetrics: OrientationMetrics = {
    singleCharItemRatio,
    verticalRunRatio,
    horizontalRunRatio,
    verticalBaselineRatio,
    horizontalBaselineRatio,
    sequenceVerticalRatio: sequence.vertical,
    sequenceHorizontalRatio: sequence.horizontal,
  };
  const metricDecision = decideMetricOrientation(rawMetrics);

  return {
    orientation: metricDecision.orientation,
    metrics: {
      singleCharItemRatio: round(singleCharItemRatio, 4),
      verticalRunRatio: round(verticalRunRatio, 4),
      horizontalRunRatio: round(horizontalRunRatio, 4),
      verticalBaselineRatio: round(verticalBaselineRatio, 4),
      horizontalBaselineRatio: round(horizontalBaselineRatio, 4),
      sequenceVerticalRatio: round(sequence.vertical, 4),
      sequenceHorizontalRatio: round(sequence.horizontal, 4),
    },
    attachedRunEvidence: metricDecision.orientation === "unknown"
      ? measureAttachedRunEvidence(items)
      : emptyAttachedRunEvidence(),
  };
}

type GroupBuildResult = {
  groups: FlowGroup[];
  boundaries: FlowBoundary[];
};

type PhysicalColumn = {
  position: number;
  itemCount: number;
  text: string;
};

function mergeVerticalColumns(
  columns: PhysicalColumn[],
  bodyFontSize: number,
): GroupBuildResult {
  if (columns.length === 0) return { groups: [], boundaries: [] };
  if (columns.length === 1) {
    const column = columns[0];
    if (!column) return { groups: [], boundaries: [] };
    return {
      groups: [{ position: round(column.position, 2), itemCount: column.itemCount, text: column.text }],
      boundaries: [],
    };
  }

  const gaps = columns.slice(1).map((column, index) => {
    const previous = columns[index];
    return previous ? previous.position - column.position : 0;
  });
  const spacing = estimateNormalSpacing(
    gaps,
    bodyFontSize,
    Math.max(1, bodyFontSize * 0.6),
  );
  const normalPitch = spacing.normal;
  const paragraphThreshold = paragraphGapThreshold(normalPitch, bodyFontSize);

  const groups: FlowGroup[] = [];
  const boundaries: FlowBoundary[] = [];
  let blockPosition = columns[0]?.position ?? 0;
  let blockItemCount = 0;
  let blockText = "";

  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (!column) continue;

    if (index > 0) {
      const previousColumn = columns[index - 1];
      const gap = previousColumn ? previousColumn.position - column.position : 0;
      if (gap >= paragraphThreshold && blockText.length > 0) {
        groups.push({
          position: round(blockPosition, 2),
          itemCount: blockItemCount,
          text: blockText,
        });

        const gapRatio = normalPitch > 0 ? gap / normalPitch : 1;
        boundaries.push({
          gap: round(gap, 2),
          normalPitch: round(normalPitch, 2),
          normalPitchSource: spacing.source,
          normalPitchSampleCount: spacing.sampleCount,
          gapRatio: round(gapRatio, 3),
          estimatedLineBreaks: Math.min(20, Math.max(1, Math.round(gapRatio))),
        });

        blockPosition = column.position;
        blockItemCount = 0;
        blockText = "";
      }
    }

    blockItemCount += column.itemCount;
    blockText += column.text;
  }

  if (blockText.length > 0) {
    groups.push({
      position: round(blockPosition, 2),
      itemCount: blockItemCount,
      text: blockText,
    });
  }

  return { groups, boundaries };
}

function buildVerticalGroups(items: InspectTextItem[], bodyFontSize: number): GroupBuildResult {
  const physicalColumns = clusterTextItemsByAxis(items, "x", ordinaryCrossAxisTolerance(bodyFontSize))
    .sort((left, right) => right.position - left.position)
    .map((cluster) => {
      const orderedItems = [...cluster.items].sort((left, right) => {
        const yDiff = left.displayY - right.displayY;
        if (Math.abs(yDiff) > 0.5) return yDiff;
        return right.fontSize - left.fontSize;
      });

      return {
        position: cluster.position,
        itemCount: orderedItems.length,
        text: orderedItems.map((item) => item.text).join(""),
      };
    })
    .filter((column) => column.text.trim().length > 0);

  return mergeVerticalColumns(physicalColumns, bodyFontSize);
}

function buildHorizontalGroups(items: InspectTextItem[], bodyFontSize: number): GroupBuildResult {
  const groups = clusterTextItemsByAxis(items, "y", ordinaryCrossAxisTolerance(bodyFontSize))
    .sort((left, right) => left.position - right.position)
    .map((cluster) => {
      const orderedItems = [...cluster.items].sort((left, right) => left.displayX - right.displayX);

      return {
        position: round(cluster.position, 2),
        itemCount: orderedItems.length,
        text: orderedItems.map((item) => item.text).join(""),
      };
    });

  return { groups, boundaries: [] };
}

function buildVerticalGlyphGroups(
  items: InspectTextItem[],
  bodyFontSize: number,
): GroupBuildResult {
  const physicalColumns = clusterVerticalGlyphColumns(items, bodyFontSize)
    .map((column) => ({
      position: column.position,
      itemCount: column.items.length,
      text: column.items.map((item) => item.text.trim()).join(""),
    }))
    .filter((column) => column.text.length > 0);

  return mergeVerticalColumns(physicalColumns, bodyFontSize);
}

function renderLogicalText(groups: FlowGroup[]): string {
  return groups.map((group) => group.text).join("\n");
}

function renderSourceSpacingText(groups: FlowGroup[], boundaries: FlowBoundary[]): string {
  if (groups.length === 0) return "";
  let text = groups[0]?.text ?? "";

  for (let index = 1; index < groups.length; index += 1) {
    const group = groups[index];
    if (!group) continue;
    const boundary = boundaries[index - 1];
    const lineBreaks = boundary?.estimatedLineBreaks ?? 1;
    text += `${"\n".repeat(Math.max(1, lineBreaks))}${group.text}`;
  }

  return text;
}

export function reconstructPageFlow(page: InspectPage): PageFlowResult {
  const nonEmptyItems = page.textItems.filter((item) => item.text.trim().length > 0);
  const bodyFontSize = dominantFontSize(nonEmptyItems);
  const itemEvidence = collectTextItemEvidence(page, bodyFontSize);

  const marginNoiseItems = itemEvidence
    .filter((entry) => entry.visible && entry.marginNoise)
    .map((entry) => entry.item);
  const contentEvidence = itemEvidence.filter((entry) => entry.visible && !entry.marginNoise);
  const annotationItems = contentEvidence
    .filter((entry) => entry.annotationSized)
    .map((entry) => entry.item);
  const primaryItems = contentEvidence
    .filter((entry) => !entry.annotationSized)
    .map((entry) => entry.item);

  const { orientation, metrics, attachedRunEvidence } = detectOrientation(primaryItems);

  let built: GroupBuildResult = { groups: [], boundaries: [] };
  if (orientation === "vertical" && verticalTextLayoutMode(primaryItems) === "glyph") {
    built = buildVerticalGlyphGroups(primaryItems, bodyFontSize);
  } else if (orientation === "vertical") {
    built = buildVerticalGroups(primaryItems, bodyFontSize);
  } else if (orientation === "horizontal") {
    built = buildHorizontalGroups(primaryItems, bodyFontSize);
  }

  return {
    orientation,
    bodyFontSize: round(bodyFontSize, 2),
    primaryItemCount: primaryItems.length,
    annotationItemCount: annotationItems.length,
    marginNoiseItemCount: marginNoiseItems.length,
    groupCount: built.groups.length,
    metrics,
    attachedRunEvidence,
    groups: built.groups,
    boundaries: built.boundaries,
    text: renderLogicalText(built.groups),
    sourceSpacingText: renderSourceSpacingText(built.groups, built.boundaries),
  };
}
