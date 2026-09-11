import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { resolveDocumentOrientations } from "./document-orientation.js";
import { inspectPdf, type InspectPage } from "./pdf-inspector.js";
import { reconstructPhysicalLayout, type PhysicalPageLayout, type PhysicalTextUnit } from "./physical-layout.js";
import type { SourceGlyphRef, SourceTextRef } from "./source-text.js";
import { reconstructPageFlow, type WritingOrientation } from "./text-flow.js";

type PdfOutlineItem = {
  title: string;
  dest: string | unknown[] | null;
  url?: string | null;
  unsafeUrl?: string | undefined;
  items: PdfOutlineItem[];
};

type OutlineReader = {
  numPages: number;
  getOutline(): Promise<PdfOutlineItem[] | null>;
  getDestination(name: string): Promise<unknown[] | null>;
  getPageIndex(ref: { num: number; gen: number }): Promise<number>;
  getPage(pageNumber: number): Promise<{
    view: number[];
    rotate: number;
    userUnit: number;
    getViewport(options: { scale: number }): {
      width: number;
      height: number;
      rotation: number;
      transform: number[];
      convertToViewportPoint(x: number, y: number): [number, number];
    };
    cleanup(): void;
  }>;
};

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type OriginalDestinationEvidence =
  | { kind: "none" }
  | { kind: "named"; nameSha256: string; nameLength: number }
  | { kind: "explicit"; value: JsonValue };

export type DestinationDisplayGeometry =
  | { kind: "page" }
  | { kind: "point"; x: number; y: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "rect"; minX: number; minY: number; maxX: number; maxY: number }
  | { kind: "unsupported" };

export type OutlineSourceCandidate = {
  unitIndex: number;
  sourceRanges: SourceTextRef[];
  itemIndexes: number[];
  glyphRefs: SourceGlyphRef[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export type OutlineEvidenceClass = "unique-position" | "ambiguous-position" | "page-only" | "unmappable";

export type OutlineEvidenceReason =
  | "single-unit-intersection"
  | "multiple-unit-intersections"
  | "page-destination"
  | "no-source-intersection"
  | "no-visible-text"
  | "unresolved-writing-orientation"
  | "empty-physical-layout"
  | "unsupported-destination"
  | "invalid-destination"
  | "external-destination"
  | "no-destination";

export type OutlineEntryEvidence = {
  sourceOutlinePath: number[];
  titleSha256: string;
  titleLength: number;
  originalDestination: OriginalDestinationEvidence;
  resolvedDestination: JsonValue | null;
  sourcePage: number | null;
  destinationKind: string;
  displayGeometry: DestinationDisplayGeometry;
  pageGeometry: {
    rotation: number;
    userUnit: number;
    view: number[];
    viewportTransform: number[];
    width: number;
    height: number;
  } | null;
  writingOrientation: WritingOrientation | null;
  bodyFontSize: number | null;
  evidenceClass: OutlineEvidenceClass;
  reason: OutlineEvidenceReason;
  candidates: OutlineSourceCandidate[];
  relationships: {
    samePageEntryCount: number;
    sameResolvedDestinationCount: number;
    sameTitleHashCount: number;
    parentSamePage: boolean;
    nonMonotonicFromPreviousResolvedEntry: boolean;
  };
};

export type OutlineSourceEvidenceReport = {
  schemaVersion: 1;
  generatedAt: string;
  pdfs: number;
  pages: number;
  outlineEntries: number;
  classCounts: Record<OutlineEvidenceClass, number>;
  reasonCounts: Record<string, number>;
  destinationKindCounts: Record<string, number>;
  relationshipCounts: {
    entriesSharingPage: number;
    entriesSharingResolvedDestination: number;
    entriesSharingTitleHash: number;
    parentSamePage: number;
    nonMonotonic: number;
  };
  reports: Array<{
    pdfId: string;
    sha256: string;
    pages: number;
    outlineEntries: number;
    entries: OutlineEntryEvidence[];
  }>;
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

type PageAnalysis = {
  page: InspectPage;
  orientation: WritingOrientation;
  bodyFontSize: number;
  physical: PhysicalPageLayout | null;
};

type ResolvedOutlineEntry = {
  sourceOutlinePath: number[];
  parentPath: number[] | null;
  titleSha256: string;
  titleLength: number;
  originalDestination: OriginalDestinationEvidence;
  resolvedDestination: JsonValue | null;
  sourcePage: number | null;
  destinationKind: string;
  displayGeometry: DestinationDisplayGeometry;
  pageGeometry: OutlineEntryEvidence["pageGeometry"];
  unresolvedReason?: "invalid-destination" | "external-destination" | "no-destination";
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function destinationName(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("name" in value)) return null;
  return typeof value.name === "string" ? value.name : null;
}

function jsonSafe(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") {
    if ("num" in value && "gen" in value && typeof value.num === "number" && typeof value.gen === "number") {
      return { ref: { num: value.num, gen: value.gen } };
    }
    if ("name" in value && typeof value.name === "string") return { name: value.name };
    const output: { [key: string]: JsonValue } = {};
    for (const [key, item] of Object.entries(value)) output[key] = jsonSafe(item);
    return output;
  }
  return String(value);
}

function originalDestinationEvidence(destination: string | unknown[] | null): OriginalDestinationEvidence {
  if (destination === null) return { kind: "none" };
  if (typeof destination === "string") {
    return { kind: "named", nameSha256: sha256(destination), nameLength: [...destination].length };
  }
  return { kind: "explicit", value: jsonSafe(destination) };
}

function transformPoint(
  viewport: { convertToViewportPoint(x: number, y: number): [number, number] },
  x: number,
  y: number,
): { x: number; y: number } {
  const [displayX, displayY] = viewport.convertToViewportPoint(x, y);
  return { x: round(displayX), y: round(displayY) };
}

function lineGeometry(
  viewport: { convertToViewportPoint(x: number, y: number): [number, number] },
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): DestinationDisplayGeometry {
  const start = transformPoint(viewport, x1, y1);
  const end = transformPoint(viewport, x2, y2);
  return { kind: "line", x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

function rectGeometry(
  viewport: { convertToViewportPoint(x: number, y: number): [number, number] },
  left: number,
  bottom: number,
  right: number,
  top: number,
): DestinationDisplayGeometry {
  const points = [
    transformPoint(viewport, left, bottom),
    transformPoint(viewport, left, top),
    transformPoint(viewport, right, bottom),
    transformPoint(viewport, right, top),
  ];
  return {
    kind: "rect",
    minX: round(Math.min(...points.map((point) => point.x))),
    minY: round(Math.min(...points.map((point) => point.y))),
    maxX: round(Math.max(...points.map((point) => point.x))),
    maxY: round(Math.max(...points.map((point) => point.y))),
  };
}

export function destinationDisplayGeometry(
  destination: unknown[],
  pageView: number[],
  viewport: { convertToViewportPoint(x: number, y: number): [number, number] },
): { kind: string; geometry: DestinationDisplayGeometry } {
  const kind = destinationName(destination[1]) ?? "unknown";
  const [xMin = 0, yMin = 0, xMax = 0, yMax = 0] = pageView;
  switch (kind) {
    case "XYZ": {
      const left = safeNumber(destination[2]);
      const top = safeNumber(destination[3]);
      if (left !== null && top !== null) {
        const point = transformPoint(viewport, left, top);
        return { kind, geometry: { kind: "point", ...point } };
      }
      if (top !== null) return { kind, geometry: lineGeometry(viewport, xMin, top, xMax, top) };
      if (left !== null) return { kind, geometry: lineGeometry(viewport, left, yMin, left, yMax) };
      return { kind, geometry: { kind: "page" } };
    }
    case "FitH":
    case "FitBH": {
      const top = safeNumber(destination[2]);
      return { kind, geometry: top === null ? { kind: "page" } : lineGeometry(viewport, xMin, top, xMax, top) };
    }
    case "FitV":
    case "FitBV": {
      const left = safeNumber(destination[2]);
      return { kind, geometry: left === null ? { kind: "page" } : lineGeometry(viewport, left, yMin, left, yMax) };
    }
    case "FitR": {
      const left = safeNumber(destination[2]);
      const bottom = safeNumber(destination[3]);
      const right = safeNumber(destination[4]);
      const top = safeNumber(destination[5]);
      if (left === null || bottom === null || right === null || top === null) {
        return { kind, geometry: { kind: "unsupported" } };
      }
      return { kind, geometry: rectGeometry(viewport, left, bottom, right, top) };
    }
    case "Fit":
    case "FitB":
      return { kind, geometry: { kind: "page" } };
    default:
      return { kind, geometry: { kind: "unsupported" } };
  }
}

function geometryBounds(page: InspectPage, unit: PhysicalTextUnit): Bounds | null {
  const ranges = unit.sourceRanges ?? [];
  const itemIndexes = [...new Set(ranges.map((range) => range.itemIndex))];
  const points: Array<{ x: number; y: number }> = [];
  for (const itemIndex of itemIndexes) {
    const item = page.textItems[itemIndex];
    const geometry = item?.displayGeometry;
    if (!geometry) continue;
    const sideX = geometry.side.x * geometry.crossExtent;
    const sideY = geometry.side.y * geometry.crossExtent;
    points.push(
      geometry.start,
      geometry.end,
      { x: geometry.start.x + sideX, y: geometry.start.y + sideY },
      { x: geometry.end.x + sideX, y: geometry.end.y + sideY },
    );
  }
  if (points.length === 0) return null;
  return {
    minX: round(Math.min(...points.map((point) => point.x))),
    minY: round(Math.min(...points.map((point) => point.y))),
    maxX: round(Math.max(...points.map((point) => point.x))),
    maxY: round(Math.max(...points.map((point) => point.y))),
  };
}

function pointInBounds(x: number, y: number, bounds: Bounds): boolean {
  const epsilon = 0.5;
  return x >= bounds.minX - epsilon && x <= bounds.maxX + epsilon &&
    y >= bounds.minY - epsilon && y <= bounds.maxY + epsilon;
}

function lineIntersectsBounds(line: Extract<DestinationDisplayGeometry, { kind: "line" }>, bounds: Bounds): boolean {
  const epsilon = 0.5;
  let tMin = 0;
  let tMax = 1;
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const clips: Array<[number, number]> = [
    [-dx, line.x1 - (bounds.minX - epsilon)],
    [dx, (bounds.maxX + epsilon) - line.x1],
    [-dy, line.y1 - (bounds.minY - epsilon)],
    [dy, (bounds.maxY + epsilon) - line.y1],
  ];
  for (const [p, q] of clips) {
    if (Math.abs(p) < Number.EPSILON) {
      if (q < 0) return false;
      continue;
    }
    const ratio = q / p;
    if (p < 0) tMin = Math.max(tMin, ratio);
    else tMax = Math.min(tMax, ratio);
    if (tMin > tMax) return false;
  }
  return true;
}

function geometryIntersectsBounds(geometry: DestinationDisplayGeometry, bounds: Bounds): boolean {
  if (geometry.kind === "point") return pointInBounds(geometry.x, geometry.y, bounds);
  if (geometry.kind === "line") return lineIntersectsBounds(geometry, bounds);
  if (geometry.kind === "rect") {
    return geometry.maxX >= bounds.minX && geometry.minX <= bounds.maxX &&
      geometry.maxY >= bounds.minY && geometry.minY <= bounds.maxY;
  }
  return false;
}

function sourceCandidate(page: InspectPage, unit: PhysicalTextUnit): OutlineSourceCandidate | null {
  const bounds = geometryBounds(page, unit);
  if (!bounds) return null;
  const sourceRanges = (unit.sourceRanges ?? []).map((range) => ({ ...range }));
  const itemIndexes = [...new Set(sourceRanges.map((range) => range.itemIndex))].sort((a, b) => a - b);
  const glyphRefs: SourceGlyphRef[] = [];
  const seenGlyphs = new Set<string>();
  for (const itemIndex of itemIndexes) {
    for (const glyph of page.textItems[itemIndex]?.glyphs ?? []) {
      const key = `${glyph.source.page}:${glyph.source.operatorIndex}:${glyph.source.glyphIndex}`;
      if (seenGlyphs.has(key)) continue;
      seenGlyphs.add(key);
      glyphRefs.push({ ...glyph.source });
    }
  }
  return { unitIndex: unit.index, sourceRanges, itemIndexes, glyphRefs, bounds };
}

export function classifyDestinationAgainstPage(
  geometry: DestinationDisplayGeometry,
  analysis: PageAnalysis,
): Pick<OutlineEntryEvidence, "evidenceClass" | "reason" | "candidates"> {
  if (geometry.kind === "unsupported") {
    return { evidenceClass: "unmappable", reason: "unsupported-destination", candidates: [] };
  }
  if (geometry.kind === "page") {
    return { evidenceClass: "page-only", reason: "page-destination", candidates: [] };
  }
  if (!analysis.page.textItems.some((item) => item.text.trim().length > 0)) {
    return { evidenceClass: "page-only", reason: "no-visible-text", candidates: [] };
  }
  if (analysis.orientation === "unknown") {
    return { evidenceClass: "page-only", reason: "unresolved-writing-orientation", candidates: [] };
  }
  if (!analysis.physical || analysis.physical.units.length === 0) {
    return { evidenceClass: "page-only", reason: "empty-physical-layout", candidates: [] };
  }
  const candidates = analysis.physical.units
    .map((unit) => sourceCandidate(analysis.page, unit))
    .filter((candidate): candidate is OutlineSourceCandidate => candidate !== null)
    .filter((candidate) => geometryIntersectsBounds(geometry, candidate.bounds));
  if (candidates.length === 1) {
    return { evidenceClass: "unique-position", reason: "single-unit-intersection", candidates };
  }
  if (candidates.length > 1) {
    return { evidenceClass: "ambiguous-position", reason: "multiple-unit-intersections", candidates };
  }
  return { evidenceClass: "page-only", reason: "no-source-intersection", candidates: [] };
}

async function resolvePageIndex(pdf: OutlineReader, destination: unknown[]): Promise<number> {
  const first = destination[0];
  if (typeof first === "number") return first;
  if (typeof first === "object" && first !== null && "num" in first && "gen" in first &&
      typeof first.num === "number" && Number.isInteger(first.num) && first.num > 0 &&
      typeof first.gen === "number" && Number.isInteger(first.gen) && first.gen >= 0) {
    return pdf.getPageIndex({ num: first.num, gen: first.gen });
  }
  throw new Error("invalid page reference");
}

async function resolveOutlineEntries(pdf: OutlineReader): Promise<ResolvedOutlineEntry[]> {
  const outline = await pdf.getOutline() ?? [];
  const output: ResolvedOutlineEntry[] = [];
  async function visit(items: PdfOutlineItem[], parentPath: number[] | null): Promise<void> {
    for (const [index, item] of items.entries()) {
      const sourceOutlinePath = [...(parentPath ?? []), index];
      const base = {
        sourceOutlinePath,
        parentPath,
        titleSha256: sha256(item.title),
        titleLength: [...item.title].length,
        originalDestination: originalDestinationEvidence(item.dest),
      };
      if (item.url || item.unsafeUrl) {
        output.push({
          ...base,
          resolvedDestination: null,
          sourcePage: null,
          destinationKind: "external",
          displayGeometry: { kind: "unsupported" },
          pageGeometry: null,
          unresolvedReason: "external-destination",
        });
        await visit(item.items, sourceOutlinePath);
        continue;
      }
      if (item.dest === null) {
        output.push({
          ...base,
          resolvedDestination: null,
          sourcePage: null,
          destinationKind: "none",
          displayGeometry: { kind: "unsupported" },
          pageGeometry: null,
          unresolvedReason: "no-destination",
        });
        await visit(item.items, sourceOutlinePath);
        continue;
      }
      try {
        const destination = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
        if (!Array.isArray(destination) || destination.length < 2) throw new Error("invalid destination");
        const pageIndex = await resolvePageIndex(pdf, destination);
        if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pdf.numPages) throw new Error("page out of range");
        const page = await pdf.getPage(pageIndex + 1);
        try {
          const viewport = page.getViewport({ scale: 1 });
          const parsed = destinationDisplayGeometry(destination, [...page.view], viewport);
          output.push({
            ...base,
            resolvedDestination: jsonSafe(destination),
            sourcePage: pageIndex + 1,
            destinationKind: parsed.kind,
            displayGeometry: parsed.geometry,
            pageGeometry: {
              rotation: viewport.rotation,
              userUnit: page.userUnit,
              view: [...page.view].map((value) => round(value)),
              viewportTransform: [...viewport.transform].map((value) => round(value)),
              width: round(viewport.width),
              height: round(viewport.height),
            },
          });
        } finally {
          page.cleanup();
        }
      } catch {
        output.push({
          ...base,
          resolvedDestination: null,
          sourcePage: null,
          destinationKind: "invalid",
          displayGeometry: { kind: "unsupported" },
          pageGeometry: null,
          unresolvedReason: "invalid-destination",
        });
      }
      await visit(item.items, sourceOutlinePath);
    }
  }
  await visit(outline, null);
  return output;
}

function buildPageAnalyses(pages: InspectPage[]): Map<number, PageAnalysis> {
  const flows = pages.map((page) => ({ page, flow: reconstructPageFlow(page) }));
  const resolved = resolveDocumentOrientations(flows.map(({ page, flow }) => ({
    page: page.page,
    orientation: flow.orientation,
  })));
  const orientationByPage = new Map(resolved.map((entry) => [entry.page, entry.resolved]));
  const analyses = new Map<number, PageAnalysis>();
  for (const { page, flow } of flows) {
    const orientation = orientationByPage.get(page.page) ?? flow.orientation;
    const physical = orientation === "unknown" ? null : reconstructPhysicalLayout(page, orientation, flow.bodyFontSize);
    analyses.set(page.page, { page, orientation, bodyFontSize: flow.bodyFontSize, physical });
  }
  return analyses;
}

function destinationKey(entry: ResolvedOutlineEntry): string | null {
  return entry.sourcePage === null || entry.resolvedDestination === null
    ? null
    : `${entry.sourcePage}:${JSON.stringify(entry.resolvedDestination)}`;
}

function pathKey(value: number[]): string {
  return value.join("/");
}

function addRelationships(entries: ResolvedOutlineEntry[], evidence: OutlineEntryEvidence[]): void {
  const pageCounts = new Map<number, number>();
  const destinationCounts = new Map<string, number>();
  const titleCounts = new Map<string, number>();
  const sourceByPath = new Map(entries.map((entry) => [pathKey(entry.sourceOutlinePath), entry]));
  for (const entry of entries) {
    if (entry.sourcePage !== null) pageCounts.set(entry.sourcePage, (pageCounts.get(entry.sourcePage) ?? 0) + 1);
    const key = destinationKey(entry);
    if (key) destinationCounts.set(key, (destinationCounts.get(key) ?? 0) + 1);
    titleCounts.set(entry.titleSha256, (titleCounts.get(entry.titleSha256) ?? 0) + 1);
  }
  let previousResolvedPage: number | null = null;
  for (const [index, entry] of entries.entries()) {
    const item = evidence[index];
    if (!item) continue;
    const parent = entry.parentPath ? sourceByPath.get(pathKey(entry.parentPath)) : undefined;
    const key = destinationKey(entry);
    const nonMonotonic = entry.sourcePage !== null && previousResolvedPage !== null && entry.sourcePage < previousResolvedPage;
    item.relationships = {
      samePageEntryCount: entry.sourcePage === null ? 0 : pageCounts.get(entry.sourcePage) ?? 0,
      sameResolvedDestinationCount: key === null ? 0 : destinationCounts.get(key) ?? 0,
      sameTitleHashCount: titleCounts.get(entry.titleSha256) ?? 0,
      parentSamePage: parent?.sourcePage !== null && parent?.sourcePage === entry.sourcePage,
      nonMonotonicFromPreviousResolvedEntry: nonMonotonic,
    };
    if (entry.sourcePage !== null) previousResolvedPage = entry.sourcePage;
  }
}

async function inspectOnePdf(inputPath: string): Promise<OutlineSourceEvidenceReport["reports"][number]> {
  const bytes = new Uint8Array(await readFile(inputPath));
  const digest = sha256(bytes);
  const inspection = await inspectPdf(inputPath, { includeGlyphs: true });
  const pageAnalyses = buildPageAnalyses(inspection.pages);
  const task = getDocument({ data: bytes });
  let resolvedEntries: ResolvedOutlineEntry[];
  try {
    resolvedEntries = await resolveOutlineEntries(await task.promise as unknown as OutlineReader);
  } finally {
    await task.destroy();
  }
  const evidence: OutlineEntryEvidence[] = resolvedEntries.map((entry) => {
    const analysis = entry.sourcePage === null ? undefined : pageAnalyses.get(entry.sourcePage);
    let classification: Pick<OutlineEntryEvidence, "evidenceClass" | "reason" | "candidates">;
    if (entry.unresolvedReason) {
      classification = { evidenceClass: "unmappable", reason: entry.unresolvedReason, candidates: [] };
    } else if (!analysis) {
      classification = { evidenceClass: "unmappable", reason: "invalid-destination", candidates: [] };
    } else {
      classification = classifyDestinationAgainstPage(entry.displayGeometry, analysis);
    }
    return {
      sourceOutlinePath: [...entry.sourceOutlinePath],
      titleSha256: entry.titleSha256,
      titleLength: entry.titleLength,
      originalDestination: structuredClone(entry.originalDestination),
      resolvedDestination: structuredClone(entry.resolvedDestination),
      sourcePage: entry.sourcePage,
      destinationKind: entry.destinationKind,
      displayGeometry: structuredClone(entry.displayGeometry),
      pageGeometry: structuredClone(entry.pageGeometry),
      writingOrientation: analysis?.orientation ?? null,
      bodyFontSize: analysis ? round(analysis.bodyFontSize) : null,
      ...classification,
      relationships: {
        samePageEntryCount: 0,
        sameResolvedDestinationCount: 0,
        sameTitleHashCount: 0,
        parentSamePage: false,
        nonMonotonicFromPreviousResolvedEntry: false,
      },
    };
  });
  addRelationships(resolvedEntries, evidence);
  return {
    pdfId: `sha256:${digest.slice(0, 16)}`,
    sha256: digest,
    pages: inspection.pageCount,
    outlineEntries: evidence.length,
    entries: evidence,
  };
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

export function summarizeOutlineSourceEvidence(
  reports: OutlineSourceEvidenceReport["reports"],
  generatedAt = new Date().toISOString(),
): OutlineSourceEvidenceReport {
  const classCounts: Record<OutlineEvidenceClass, number> = {
    "unique-position": 0,
    "ambiguous-position": 0,
    "page-only": 0,
    unmappable: 0,
  };
  const reasonCounts: Record<string, number> = {};
  const destinationKindCounts: Record<string, number> = {};
  const relationshipCounts = {
    entriesSharingPage: 0,
    entriesSharingResolvedDestination: 0,
    entriesSharingTitleHash: 0,
    parentSamePage: 0,
    nonMonotonic: 0,
  };
  for (const report of reports) {
    for (const entry of report.entries) {
      classCounts[entry.evidenceClass] += 1;
      increment(reasonCounts, entry.reason);
      increment(destinationKindCounts, entry.destinationKind);
      if (entry.relationships.samePageEntryCount > 1) relationshipCounts.entriesSharingPage += 1;
      if (entry.relationships.sameResolvedDestinationCount > 1) relationshipCounts.entriesSharingResolvedDestination += 1;
      if (entry.relationships.sameTitleHashCount > 1) relationshipCounts.entriesSharingTitleHash += 1;
      if (entry.relationships.parentSamePage) relationshipCounts.parentSamePage += 1;
      if (entry.relationships.nonMonotonicFromPreviousResolvedEntry) relationshipCounts.nonMonotonic += 1;
    }
  }
  return {
    schemaVersion: 1,
    generatedAt,
    pdfs: reports.length,
    pages: reports.reduce((sum, report) => sum + report.pages, 0),
    outlineEntries: reports.reduce((sum, report) => sum + report.outlineEntries, 0),
    classCounts,
    reasonCounts,
    destinationKindCounts,
    relationshipCounts,
    reports,
  };
}

export async function inspectOutlineSourceEvidence(inputPath: string): Promise<OutlineSourceEvidenceReport["reports"][number]> {
  return inspectOnePdf(inputPath);
}

function parseArgs(argv: string[]): { input: string; output?: string; expectedOutlineCount?: number } {
  let input: string | undefined;
  let output: string | undefined;
  let expectedOutlineCount: number | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) {
      if (input) throw new Error("only one PDF_OR_DIRECTORY input is allowed");
      input = argument;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${argument}`);
    index += 1;
    if (argument === "--output") output = value;
    else if (argument === "--expect-outline-count") {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) throw new Error("--expect-outline-count must be a non-negative integer");
      expectedOutlineCount = parsed;
    } else throw new Error(`unknown option ${argument}`);
  }
  if (!input) {
    throw new Error("usage: npm run inspect:outline-evidence -- PDF_OR_DIRECTORY [--output NEW_FILE] [--expect-outline-count N]");
  }
  return {
    input,
    ...(output === undefined ? {} : { output }),
    ...(expectedOutlineCount === undefined ? {} : { expectedOutlineCount }),
  };
}

async function main(): Promise<void> {
  const { input, output, expectedOutlineCount } = parseArgs(process.argv.slice(2));
  const inputStat = await stat(input);
  const files = inputStat.isDirectory()
    ? (await readdir(input, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
      .map((entry) => path.join(input, entry.name))
      .sort()
    : [input];
  if (files.length === 0) throw new Error("no PDF files found");
  const reports: OutlineSourceEvidenceReport["reports"] = [];
  for (const [index, file] of files.entries()) {
    process.stderr.write(`Outline/source evidence: ${index + 1}/${files.length}\n`);
    reports.push(await inspectOnePdf(file));
  }
  const report = summarizeOutlineSourceEvidence(reports);
  if (expectedOutlineCount !== undefined && report.outlineEntries !== expectedOutlineCount) {
    throw new Error(`outline count mismatch: expected ${expectedOutlineCount}, found ${report.outlineEntries}`);
  }
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output) await writeFile(output, serialized, { flag: "wx" });
  else process.stdout.write(serialized);
  process.stderr.write(
    `Outline entries: ${report.outlineEntries}; unique-position=${report.classCounts["unique-position"]}; ` +
    `ambiguous-position=${report.classCounts["ambiguous-position"]}; page-only=${report.classCounts["page-only"]}; ` +
    `unmappable=${report.classCounts.unmappable}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
