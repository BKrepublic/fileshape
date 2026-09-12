import { createHash } from "node:crypto";
import type { InspectResult } from "./pdf-inspector.js";
import type { RubySpan } from "./ruby-spans.js";
import type { SemanticBlock, SemanticPageBlocks } from "./semantic-blocks.js";
import { mergeSourceRanges, type SourceGlyphRef, type SourceTextRef } from "./source-text.js";
import type { WritingOrientation } from "./text-flow.js";
import {
  buildDocumentNavigation,
  validateDocumentNavigation,
  type DocumentNavigationItem,
  type SourceOutlineItem,
} from "./document-navigation.js";

export type SourceTextItemRecord = {
  itemIndex: number;
  /** Exact unmodified PDF.js TextItem.str captured during inspection. */
  text: string;
};

export type SourcePageRecord = {
  page: number;
  textItems: SourceTextItemRecord[];
};

/** The source store is the only text target addressed by SourceTextRef in a
 * FileShapeDocument. Reconstructed/semantic strings are derived views. */
export type DocumentSourceStore = {
  documentId: string;
  pages: SourcePageRecord[];
  /** Exact outline titles/destinations captured separately from PDF text items. */
  outline?: SourceOutlineItem[];
};

export type SourceBackedText = {
  /** Exact UTF-16 slices resolved from sourceRanges, not a guessed reconstruction. */
  text: string;
  sourceRanges: SourceTextRef[];
};

export type TextInlineNode = SourceBackedText & {
  kind: "text";
};

export type RubyInlinePart = SourceBackedText & {
  glyphRefs: SourceGlyphRef[];
};

export type RubyInlineNode = {
  kind: "ruby";
  base: RubyInlinePart;
  annotation: RubyInlinePart;
};

export type InlineNode = TextInlineNode | RubyInlineNode;

export type DocumentTextBlock = {
  kind: "text";
  sourcePage: number;
  semanticBlockIndex: number;
  unitIndexes: number[];
  /** Existing Stage 2 semantic view. It is not the source-of-truth for provenance. */
  semanticText: string;
  /** Complete source coverage owned by this semantic block before inline splitting. */
  sourceRanges: SourceTextRef[];
  inlines: InlineNode[];
};

export type DocumentImageResource = {
  id: string;
  contentHash: string;
  mediaType: "image/png";
  extension: "png";
  width: number;
  height: number;
  bytes: Uint8Array;
};

export type DocumentImageOccurrence = {
  kind: "image";
  sourcePage: number;
  operatorIndex: number;
  occurrenceIndex: number;
  resourceId: string;
  displayTransform: number[];
  displayBounds: { left: number; top: number; right: number; bottom: number };
  formDepth: number;
  interpolate: boolean;
  clipStatus: "none" | "exact-rect";
  clipCoverage: "none" | "contains-image";
  clipRect?: { left: number; top: number; right: number; bottom: number };
};

export type DocumentPage = {
  kind: "page";
  sourcePage: number;
  rotation: number;
  orientation: WritingOrientation;
  blocks: DocumentTextBlock[];
  imageOccurrences: DocumentImageOccurrence[];
  /** Fail-closed Stage 3 candidates retained for later policy/reconsideration. */
  unresolvedRuby: RubySpan[];
  /** Exact spans that could not be mapped to exactly one semantic block. */
  unmappedExactRuby: RubySpan[];
};

export type FileShapeDocument = {
  kind: "document";
  id: string;
  source: DocumentSourceStore;
  pages: DocumentPage[];
  imageResources: DocumentImageResource[];
  navigation?: DocumentNavigationItem[];
};

export type DocumentPageInput = {
  page: number;
  orientation: WritingOrientation;
  semantic: SemanticPageBlocks;
  rubySpans: RubySpan[];
};

export type BuildDocumentInput = {
  /** Required identity of the inspected source document. */
  documentId: string;
  inspection: InspectResult;
  pages: DocumentPageInput[];
};

function cloneTextRefs(ranges: SourceTextRef[]): SourceTextRef[] {
  return ranges.map((range) => ({ ...range }));
}

function cloneGlyphRefs(refs: SourceGlyphRef[]): SourceGlyphRef[] {
  return refs.map((ref) => ({ ...ref }));
}

function cloneRubySpan(span: RubySpan): RubySpan {
  return {
    ...span,
    annotationSourceRanges: cloneTextRefs(span.annotationSourceRanges),
    baseSourceRanges: cloneTextRefs(span.baseSourceRanges),
    annotationGlyphRefs: cloneGlyphRefs(span.annotationGlyphRefs),
    baseGlyphRefs: cloneGlyphRefs(span.baseGlyphRefs),
    alternatives: span.alternatives.map(cloneTextRefs),
  };
}

function cloneImageOccurrence(occurrence: NonNullable<InspectResult["pages"][number]["imageOccurrences"]>[number]): DocumentImageOccurrence {
  if (occurrence.clipStatus !== "none" && occurrence.clipStatus !== "exact-rect") {
    throw new Error(`unsupported model image clip status ${occurrence.clipStatus}`);
  }
  if (occurrence.clipCoverage !== "none" && occurrence.clipCoverage !== "contains-image") {
    throw new Error(`unsupported model image clip coverage ${occurrence.clipCoverage}`);
  }
  return {
    kind: "image",
    sourcePage: occurrence.sourcePage,
    operatorIndex: occurrence.operatorIndex,
    occurrenceIndex: occurrence.occurrenceIndex,
    resourceId: occurrence.resourceId,
    displayTransform: [...occurrence.displayTransform],
    displayBounds: { ...occurrence.displayBounds },
    formDepth: occurrence.formDepth,
    interpolate: occurrence.interpolate,
    clipStatus: occurrence.clipStatus,
    clipCoverage: occurrence.clipCoverage,
    ...(occurrence.clipRect === undefined ? {} : { clipRect: { ...occurrence.clipRect } }),
  };
}

function sourcePage(store: DocumentSourceStore, pageNumber: number): SourcePageRecord | undefined {
  return store.pages.find((page) => page.page === pageNumber);
}

export function resolveSourceTextRef(store: DocumentSourceStore, ref: SourceTextRef): string {
  if (!Number.isInteger(ref.page) || ref.page < 1 || !Number.isInteger(ref.itemIndex) || ref.itemIndex < 0 ||
      !Number.isInteger(ref.charStart) || !Number.isInteger(ref.charEnd) || ref.charStart < 0 || ref.charEnd < ref.charStart) {
    throw new RangeError(`invalid SourceTextRef ${JSON.stringify(ref)}`);
  }
  const page = sourcePage(store, ref.page);
  if (!page) throw new RangeError(`missing source page ${ref.page}`);
  const item = page.textItems[ref.itemIndex];
  if (!item || item.itemIndex !== ref.itemIndex) {
    throw new RangeError(`missing source item ${ref.page}/${ref.itemIndex}`);
  }
  if (ref.charEnd > item.text.length) {
    throw new RangeError(`source range exceeds UTF-16 length ${ref.page}/${ref.itemIndex}:${ref.charStart}-${ref.charEnd}`);
  }
  return item.text.slice(ref.charStart, ref.charEnd);
}

export function resolveSourceRanges(store: DocumentSourceStore, ranges: SourceTextRef[]): string {
  return ranges.map((range) => resolveSourceTextRef(store, range)).join("");
}

function overlaps(left: SourceTextRef, right: SourceTextRef): boolean {
  return left.page === right.page && left.itemIndex === right.itemIndex &&
    Math.max(left.charStart, right.charStart) < Math.min(left.charEnd, right.charEnd);
}

function containsPositionally(container: SourceTextRef, target: SourceTextRef): boolean {
  return container.page === target.page && container.itemIndex === target.itemIndex &&
    container.charStart <= target.charStart && container.charEnd >= target.charEnd;
}

function refCoveredBy(target: SourceTextRef, containers: SourceTextRef[]): boolean {
  if (target.charStart === target.charEnd) {
    return containers.some((container) => containsPositionally(container, target));
  }
  const candidates = containers
    .filter((container) => container.page === target.page && container.itemIndex === target.itemIndex)
    .sort((left, right) => left.charStart - right.charStart || left.charEnd - right.charEnd);
  let cursor = target.charStart;
  for (const candidate of candidates) {
    if (candidate.charEnd <= cursor) continue;
    if (candidate.charStart > cursor) return false;
    cursor = Math.max(cursor, candidate.charEnd);
    if (cursor >= target.charEnd) return true;
  }
  return false;
}

function rangesCoveredBy(targets: SourceTextRef[], containers: SourceTextRef[]): boolean {
  return targets.every((target) => refCoveredBy(target, containers));
}

function hasOverlap(ranges: SourceTextRef[]): boolean {
  for (let left = 0; left < ranges.length; left += 1) {
    for (let right = left + 1; right < ranges.length; right += 1) {
      if (overlaps(ranges[left]!, ranges[right]!)) return true;
    }
  }
  return false;
}

function sameCoverage(left: SourceTextRef[], right: SourceTextRef[]): boolean {
  return rangesCoveredBy(left, right) && rangesCoveredBy(right, left);
}

function buildSourceStore(documentId: string, inspection: InspectResult): DocumentSourceStore {
  if (documentId.trim().length === 0) throw new Error("documentId must not be empty");
  return {
    documentId,
    ...(inspection.outline === undefined ? {} : { outline: structuredClone(inspection.outline) }),
    pages: inspection.pages.map((page) => ({
      page: page.page,
      textItems: page.textItems.map((item, itemIndex) => ({ itemIndex, text: item.text })),
    })),
  };
}

type Piece = { owner: RubySpan | undefined; range: SourceTextRef };

function ownerForPiece(piece: SourceTextRef, spans: RubySpan[]): RubySpan | undefined {
  const owners = spans.filter((span) => span.baseSourceRanges.some((range) => containsPositionally(range, piece)));
  if (owners.length > 1) {
    throw new Error(`overlapping exact ruby source ownership at ${piece.page}/${piece.itemIndex}:${piece.charStart}-${piece.charEnd}`);
  }
  return owners[0];
}

function splitBlockRanges(blockRanges: SourceTextRef[], spans: RubySpan[]): Piece[] {
  const pieces: Piece[] = [];
  for (const blockRange of blockRanges) {
    const cuts = new Set<number>([blockRange.charStart, blockRange.charEnd]);
    for (const span of spans) for (const baseRange of span.baseSourceRanges) {
      if (!overlaps(blockRange, baseRange)) continue;
      cuts.add(Math.max(blockRange.charStart, baseRange.charStart));
      cuts.add(Math.min(blockRange.charEnd, baseRange.charEnd));
    }
    const ordered = [...cuts].sort((left, right) => left - right);
    for (let index = 1; index < ordered.length; index += 1) {
      const charStart = ordered[index - 1]!;
      const charEnd = ordered[index]!;
      if (charEnd <= charStart) continue;
      const range = { ...blockRange, charStart, charEnd };
      pieces.push({ owner: ownerForPiece(range, spans), range });
    }
  }
  return pieces;
}

function makeTextInline(store: DocumentSourceStore, ranges: SourceTextRef[]): TextInlineNode {
  const sourceRanges = mergeSourceRanges(cloneTextRefs(ranges));
  return { kind: "text", text: resolveSourceRanges(store, sourceRanges), sourceRanges };
}

function makeRubyInline(store: DocumentSourceStore, span: RubySpan): RubyInlineNode {
  const baseRanges = cloneTextRefs(span.baseSourceRanges);
  const annotationRanges = cloneTextRefs(span.annotationSourceRanges);
  return {
    kind: "ruby",
    base: {
      text: resolveSourceRanges(store, baseRanges),
      sourceRanges: baseRanges,
      glyphRefs: cloneGlyphRefs(span.baseGlyphRefs),
    },
    annotation: {
      text: resolveSourceRanges(store, annotationRanges),
      sourceRanges: annotationRanges,
      glyphRefs: cloneGlyphRefs(span.annotationGlyphRefs),
    },
  };
}

function buildBlockInlines(
  store: DocumentSourceStore,
  block: SemanticBlock,
  spans: RubySpan[],
): InlineNode[] {
  const blockRanges = cloneTextRefs(block.sourceRanges ?? []);
  if (block.text.length > 0 && blockRanges.length === 0) {
    throw new Error(`semantic block ${block.index} has text but no source provenance`);
  }
  if (hasOverlap(blockRanges)) throw new Error(`semantic block ${block.index} has overlapping source ranges`);
  for (const range of blockRanges) resolveSourceTextRef(store, range);

  const pieces = splitBlockRanges(blockRanges, spans);
  const nodes: InlineNode[] = [];
  const emittedRuby = new Set<RubySpan>();
  let index = 0;
  while (index < pieces.length) {
    const owner = pieces[index]!.owner;
    const group: SourceTextRef[] = [];
    while (index < pieces.length && pieces[index]!.owner === owner) {
      group.push(pieces[index]!.range);
      index += 1;
    }
    if (!owner) {
      nodes.push(makeTextInline(store, group));
      continue;
    }
    if (emittedRuby.has(owner)) {
      throw new Error(`exact ruby span is non-contiguous in semantic block ${block.index}`);
    }
    if (!sameCoverage(owner.baseSourceRanges, group)) {
      throw new Error(`exact ruby span coverage changed in semantic block ${block.index}`);
    }
    emittedRuby.add(owner);
    nodes.push(makeRubyInline(store, owner));
  }

  if (emittedRuby.size !== spans.length) {
    throw new Error(`not every exact ruby span was emitted in semantic block ${block.index}`);
  }
  return nodes;
}

function assignedExactSpans(semantic: SemanticPageBlocks, rubySpans: RubySpan[]): {
  byBlock: Map<SemanticBlock, RubySpan[]>;
  unmapped: RubySpan[];
} {
  const byBlock = new Map<SemanticBlock, RubySpan[]>();
  const unmapped: RubySpan[] = [];
  for (const span of rubySpans) {
    if (span.status !== "exact") continue;
    const matches = semantic.blocks.filter((block) => {
      const ranges = block.sourceRanges ?? [];
      return span.baseSourceRanges.length > 0 && rangesCoveredBy(span.baseSourceRanges, ranges);
    });
    if (matches.length !== 1) {
      unmapped.push(cloneRubySpan(span));
      continue;
    }
    const block = matches[0]!;
    const assigned = byBlock.get(block) ?? [];
    assigned.push(span);
    byBlock.set(block, assigned);
  }
  return { byBlock, unmapped };
}

export function buildFileShapeDocument(input: BuildDocumentInput): FileShapeDocument {
  const source = buildSourceStore(input.documentId, input.inspection);
  if (input.inspection.pageCount !== input.inspection.pages.length) {
    throw new Error("inspection pageCount does not match extracted pages");
  }
  const inputPages = new Map<number, DocumentPageInput>();
  for (const page of input.pages) {
    if (inputPages.has(page.page)) throw new Error(`duplicate DocumentPageInput for page ${page.page}`);
    inputPages.set(page.page, page);
  }

  const pages = input.inspection.pages.map((inspectionPage): DocumentPage => {
    const pageInput = inputPages.get(inspectionPage.page);
    if (!pageInput) throw new Error(`missing DocumentPageInput for page ${inspectionPage.page}`);
    const { byBlock, unmapped } = assignedExactSpans(pageInput.semantic, pageInput.rubySpans);
    const blocks = pageInput.semantic.blocks.map((block): DocumentTextBlock => {
      const sourceRanges = cloneTextRefs(block.sourceRanges ?? []);
      return {
        kind: "text",
        sourcePage: inspectionPage.page,
        semanticBlockIndex: block.index,
        unitIndexes: [...block.unitIndexes],
        semanticText: block.text,
        sourceRanges,
        inlines: buildBlockInlines(source, block, byBlock.get(block) ?? []),
      };
    });
    return {
      kind: "page",
      sourcePage: inspectionPage.page,
      rotation: inspectionPage.rotation,
      orientation: pageInput.orientation,
      blocks,
      imageOccurrences: (inspectionPage.imageOccurrences ?? []).map(cloneImageOccurrence),
      unresolvedRuby: pageInput.rubySpans.filter((span) => span.status === "unresolved").map(cloneRubySpan),
      unmappedExactRuby: unmapped,
    };
  });

  if (inputPages.size !== pages.length) {
    const extras = [...inputPages.keys()].filter((page) => !sourcePage(source, page));
    if (extras.length > 0) throw new Error(`DocumentPageInput references missing source page(s): ${extras.join(", ")}`);
  }

  return {
    kind: "document", id: input.documentId, source, pages,
    imageResources: (input.inspection.imageResources ?? []).map((resource) => ({
      id: resource.id,
      contentHash: resource.contentHash,
      mediaType: resource.mediaType,
      extension: resource.extension,
      width: resource.width,
      height: resource.height,
      bytes: Uint8Array.from(resource.bytes),
    })),
    ...(source.outline === undefined ? {} : { navigation: buildDocumentNavigation(source.outline) }),
  };
}

function validateRanges(store: DocumentSourceStore, ranges: SourceTextRef[], label: string, errors: string[]): void {
  for (const range of ranges) {
    try { resolveSourceTextRef(store, range); }
    catch (error) { errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
  }
}

function validateRubyCandidate(store: DocumentSourceStore, span: RubySpan, label: string, errors: string[]): void {
  validateRanges(store, span.annotationSourceRanges, `${label} annotation`, errors);
  validateRanges(store, span.baseSourceRanges, `${label} base`, errors);
  for (let index = 0; index < span.alternatives.length; index += 1) {
    validateRanges(store, span.alternatives[index] ?? [], `${label} alternative ${index}`, errors);
  }
}

export function validateDocumentModel(document: FileShapeDocument): string[] {
  const errors: string[] = [];
  if (document.id.trim().length === 0) errors.push("document id is empty");
  if (document.source.documentId !== document.id) errors.push("source store documentId does not match document id");

  const imageResourceIds = new Set<string>();
  const imageContentHashes = new Set<string>();
  for (const resource of document.imageResources) {
    const label = `image resource ${resource.id}`;
    if (resource.id.trim().length === 0) errors.push("image resource id is empty");
    if (imageResourceIds.has(resource.id)) errors.push(`duplicate image resource id ${resource.id}`);
    imageResourceIds.add(resource.id);
    if (!/^[0-9a-f]{64}$/.test(resource.contentHash)) errors.push(`${label} has invalid content hash`);
    if (resource.id !== `image-${resource.contentHash}`) errors.push(`${label} id does not match content hash`);
    if (imageContentHashes.has(resource.contentHash)) errors.push(`duplicate image content hash ${resource.contentHash}`);
    imageContentHashes.add(resource.contentHash);
    if (resource.mediaType !== "image/png" || resource.extension !== "png") errors.push(`${label} has unsupported format`);
    if (!Number.isInteger(resource.width) || resource.width <= 0 ||
        !Number.isInteger(resource.height) || resource.height <= 0) errors.push(`${label} has invalid dimensions`);
    if (resource.bytes.byteLength === 0) errors.push(`${label} has no bytes`);
    else if (createHash("sha256").update(resource.bytes).digest("hex") !== resource.contentHash) {
      errors.push(`${label} bytes do not match content hash`);
    }
  }

  const sourcePages = new Set<number>();
  for (const page of document.source.pages) {
    if (sourcePages.has(page.page)) errors.push(`duplicate source page ${page.page}`);
    sourcePages.add(page.page);
    page.textItems.forEach((item, index) => {
      if (item.itemIndex !== index) errors.push(`source page ${page.page} item index ${item.itemIndex} is not addressable at ${index}`);
    });
  }

  const modelPages = new Set<number>();
  const imageOccurrenceSources = new Set<string>();
  const referencedImageResourceIds = new Set<string>();
  for (const page of document.pages) {
    if (modelPages.has(page.sourcePage)) errors.push(`duplicate document page ${page.sourcePage}`);
    modelPages.add(page.sourcePage);
    if (!sourcePages.has(page.sourcePage)) errors.push(`document page ${page.sourcePage} has no source page`);
    let previousImageSource: [number, number] | undefined;
    for (const occurrence of page.imageOccurrences) {
      const label = `page ${page.sourcePage} image ${occurrence.operatorIndex}/${occurrence.occurrenceIndex}`;
      const sourceKey = `${occurrence.sourcePage}:${occurrence.operatorIndex}:${occurrence.occurrenceIndex}`;
      if (occurrence.sourcePage !== page.sourcePage) errors.push(`${label} source page does not match containing page`);
      if (!Number.isInteger(occurrence.operatorIndex) || occurrence.operatorIndex < 0 ||
          !Number.isInteger(occurrence.occurrenceIndex) || occurrence.occurrenceIndex < 0) {
        errors.push(`${label} has invalid source indexes`);
      }
      if (imageOccurrenceSources.has(sourceKey)) errors.push(`duplicate image occurrence source ${sourceKey}`);
      imageOccurrenceSources.add(sourceKey);
      if (!imageResourceIds.has(occurrence.resourceId)) errors.push(`${label} references missing resource ${occurrence.resourceId}`);
      referencedImageResourceIds.add(occurrence.resourceId);
      if (previousImageSource && (occurrence.operatorIndex < previousImageSource[0] ||
          (occurrence.operatorIndex === previousImageSource[0] && occurrence.occurrenceIndex <= previousImageSource[1]))) {
        errors.push(`${label} is not in source operator order`);
      }
      previousImageSource = [occurrence.operatorIndex, occurrence.occurrenceIndex];
      if (occurrence.displayTransform.length !== 6 || !occurrence.displayTransform.every(Number.isFinite)) {
        errors.push(`${label} has invalid display transform`);
      }
      const bounds = occurrence.displayBounds;
      if (![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite) ||
          bounds.right <= bounds.left || bounds.bottom <= bounds.top) errors.push(`${label} has invalid display bounds`);
      if (!Number.isInteger(occurrence.formDepth) || occurrence.formDepth < 0) errors.push(`${label} has invalid form depth`);
      if (typeof occurrence.interpolate !== "boolean") errors.push(`${label} has invalid interpolation evidence`);
      if (!((occurrence.clipStatus === "none" && occurrence.clipCoverage === "none") ||
          (occurrence.clipStatus === "exact-rect" && occurrence.clipCoverage === "contains-image"))) {
        errors.push(`${label} has unsupported clip state ${occurrence.clipStatus}/${occurrence.clipCoverage}`);
      }
    }
    for (let index = 0; index < page.unresolvedRuby.length; index += 1) {
      const span = page.unresolvedRuby[index]!;
      if (span.status !== "unresolved") errors.push(`page ${page.sourcePage} unresolvedRuby ${index} is not unresolved`);
      validateRubyCandidate(document.source, span, `page ${page.sourcePage} unresolved ruby ${index}`, errors);
    }
    for (let index = 0; index < page.unmappedExactRuby.length; index += 1) {
      const span = page.unmappedExactRuby[index]!;
      if (span.status !== "exact") errors.push(`page ${page.sourcePage} unmappedExactRuby ${index} is not exact`);
      errors.push(`page ${page.sourcePage} exact ruby ${index} is not mapped to exactly one block`);
      validateRubyCandidate(document.source, span, `page ${page.sourcePage} unmapped exact ruby ${index}`, errors);
    }

    for (const block of page.blocks) {
      const label = `page ${page.sourcePage} block ${block.semanticBlockIndex}`;
      validateRanges(document.source, block.sourceRanges, `${label} source`, errors);
      if (hasOverlap(block.sourceRanges)) errors.push(`${label} has overlapping source ranges`);
      const owned: SourceTextRef[] = [];
      for (let index = 0; index < block.inlines.length; index += 1) {
        const inline = block.inlines[index]!;
        if (inline.kind === "text") {
          validateRanges(document.source, inline.sourceRanges, `${label} inline ${index}`, errors);
          try {
            const sourceText = resolveSourceRanges(document.source, inline.sourceRanges);
            if (inline.text !== sourceText) errors.push(`${label} inline ${index} text differs from source ranges`);
          } catch { /* range error already reported above */ }
          owned.push(...inline.sourceRanges);
          continue;
        }
        validateRanges(document.source, inline.base.sourceRanges, `${label} ruby ${index} base`, errors);
        validateRanges(document.source, inline.annotation.sourceRanges, `${label} ruby ${index} annotation`, errors);
        try {
          if (inline.base.text !== resolveSourceRanges(document.source, inline.base.sourceRanges)) {
            errors.push(`${label} ruby ${index} base text differs from source ranges`);
          }
          if (inline.annotation.text !== resolveSourceRanges(document.source, inline.annotation.sourceRanges)) {
            errors.push(`${label} ruby ${index} annotation text differs from source ranges`);
          }
        } catch { /* range error already reported above */ }
        owned.push(...inline.base.sourceRanges);
      }
      if (hasOverlap(owned)) errors.push(`${label} inline source ownership overlaps`);
      if (!sameCoverage(block.sourceRanges, owned)) errors.push(`${label} inline source ownership has a gap or extra range`);
    }
  }
  for (const resourceId of imageResourceIds) {
    if (!referencedImageResourceIds.has(resourceId)) errors.push(`unused image resource ${resourceId}`);
  }
  errors.push(...validateDocumentNavigation(document.source.outline ?? [], document.navigation ?? [], modelPages));
  return errors;
}

export function assertDocumentModel(document: FileShapeDocument): void {
  const errors = validateDocumentModel(document);
  if (errors.length > 0) throw new Error(`invalid FileShapeDocument:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}
