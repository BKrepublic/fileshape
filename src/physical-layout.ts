import {
  clusterTextItemsByAxis,
  clusterVerticalGlyphColumns,
  ordinaryCrossAxisTolerance,
  verticalTextLayoutMode,
} from "./layout-clustering.js";
import type { DocumentMarginProfile } from "./margin-recurrence.js";
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

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function primaryItems(
  page: InspectPage,
  bodyFontSize: number,
  marginProfile?: DocumentMarginProfile,
): InspectTextItem[] {
  return collectTextItemEvidence(page, bodyFontSize, marginProfile)
    .filter((entry) => entry.visible && !entry.marginNoise && !entry.annotationSized)
    .map(({ item, itemIndex }) => ({
      ...item,
      source: item.source ?? fullTextRef(page.page, itemIndex, item.text),
    }));
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

function buildVerticalGlyphUnits(
  items: InspectTextItem[],
  bodyFontSize: number,
  inlineSize: number,
): PhysicalTextUnit[] {
  if (items.length === 0) return [];

  return clusterVerticalGlyphColumns(items, bodyFontSize)
    .map((column) => ({
      ...column,
      text: column.items.map((item) => item.text.trim()).join(""),
    }))
    .filter((column) => column.text.length > 0)
    .map((column, index) =>
      makeUnit(index, column.position, column.items, column.text, "vertical", inlineSize),
    );
}

function buildVerticalRunUnits(
  items: InspectTextItem[],
  bodyFontSize: number,
  inlineSize: number,
): PhysicalTextUnit[] {
  return clusterTextItemsByAxis(items, "x", ordinaryCrossAxisTolerance(bodyFontSize))
    .map((cluster) => {
      const orderedItems = [...cluster.items].sort((left, right) => left.displayY - right.displayY);
      return {
        position: cluster.position,
        items: orderedItems,
        text: orderedItems.map((item) => item.text).join(""),
      };
    })
    .filter((unit) => unit.text.trim().length > 0)
    .sort((left, right) => right.position - left.position)
    .map((unit, index) =>
      makeUnit(index, unit.position, unit.items, unit.text, "vertical", inlineSize),
    );
}

function buildHorizontalUnits(
  items: InspectTextItem[],
  bodyFontSize: number,
  inlineSize: number,
): PhysicalTextUnit[] {
  return clusterTextItemsByAxis(items, "y", ordinaryCrossAxisTolerance(bodyFontSize))
    .map((cluster) => {
      const orderedItems = [...cluster.items].sort((left, right) => left.displayX - right.displayX);
      return {
        position: cluster.position,
        items: orderedItems,
        text: orderedItems.map((item) => item.text).join(""),
      };
    })
    .filter((unit) => unit.text.trim().length > 0)
    .sort((left, right) => left.position - right.position)
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
  marginProfile?: DocumentMarginProfile,
): PhysicalPageLayout {
  const items = primaryItems(page, bodyFontSize, marginProfile);
  const inlineSize = orientation === "horizontal" ? page.width : page.height;

  let units: PhysicalTextUnit[] = [];
  if (orientation === "vertical") {
    units = verticalTextLayoutMode(items) === "glyph"
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
