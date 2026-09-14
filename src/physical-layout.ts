import type { InspectPage, InspectTextItem } from "./pdf-inspection-model.js";
import type { WritingOrientation } from "./text-flow.js";
import { fullTextRef, type SourceTextRef } from "./source-text.js";
import { collectTextItemEvidence } from "./text-item-evidence.js";

export type PhysicalTextUnit = {
  index: number;
  position: number;
  itemCount: number;
  text: string;
  /** Full original item ranges, including whitespace trimmed in the text view. */
  sourceRanges?: SourceTextRef[];
  /** Start position along the reading axis (Y for vertical, X for horizontal). */
  inlineStart: number;
  /** End position along the reading axis. */
  inlineEnd: number;
  inlineSpan: number;
  inlineStartRatio: number;
  inlineEndRatio: number;
  inlineCoverageRatio: number;
};

export type PhysicalGap = {
  fromUnit: number;
  toUnit: number;
  distance: number;
};

export type PhysicalPageLayout = {
  orientation: WritingOrientation;
  inlineSize: number;
  units: PhysicalTextUnit[];
  gaps: PhysicalGap[];
};

function charCount(text: string): number {
  return [...text.trim()].length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function primaryItems(page: InspectPage, bodyFontSize: number): InspectTextItem[] {
  return collectTextItemEvidence(page, bodyFontSize)
    .filter((entry) => entry.visible && !entry.marginNoise && !entry.annotationSized)
    .map(({ item, itemIndex }) => ({
      ...item,
      source: item.source ?? fullTextRef(page.page, itemIndex, item.text),
    }));
}

type MutableUnit = {
  positions: number[];
  items: InspectTextItem[];
};

function clusterByAxis(
  items: InspectTextItem[],
  axis: "x" | "y",
  tolerance: number,
): MutableUnit[] {
  const coordinate = (item: InspectTextItem) => (axis === "x" ? item.displayX : item.displayY);
  const ordered = [...items].sort((a, b) => coordinate(a) - coordinate(b));
  const units: MutableUnit[] = [];

  for (const item of ordered) {
    const value = coordinate(item);
    let best: MutableUnit | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const unit of units) {
      const position = median(unit.positions);
      const distance = Math.abs(value - position);
      if (distance <= tolerance && distance < bestDistance) {
        best = unit;
        bestDistance = distance;
      }
    }

    if (best) {
      best.positions.push(value);
      best.items.push(item);
    } else {
      units.push({ positions: [value], items: [item] });
    }
  }

  return units;
}

function inlineBounds(
  items: InspectTextItem[],
  orientation: WritingOrientation,
  inlineSize: number,
): Pick<
  PhysicalTextUnit,
  | "inlineStart"
  | "inlineEnd"
  | "inlineSpan"
  | "inlineStartRatio"
  | "inlineEndRatio"
  | "inlineCoverageRatio"
> {
  const starts: number[] = [];
  const ends: number[] = [];

  for (const item of items) {
    if (orientation === "vertical") {
      const start = item.displayY;
      const extent = Math.max(Math.abs(item.height), item.fontSize * 0.8, 1);
      starts.push(start);
      ends.push(start + extent);
    } else {
      const start = item.displayX;
      const extent = Math.max(Math.abs(item.width), item.fontSize * 0.8, 1);
      starts.push(start);
      ends.push(start + extent);
    }
  }

  const inlineStart = starts.length > 0 ? Math.min(...starts) : 0;
  const inlineEnd = ends.length > 0 ? Math.max(...ends) : inlineStart;
  const inlineSpan = Math.max(0, inlineEnd - inlineStart);
  const denominator = Math.max(1, inlineSize);

  return {
    inlineStart: round(inlineStart),
    inlineEnd: round(inlineEnd),
    inlineSpan: round(inlineSpan),
    inlineStartRatio: round(inlineStart / denominator, 4),
    inlineEndRatio: round(inlineEnd / denominator, 4),
    inlineCoverageRatio: round(inlineSpan / denominator, 4),
  };
}

function makeUnit(
  index: number,
  position: number,
  items: InspectTextItem[],
  text: string,
  orientation: WritingOrientation,
  inlineSize: number,
): PhysicalTextUnit {
  return {
    index,
    position: round(position),
    itemCount: items.length,
    text,
    sourceRanges: items.flatMap((item) => item.source ? [{ ...item.source }] : []),
    ...inlineBounds(items, orientation, inlineSize),
  };
}

function sourceItemIndex(item: InspectTextItem): number | undefined {
  return item.source?.itemIndex;
}

function verticalGlyphExtent(item: InspectTextItem): number {
  return Math.max(Math.abs(item.height), item.fontSize * 0.8, 1);
}

function orderVerticalGlyphItems(items: InspectTextItem[]): InspectTextItem[] {
  const geometric = [...items].sort((a, b) =>
    a.displayY - b.displayY || a.displayX - b.displayX ||
    ((sourceItemIndex(a) ?? 0) - (sourceItemIndex(b) ?? 0)));
  const ordered: InspectTextItem[] = [];

  for (let start = 0; start < geometric.length;) {
    let end = start + 1;
    while (end < geometric.length) {
      const previous = geometric[end - 1]!;
      const current = geometric[end]!;
      const gap = current.displayY - previous.displayY;
      const localTie = gap < Math.min(verticalGlyphExtent(previous), verticalGlyphExtent(current)) * 0.75;
      if (!localTie) break;
      end += 1;
    }

    const group = geometric.slice(start, end);
    const hasCompleteSourceOrder = group.every((item) => sourceItemIndex(item) !== undefined);
    if (group.length > 1 && hasCompleteSourceOrder) {
      group.sort((a, b) => sourceItemIndex(a)! - sourceItemIndex(b)!);
    }
    ordered.push(...group);
    start = end;
  }

  return ordered;
}

function buildVerticalGlyphUnits(
  items: InspectTextItem[],
  bodyFontSize: number,
  inlineSize: number,
): PhysicalTextUnit[] {
  if (items.length === 0) return [];

  // Single-glyph PDFs do not guarantee that PDF.js emits text items grouped by
  // visual column. Some producers interleave glyph operators by row or drawing
  // order. Reconstruct columns from display geometry first, then establish the
  // vertical reading order within each column. Local overlapping glyph origins
  // retain source order because punctuation/rotation can shift their baselines.
  const tolerance = Math.max(8, bodyFontSize * 1.25);
  return clusterByAxis(items, "x", tolerance)
    .map((unit) => {
      const orderedItems = orderVerticalGlyphItems(unit.items);
      return {
        position: median(unit.positions),
        items: orderedItems,
        text: orderedItems.map((item) => item.text.trim()).join(""),
      };
    })
    .filter((column) => column.text.length > 0)
    .sort((a, b) => b.position - a.position)
    .map((column, index) =>
      makeUnit(index, column.position, column.items, column.text, "vertical", inlineSize),
    );
}

function buildVerticalRunUnits(
  items: InspectTextItem[],
  bodyFontSize: number,
  inlineSize: number,
): PhysicalTextUnit[] {
  const tolerance = Math.max(1.5, bodyFontSize * 0.42);
  return clusterByAxis(items, "x", tolerance)
    .map((unit) => {
      const orderedItems = [...unit.items].sort((a, b) => a.displayY - b.displayY);
      return {
        position: median(unit.positions),
        items: orderedItems,
        text: orderedItems.map((item) => item.text).join(""),
      };
    })
    .filter((unit) => unit.text.trim().length > 0)
    .sort((a, b) => b.position - a.position)
    .map((unit, index) =>
      makeUnit(index, unit.position, unit.items, unit.text, "vertical", inlineSize),
    );
}

function buildHorizontalUnits(
  items: InspectTextItem[],
  bodyFontSize: number,
  inlineSize: number,
): PhysicalTextUnit[] {
  const tolerance = Math.max(1.5, bodyFontSize * 0.42);
  return clusterByAxis(items, "y", tolerance)
    .map((unit) => {
      const orderedItems = [...unit.items].sort((a, b) => a.displayX - b.displayX);
      return {
        position: median(unit.positions),
        items: orderedItems,
        text: orderedItems.map((item) => item.text).join(""),
      };
    })
    .filter((unit) => unit.text.trim().length > 0)
    .sort((a, b) => a.position - b.position)
    .map((unit, index) =>
      makeUnit(index, unit.position, unit.items, unit.text, "horizontal", inlineSize),
    );
}

function buildGaps(units: PhysicalTextUnit[], orientation: WritingOrientation): PhysicalGap[] {
  const gaps: PhysicalGap[] = [];
  for (let index = 1; index < units.length; index += 1) {
    const previous = units[index - 1];
    const current = units[index];
    if (!previous || !current) continue;
    const distance =
      orientation === "vertical"
        ? previous.position - current.position
        : current.position - previous.position;
    gaps.push({
      fromUnit: previous.index,
      toUnit: current.index,
      distance: round(distance),
    });
  }
  return gaps;
}

export function reconstructPhysicalLayout(
  page: InspectPage,
  orientation: WritingOrientation,
  bodyFontSize: number,
): PhysicalPageLayout {
  const items = primaryItems(page, bodyFontSize);
  const singleCharRatio =
    items.length === 0 ? 0 : items.filter((item) => charCount(item.text) === 1).length / items.length;
  const inlineSize = orientation === "horizontal" ? page.width : page.height;

  let units: PhysicalTextUnit[] = [];
  if (orientation === "vertical") {
    units =
      singleCharRatio >= 0.7
        ? buildVerticalGlyphUnits(items, bodyFontSize, inlineSize)
        : buildVerticalRunUnits(items, bodyFontSize, inlineSize);
  } else if (orientation === "horizontal") {
    units = buildHorizontalUnits(items, bodyFontSize, inlineSize);
  }

  return {
    orientation,
    inlineSize: round(inlineSize),
    units,
    gaps: buildGaps(units, orientation),
  };
}
