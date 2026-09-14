import type { InspectPage, InspectTextItem } from "./pdf-inspection-model.js";
import { isShortMarginNoise } from "./margin-noise.js";
import {
  decideMetricOrientation,
  type OrientationMetrics,
  type WritingOrientation,
} from "./orientation-decision.js";

export type { WritingOrientation } from "./orientation-decision.js";

export type FlowGroup = {
  position: number;
  itemCount: number;
  text: string;
};

export type FlowBoundary = {
  gap: number;
  normalPitch: number;
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function lowerQuartile(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.floor((sorted.length - 1) * 0.25);
  return sorted[index] ?? 0;
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

function glyphSequenceRatios(items: InspectTextItem[]): {
  vertical: number;
  horizontal: number;
} {
  const glyphs = items.filter((item) => charCount(item.text) === 1);
  if (glyphs.length < 2) return { vertical: 0, horizontal: 0 };

  let usable = 0;
  let vertical = 0;
  let horizontal = 0;

  for (let index = 1; index < glyphs.length; index += 1) {
    const previous = glyphs[index - 1];
    const current = glyphs[index];
    if (!previous || !current) continue;

    const maxFontSize = Math.max(previous.fontSize, current.fontSize, 1);
    const minFontSize = Math.min(previous.fontSize, current.fontSize);
    if (minFontSize / maxFontSize < 0.75) continue;

    const dx = Math.abs(current.displayX - previous.displayX);
    const dy = Math.abs(current.displayY - previous.displayY);
    const distance = Math.hypot(dx, dy);

    if (distance < 0.5 || distance > maxFontSize * 2.75) continue;

    if (dy > dx * 1.5) {
      vertical += 1;
      usable += 1;
    } else if (dx > dy * 1.5) {
      horizontal += 1;
      usable += 1;
    }
  }

  if (usable === 0) return { vertical: 0, horizontal: 0 };
  return {
    vertical: vertical / usable,
    horizontal: horizontal / usable,
  };
}

/** A compact run has no reliable aspect-ratio vote. It may still continue a
 * long run when its origin is adjacent to that run's inline endpoint. Require
 * all remaining items to attach; isolated text and competing axes stay unknown.
 * Neither Unicode content nor glyph transform direction participates here. */
function attachedRunOrientation(items: InspectTextItem[]): WritingOrientation {
  const candidates = (["vertical", "horizontal"] as const).filter((orientation) => {
    const inline = (item: InspectTextItem) => orientation === "vertical" ? item.displayY : item.displayX;
    const cross = (item: InspectTextItem) => orientation === "vertical" ? item.displayX : item.displayY;
    const extent = (item: InspectTextItem) => Math.abs(orientation === "vertical" ? item.height : item.width);
    const breadth = (item: InspectTextItem) => Math.abs(orientation === "vertical" ? item.width : item.height);
    const anchors = items.filter((item) => charCount(item.text) >= 2 &&
      extent(item) >= item.fontSize * 3 && extent(item) > breadth(item) * 1.5);
    if (anchors.length === 0) return false;
    const anchorSet = new Set(anchors);
    const pending = items.filter((item) => !anchorSet.has(item));
    if (pending.length === 0) return false;
    // A second elongated run is evidence of mixed layout, not an attachment.
    if (pending.some((item) => item.fontSize <= 0 ||
      Math.max(Math.abs(item.width), Math.abs(item.height)) > item.fontSize * 1.5)) return false;
    const attached = [...anchors];
    while (pending.length > 0) {
      const index = pending.findIndex((item) => attached.some((parent) => {
        const size = Math.max(parent.fontSize, item.fontSize);
        const ratio = Math.min(parent.fontSize, item.fontSize) / size;
        const gap = inline(item) - (inline(parent) + extent(parent));
        return ratio >= 0.75 && Math.abs(cross(item) - cross(parent)) <= size * 0.5 &&
          Math.abs(gap) <= size * 0.75 && inline(item) > inline(parent);
      }));
      if (index < 0) return false;
      attached.push(...pending.splice(index, 1));
    }
    return true;
  });
  return candidates.length === 1 ? candidates[0]! : "unknown";
}

function detectOrientation(items: InspectTextItem[]): {
  orientation: WritingOrientation;
  metrics: PageFlowResult["metrics"];
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
    };
  }

  const singleCharItems = items.filter((item) => charCount(item.text) === 1).length;
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

  const singleCharItemRatio = singleCharItems / items.length;
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

  let orientation = decideMetricOrientation(rawMetrics).orientation;
  if (orientation === "unknown") orientation = attachedRunOrientation(items);

  return {
    orientation,
    metrics: {
      singleCharItemRatio: round(singleCharItemRatio, 4),
      verticalRunRatio: round(verticalRunRatio, 4),
      horizontalRunRatio: round(horizontalRunRatio, 4),
      verticalBaselineRatio: round(verticalBaselineRatio, 4),
      horizontalBaselineRatio: round(horizontalBaselineRatio, 4),
      sequenceVerticalRatio: round(sequence.vertical, 4),
      sequenceHorizontalRatio: round(sequence.horizontal, 4),
    },
  };
}

type MutableGroup = {
  position: number;
  positions: number[];
  items: InspectTextItem[];
};

function clusterByPosition(
  items: InspectTextItem[],
  axis: "x" | "y",
  tolerance: number,
): MutableGroup[] {
  const coordinate = (item: InspectTextItem) => (axis === "x" ? item.displayX : item.displayY);
  const ordered = [...items].sort((left, right) => coordinate(left) - coordinate(right));
  const groups: MutableGroup[] = [];

  for (const item of ordered) {
    const value = coordinate(item);
    let bestGroup: MutableGroup | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const group of groups) {
      const distance = Math.abs(value - group.position);
      if (distance <= tolerance && distance < bestDistance) {
        bestGroup = group;
        bestDistance = distance;
      }
    }

    if (!bestGroup) {
      groups.push({ position: value, positions: [value], items: [item] });
      continue;
    }

    bestGroup.positions.push(value);
    bestGroup.items.push(item);
    bestGroup.position = median(bestGroup.positions);
  }

  return groups;
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

function estimateNormalPitch(columns: PhysicalColumn[], bodyFontSize: number): number {
  const gaps: number[] = [];
  for (let index = 1; index < columns.length; index += 1) {
    const previous = columns[index - 1];
    const current = columns[index];
    if (!previous || !current) continue;
    const gap = previous.position - current.position;
    if (gap > Math.max(1, bodyFontSize * 0.6)) gaps.push(gap);
  }

  if (gaps.length >= 2) return lowerQuartile(gaps);
  if (bodyFontSize > 0) return bodyFontSize * 1.65;
  return gaps[0] ?? 0;
}

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

  const normalPitch = estimateNormalPitch(columns, bodyFontSize);
  const paragraphGapThreshold =
    normalPitch > 0
      ? Math.max(normalPitch * 1.55, normalPitch + bodyFontSize * 1.25)
      : Number.POSITIVE_INFINITY;

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
      if (gap >= paragraphGapThreshold && blockText.length > 0) {
        groups.push({
          position: round(blockPosition, 2),
          itemCount: blockItemCount,
          text: blockText,
        });

        const gapRatio = normalPitch > 0 ? gap / normalPitch : 1;
        boundaries.push({
          gap: round(gap, 2),
          normalPitch: round(normalPitch, 2),
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
  const tolerance = Math.max(1.5, bodyFontSize * 0.42);
  const physicalColumns = clusterByPosition(items, "x", tolerance)
    .sort((left, right) => right.position - left.position)
    .map((group) => {
      const orderedItems = [...group.items].sort((left, right) => {
        const yDiff = left.displayY - right.displayY;
        if (Math.abs(yDiff) > 0.5) return yDiff;
        return right.fontSize - left.fontSize;
      });

      return {
        position: group.position,
        itemCount: orderedItems.length,
        text: orderedItems.map((item) => item.text).join(""),
      };
    })
    .filter((column) => column.text.trim().length > 0);

  return mergeVerticalColumns(physicalColumns, bodyFontSize);
}

function buildHorizontalGroups(items: InspectTextItem[], bodyFontSize: number): GroupBuildResult {
  const tolerance = Math.max(1.5, bodyFontSize * 0.42);
  const groups = clusterByPosition(items, "y", tolerance)
    .sort((left, right) => left.position - right.position)
    .map((group) => {
      const orderedItems = [...group.items].sort((left, right) => left.displayX - right.displayX);

      return {
        position: round(group.position, 2),
        itemCount: orderedItems.length,
        text: orderedItems.map((item) => item.text).join(""),
      };
    });

  return { groups, boundaries: [] };
}

type SequenceColumn = {
  anchorX: number;
  positions: number[];
  startY: number;
  items: InspectTextItem[];
};

function buildVerticalGlyphSequenceGroups(
  items: InspectTextItem[],
  bodyFontSize: number,
): GroupBuildResult {
  if (items.length === 0) return { groups: [], boundaries: [] };

  const shiftThreshold = Math.max(8, bodyFontSize * 1.25);
  const columns: SequenceColumn[] = [];
  let current: SequenceColumn | undefined;
  let previous: InspectTextItem | undefined;

  for (const item of items) {
    if (!current) {
      current = {
        anchorX: item.displayX,
        positions: [item.displayX],
        startY: item.displayY,
        items: [item],
      };
      columns.push(current);
      previous = item;
      continue;
    }

    const xShift = Math.abs(item.displayX - current.anchorX);
    const yRestart = previous
      ? item.displayY < previous.displayY - bodyFontSize * 0.5 ||
        item.displayY <= current.startY + bodyFontSize * 1.5
      : false;

    if (xShift > shiftThreshold && yRestart) {
      current = {
        anchorX: item.displayX,
        positions: [item.displayX],
        startY: item.displayY,
        items: [item],
      };
      columns.push(current);
    } else {
      current.positions.push(item.displayX);
      current.items.push(item);
    }

    previous = item;
  }

  const physicalColumns = columns
    .map((column) => ({
      position: median(column.positions),
      itemCount: column.items.length,
      text: column.items.map((item) => item.text.trim()).join(""),
    }))
    .filter((column) => column.text.length > 0)
    .sort((left, right) => right.position - left.position);

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

  const marginNoiseItems = nonEmptyItems.filter((item) => isShortMarginNoise(item, page, bodyFontSize));
  const marginNoiseSet = new Set(marginNoiseItems);
  const contentItems = nonEmptyItems.filter((item) => !marginNoiseSet.has(item));

  const annotationThreshold = bodyFontSize * 0.75;
  const annotationItems = contentItems.filter(
    (item) => bodyFontSize > 0 && item.fontSize < annotationThreshold,
  );
  const annotationSet = new Set(annotationItems);
  const primaryItems = contentItems.filter((item) => !annotationSet.has(item));

  const { orientation, metrics } = detectOrientation(primaryItems);

  let built: GroupBuildResult = { groups: [], boundaries: [] };
  if (
    orientation === "vertical" &&
    metrics.singleCharItemRatio >= 0.7 &&
    metrics.sequenceVerticalRatio >= 0.6
  ) {
    built = buildVerticalGlyphSequenceGroups(primaryItems, bodyFontSize);
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
    groups: built.groups,
    boundaries: built.boundaries,
    text: renderLogicalText(built.groups),
    sourceSpacingText: renderSourceSpacingText(built.groups, built.boundaries),
  };
}
