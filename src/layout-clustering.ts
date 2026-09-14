import type { InspectTextItem } from "./pdf-inspection-model.js";

export type TextItemAxis = "x" | "y";

export type TextItemCluster = {
  position: number;
  positions: number[];
  items: InspectTextItem[];
};

export type VerticalGlyphColumn = {
  position: number;
  items: InspectTextItem[];
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function ordinaryCrossAxisTolerance(bodyFontSize: number): number {
  return Math.max(1.5, bodyFontSize * 0.42);
}

export function verticalGlyphColumnTolerance(bodyFontSize: number): number {
  return Math.max(8, bodyFontSize * 1.25);
}

export function clusterTextItemsByAxis(
  items: InspectTextItem[],
  axis: TextItemAxis,
  tolerance: number,
): TextItemCluster[] {
  const coordinate = (item: InspectTextItem) => axis === "x" ? item.displayX : item.displayY;
  const ordered = [...items].sort((left, right) => coordinate(left) - coordinate(right));
  const clusters: TextItemCluster[] = [];

  for (const item of ordered) {
    const value = coordinate(item);
    let best: TextItemCluster | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of clusters) {
      const distance = Math.abs(value - cluster.position);
      if (distance <= tolerance && distance < bestDistance) {
        best = cluster;
        bestDistance = distance;
      }
    }

    if (!best) {
      clusters.push({ position: value, positions: [value], items: [item] });
      continue;
    }

    best.positions.push(value);
    best.items.push(item);
    best.position = median(best.positions);
  }

  return clusters;
}

function sourceItemIndex(item: InspectTextItem): number | undefined {
  return item.source?.itemIndex;
}

function verticalGlyphExtent(item: InspectTextItem): number {
  return Math.max(Math.abs(item.height), item.fontSize * 0.8, 1);
}

/**
 * Establish vertical glyph order from geometry first. Source extraction order is
 * retained only inside a local overlap group where glyph origins are too close
 * for Y geometry alone to distinguish punctuation or rotated marks reliably.
 */
export function orderVerticalGlyphItems(items: InspectTextItem[]): InspectTextItem[] {
  const geometric = [...items].sort((left, right) =>
    left.displayY - right.displayY || left.displayX - right.displayX ||
    ((sourceItemIndex(left) ?? 0) - (sourceItemIndex(right) ?? 0)));
  const ordered: InspectTextItem[] = [];

  for (let start = 0; start < geometric.length;) {
    let end = start + 1;
    while (end < geometric.length) {
      const previous = geometric[end - 1]!;
      const current = geometric[end]!;
      const gap = current.displayY - previous.displayY;
      if (gap >= Math.min(verticalGlyphExtent(previous), verticalGlyphExtent(current)) * 0.75) break;
      end += 1;
    }

    const group = geometric.slice(start, end);
    if (group.length > 1 && group.every((item) => sourceItemIndex(item) !== undefined)) {
      group.sort((left, right) => sourceItemIndex(left)! - sourceItemIndex(right)!);
    }
    ordered.push(...group);
    start = end;
  }

  return ordered;
}

/** Shared geometry-first vertical glyph column reconstruction for flow/layout. */
export function clusterVerticalGlyphColumns(
  items: InspectTextItem[],
  bodyFontSize: number,
): VerticalGlyphColumn[] {
  return clusterTextItemsByAxis(items, "x", verticalGlyphColumnTolerance(bodyFontSize))
    .map((cluster) => ({
      position: cluster.position,
      items: orderVerticalGlyphItems(cluster.items),
    }))
    .sort((left, right) => right.position - left.position);
}
