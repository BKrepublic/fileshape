import type { InspectPage, InspectTextItem } from "./pdf-inspector.js";

export type WritingOrientation = "vertical" | "horizontal" | "unknown";

type FlowGroup = {
  position: number;
  itemCount: number;
  text: string;
};

export type PageFlowResult = {
  orientation: WritingOrientation;
  bodyFontSize: number;
  primaryItemCount: number;
  annotationItemCount: number;
  marginNoiseItemCount: number;
  groupCount: number;
  metrics: {
    singleCharItemRatio: number;
    verticalRunRatio: number;
    horizontalRunRatio: number;
    verticalBaselineRatio: number;
    horizontalBaselineRatio: number;
    sequenceVerticalRatio: number;
    sequenceHorizontalRatio: number;
  };
  groups: FlowGroup[];
  text: string;
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

function isMarginNoise(item: InspectTextItem, page: InspectPage, bodyFontSize: number): boolean {
  const count = charCount(item.text);
  if (count === 0 || count > 8) return false;

  const nearTop = item.displayY < page.height * 0.08;
  const nearBottom = item.displayY > page.height * 0.9;
  const smallerThanBody = bodyFontSize > 0 && item.fontSize < bodyFontSize * 0.98;

  return (nearTop || nearBottom) && smallerThanBody;
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

    // Ignore duplicate/overprinted glyphs and large jumps between columns/regions.
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

  let orientation: WritingOrientation = "unknown";

  if (verticalRunRatio >= 0.6 && verticalRunRatio > horizontalRunRatio) {
    orientation = "vertical";
  } else if (horizontalRunRatio >= 0.6 && horizontalRunRatio > verticalRunRatio) {
    orientation = "horizontal";
  } else if (singleCharItemRatio >= 0.7 && sequence.vertical >= 0.6 && sequence.vertical > sequence.horizontal) {
    orientation = "vertical";
  } else if (
    singleCharItemRatio >= 0.7 &&
    sequence.horizontal >= 0.6 &&
    sequence.horizontal > sequence.vertical
  ) {
    orientation = "horizontal";
  } else if (singleCharItemRatio >= 0.7 && verticalBaselineRatio >= 0.6) {
    orientation = "vertical";
  } else if (singleCharItemRatio >= 0.7 && horizontalBaselineRatio >= 0.6) {
    orientation = "horizontal";
  } else if (verticalBaselineRatio > horizontalBaselineRatio * 1.5) {
    orientation = "vertical";
  } else if (horizontalBaselineRatio > verticalBaselineRatio * 1.5) {
    orientation = "horizontal";
  }

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
    bestGroup.position =
      bestGroup.positions.reduce((sum, position) => sum + position, 0) / bestGroup.positions.length;
  }

  return groups;
}

function buildVerticalGroups(items: InspectTextItem[], bodyFontSize: number): FlowGroup[] {
  const tolerance = Math.max(1.5, bodyFontSize * 0.42);
  const groups = clusterByPosition(items, "x", tolerance).sort(
    (left, right) => right.position - left.position,
  );

  return groups.map((group) => {
    const orderedItems = [...group.items].sort((left, right) => {
      const yDiff = left.displayY - right.displayY;
      if (Math.abs(yDiff) > 0.5) return yDiff;
      return right.fontSize - left.fontSize;
    });

    return {
      position: round(group.position, 2),
      itemCount: orderedItems.length,
      text: orderedItems.map((item) => item.text).join(""),
    };
  });
}

function buildHorizontalGroups(items: InspectTextItem[], bodyFontSize: number): FlowGroup[] {
  const tolerance = Math.max(1.5, bodyFontSize * 0.42);
  const groups = clusterByPosition(items, "y", tolerance).sort(
    (left, right) => left.position - right.position,
  );

  return groups.map((group) => {
    const orderedItems = [...group.items].sort((left, right) => left.displayX - right.displayX);

    return {
      position: round(group.position, 2),
      itemCount: orderedItems.length,
      text: orderedItems.map((item) => item.text).join(""),
    };
  });
}

export function reconstructPageFlow(page: InspectPage): PageFlowResult {
  const nonEmptyItems = page.textItems.filter((item) => item.text.trim().length > 0);
  const bodyFontSize = dominantFontSize(nonEmptyItems);

  const marginNoiseItems = nonEmptyItems.filter((item) => isMarginNoise(item, page, bodyFontSize));
  const marginNoiseSet = new Set(marginNoiseItems);
  const contentItems = nonEmptyItems.filter((item) => !marginNoiseSet.has(item));

  const annotationThreshold = bodyFontSize * 0.75;
  const annotationItems = contentItems.filter(
    (item) => bodyFontSize > 0 && item.fontSize < annotationThreshold,
  );
  const annotationSet = new Set(annotationItems);
  const primaryItems = contentItems.filter((item) => !annotationSet.has(item));

  const { orientation, metrics } = detectOrientation(primaryItems);

  let groups: FlowGroup[] = [];
  if (orientation === "vertical") {
    groups = buildVerticalGroups(primaryItems, bodyFontSize);
  } else if (orientation === "horizontal") {
    groups = buildHorizontalGroups(primaryItems, bodyFontSize);
  }

  return {
    orientation,
    bodyFontSize: round(bodyFontSize, 2),
    primaryItemCount: primaryItems.length,
    annotationItemCount: annotationItems.length,
    marginNoiseItemCount: marginNoiseItems.length,
    groupCount: groups.length,
    metrics,
    groups,
    text: groups.map((group) => group.text).join("\n"),
  };
}
