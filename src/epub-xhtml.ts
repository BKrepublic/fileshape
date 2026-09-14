import {
  applyEpubContentPolicy,
  type PreservedUnresolvedAnnotation,
  type UnresolvedRubyPolicy,
} from "./content-policy.js";
import type {
  DocumentPage,
  DocumentImageOccurrence,
  DocumentImageResource,
  DocumentTextBlock,
  FileShapeDocument,
  InlineNode,
} from "./document-model.js";
import { normalizeEpubPresentationText } from "./epub-navigation-text.js";
import type { StructuralHeading } from "./heading-inference.js";

export type EpubInferredHeading = StructuralHeading & {
  targetId: string;
};

export type EpubXhtmlPage = {
  /** First source PDF page represented by this logical XHTML resource. */
  sourcePage: number;
  /** All source PDF pages represented by this logical XHTML resource. */
  sourcePages: number[];
  href: string;
  mediaType: "application/xhtml+xml";
  xhtml: string;
  /** Source-backed structural heading selected before EPUB serialization. */
  heading?: EpubInferredHeading;
};

export type EpubXhtmlSerialization = {
  documentId: string;
  pages: EpubXhtmlPage[];
};

export type EpubRubyMode = "on" | "off";

export type EpubXhtmlOptions = {
  /** BCP 47 language tag written to html lang/xml:lang. Defaults to ja. */
  language?: string;
  /** Optional stylesheet path relative to each generated XHTML page. */
  stylesheetHref?: string;
  /** Optional human-readable title prefix. Defaults to FileShape. */
  titlePrefix?: string;
  /** Exact ruby display. `off` emits only source-backed base text; defaults to `on`. */
  rubyMode?: EpubRubyMode;
  /** Fail closed by default; optionally preserve unresolved annotation text as page-end notes. */
  unresolvedRubyPolicy?: UnresolvedRubyPolicy;
  /**
   * Optional structural headings inferred upstream from PDF layout/style evidence.
   * The renderer never guesses headings from title words, digits or punctuation.
   */
  structuralHeadings?: StructuralHeading[];
};

function escapeXmlText(value: string): string {
  return normalizeEpubPresentationText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function requireNonEmpty(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`);
  return value;
}

function renderInline(inline: InlineNode, rubyMode: EpubRubyMode): string {
  if (inline.kind === "text") return escapeXmlText(inline.text);
  if (rubyMode === "off") return escapeXmlText(inline.base.text);
  return `<ruby>${escapeXmlText(inline.base.text)}<rt>${escapeXmlText(inline.annotation.text)}</rt></ruby>`;
}

function inlinePlainText(inline: InlineNode): string {
  return inline.kind === "text" ? inline.text : inline.base.text;
}

function blockPlainText(block: DocumentTextBlock): string {
  return block.inlines.map(inlinePlainText).join("");
}

type BlockRenderOptions = {
  headingId?: string;
  continueFromPrevious?: boolean;
  continueToNext?: boolean;
};

function renderBlock(
  block: DocumentTextBlock,
  rubyMode: EpubRubyMode,
  options: BlockRenderOptions = {},
): string {
  const body = block.inlines.map((inline) => renderInline(inline, rubyMode)).join("");
  if (options.headingId !== undefined) {
    return `    <h1 id="${escapeXmlAttribute(options.headingId)}" class="fileshape-heading" data-source-page="${block.sourcePage}" data-semantic-block="${block.semanticBlockIndex}" xml:space="preserve">${body}</h1>`;
  }

  const attrs = `data-source-page="${block.sourcePage}" data-semantic-block="${block.semanticBlockIndex}"`;
  if (options.continueFromPrevious) {
    const fragment = `<span class="fileshape-block-continuation" ${attrs}>${body}</span>`;
    // This fragment is emitted inside an already-open <p xml:space="preserve">.
    // Never add serializer indentation here: it becomes visible EPUB text.
    return options.continueToNext ? fragment : `${fragment}</p>`;
  }

  const open = `    <p class="fileshape-block" ${attrs} xml:space="preserve">${body}`;
  return options.continueToNext ? open : `${open}</p>`;
}

function renderImage(
  occurrence: DocumentImageOccurrence,
  resource: DocumentImageResource,
): string {
  if (occurrence.interpolate) {
    throw new Error(`page ${occurrence.sourcePage} image operator ${occurrence.operatorIndex} occurrence ${occurrence.occurrenceIndex} requests unsupported PDF image interpolation`);
  }
  const alt = `Source image from page ${occurrence.sourcePage}`;
  const src = `../images/${resource.contentHash}.png`;
  return `    <figure class="fileshape-image" data-source-page="${occurrence.sourcePage}" data-operator-index="${occurrence.operatorIndex}" data-occurrence-index="${occurrence.occurrenceIndex}"><img src="${escapeXmlAttribute(src)}" width="${resource.width}" height="${resource.height}" alt="${escapeXmlAttribute(alt)}" /></figure>`;
}

function renderPreservedNote(note: PreservedUnresolvedAnnotation, index: number): string {
  return `      <aside class="fileshape-unresolved-annotation" data-fileshape-note="${index + 1}" data-fileshape-reason="${escapeXmlAttribute(note.reason)}"><p xml:space="preserve">${escapeXmlText(note.text)}</p></aside>`;
}

function renderPreservedNotes(notes: PreservedUnresolvedAnnotation[]): string {
  if (notes.length === 0) return "";
  const items = notes.map(renderPreservedNote).join("\n");
  return `    <section class="fileshape-unresolved-notes" aria-label="Unresolved annotations">\n      <h2>Notes</h2>\n${items}\n    </section>`;
}

function orientationAttributes(page: DocumentPage): string {
  const classes = ["fileshape-page"];
  if (page.imageOccurrences.length > 0) classes.push("fileshape-page-has-images");
  if (page.blocks.length === 0 && page.imageOccurrences.length === 0) classes.push("fileshape-page-blank");
  switch (page.orientation) {
    case "vertical":
      classes.push("fileshape-vertical");
      return `class="${classes.join(" ")}" style="writing-mode: vertical-rl;"`;
    case "horizontal":
      classes.push("fileshape-horizontal");
      return `class="${classes.join(" ")}" style="writing-mode: horizontal-tb;"`;
    case "unknown":
      classes.push("fileshape-orientation-unknown");
      return `class="${classes.join(" ")}"`;
  }
}

function orientationRunAttributes(orientation: DocumentPage["orientation"]): string {
  switch (orientation) {
    case "vertical":
      return 'class="fileshape-orientation-run fileshape-vertical" style="writing-mode: vertical-rl;"';
    case "horizontal":
      return 'class="fileshape-orientation-run fileshape-horizontal" style="writing-mode: horizontal-tb;"';
    case "unknown":
      return 'class="fileshape-orientation-run fileshape-orientation-unknown"';
  }
}

function pageHref(page: number): string {
  return `text/page-${String(page).padStart(4, "0")}.xhtml`;
}

function pageTargetId(page: number): string {
  return `source-page-${page}`;
}

function headingTargetId(heading: StructuralHeading): string {
  return `heading-page-${heading.sourcePage}-block-${heading.semanticBlockIndex}`;
}

function validateStructuralHeadings(
  document: FileShapeDocument,
  headings: StructuralHeading[],
): EpubInferredHeading[] {
  const pages = new Map(document.pages.map((page) => [page.sourcePage, page]));
  const seen = new Set<string>();
  const validated: EpubInferredHeading[] = [];
  for (const heading of headings) {
    const key = `${heading.sourcePage}:${heading.semanticBlockIndex}`;
    if (seen.has(key)) throw new Error(`duplicate structural heading ${key}`);
    seen.add(key);
    const page = pages.get(heading.sourcePage);
    if (!page) throw new Error(`structural heading references missing page ${heading.sourcePage}`);
    const block = page.blocks.find((candidate) => candidate.semanticBlockIndex === heading.semanticBlockIndex);
    if (!block) throw new Error(`structural heading references missing block ${key}`);
    const sourceTitle = blockPlainText(block).trim();
    if (heading.title !== sourceTitle) {
      throw new Error(`structural heading title differs from source block ${key}`);
    }
    validated.push({ ...heading, targetId: headingTargetId(heading) });
  }
  return validated.sort((a, b) =>
    a.sourcePage - b.sourcePage || a.semanticBlockIndex - b.semanticBlockIndex);
}

function outlineBoundaryPages(document: FileShapeDocument): Set<number> {
  const boundaries = new Set<number>();
  const visit = (items: NonNullable<FileShapeDocument["navigation"]>): void => {
    for (const item of items) {
      if (item.target.status === "resolved") boundaries.add(item.target.sourcePage);
      visit(item.children);
    }
  };
  visit(document.navigation ?? []);
  return boundaries;
}

function logicalGroups(
  pages: DocumentPage[],
  headings: EpubInferredHeading[],
  outlineBoundaries: ReadonlySet<number>,
): Array<{ pages: DocumentPage[]; heading?: EpubInferredHeading }> {
  const headingByPage = new Map<number, EpubInferredHeading>();
  for (const heading of headings) {
    if (headingByPage.has(heading.sourcePage)) {
      throw new Error(`multiple structural headings on source page ${heading.sourcePage} are not yet supported`);
    }
    headingByPage.set(heading.sourcePage, heading);
  }

  const boundaryPages = new Set(outlineBoundaries);
  for (const page of headingByPage.keys()) boundaryPages.add(page);
  if (boundaryPages.size === 0) return pages.map((page) => ({ pages: [page] }));

  const groups: Array<{ pages: DocumentPage[]; heading?: EpubInferredHeading }> = [];
  let current: { pages: DocumentPage[]; heading?: EpubInferredHeading } | undefined;

  for (const page of pages) {
    const heading = headingByPage.get(page.sourcePage);
    const startsBoundary = boundaryPages.has(page.sourcePage);

    if (current === undefined || startsBoundary) {
      if (current) groups.push(current);
      current = {
        pages: [page],
        ...(heading === undefined ? {} : { heading }),
      };
      continue;
    }

    current.pages.push(page);
  }

  if (current) groups.push(current);
  return groups;
}

function hasBoundaryImage(previous: DocumentPage, current: DocumentPage): boolean {
  return previous.imageOccurrences.some((occurrence) => occurrence.placementIndex >= previous.blocks.length) ||
    current.imageOccurrences.some((occurrence) => occurrence.placementIndex === 0);
}

function continuesAcrossSourcePage(
  previous: DocumentPage,
  current: DocumentPage,
  previousNotes: PreservedUnresolvedAnnotation[],
  currentNotes: PreservedUnresolvedAnnotation[],
  headingByPage: Map<number, EpubInferredHeading>,
): boolean {
  if (previous.orientation !== current.orientation) return false;
  if (previousNotes.length > 0 || currentNotes.length > 0) return false;
  if (hasBoundaryImage(previous, current)) return false;
  const previousBlock = previous.blocks.at(-1);
  const currentBlock = current.blocks[0];
  if (!previousBlock || !currentBlock) return false;
  if (headingByPage.has(current.sourcePage)) return false;
  const previousHeading = headingByPage.get(previous.sourcePage);
  if (previousHeading && previous.blocks.length === 1) return false;

  const before = normalizeEpubPresentationText(blockPlainText(previousBlock)).trimEnd();
  const after = normalizeEpubPresentationText(blockPlainText(currentBlock));
  if (before.length === 0 || after.trim().length === 0) return false;
  if (/^[\u3000\t ]/u.test(after)) return false;
  if (/^[「『（【〔［〈《]/u.test(after.trimStart())) return false;
  if (/[。！？!?」』）】〕］〉》]$/u.test(before)) return false;
  return true;
}

function renderSourcePageItems(
  document: FileShapeDocument,
  page: DocumentPage,
  notes: PreservedUnresolvedAnnotation[],
  rubyMode: EpubRubyMode,
  heading: EpubInferredHeading | undefined,
  continueFromPrevious: boolean,
  continueToNext: boolean,
): string[] {
  const resources = new Map(document.imageResources.map((resource) => [resource.id, resource]));
  const imagesByGap = new Map<number, DocumentImageOccurrence[]>();
  for (const occurrence of page.imageOccurrences) {
    const resource = resources.get(occurrence.resourceId);
    if (!resource) throw new Error(`page ${page.sourcePage} image references missing resource ${occurrence.resourceId}`);
    const images = imagesByGap.get(occurrence.placementIndex) ?? [];
    images.push(occurrence);
    imagesByGap.set(occurrence.placementIndex, images);
  }
  for (const images of imagesByGap.values()) images.sort((left, right) =>
    (page.orientation === "unknown"
      ? 0
      : page.orientation === "vertical"
        ? right.displayBounds.right - left.displayBounds.right || left.displayBounds.top - right.displayBounds.top
        : left.displayBounds.top - right.displayBounds.top || left.displayBounds.left - right.displayBounds.left) ||
    left.operatorIndex - right.operatorIndex || left.occurrenceIndex - right.occurrenceIndex);

  const marker = `<span id="${pageTargetId(page.sourcePage)}" class="fileshape-source-page-marker" data-source-page="${page.sourcePage}"></span>`;
  const bodyItems: string[] = [continueFromPrevious ? marker : `    ${marker}`];
  for (let gap = 0; gap <= page.blocks.length; gap += 1) {
    for (const occurrence of imagesByGap.get(gap) ?? []) {
      const resource = resources.get(occurrence.resourceId);
      if (!resource) throw new Error(`page ${page.sourcePage} image references missing resource ${occurrence.resourceId}`);
      bodyItems.push(renderImage(occurrence, resource));
    }
    const block = page.blocks[gap];
    if (!block) continue;
    const headingId = heading?.semanticBlockIndex === block.semanticBlockIndex
      ? heading.targetId
      : undefined;
    const isFirst = gap === 0;
    const isLast = gap === page.blocks.length - 1;
    bodyItems.push(renderBlock(block, rubyMode, {
      ...(headingId === undefined ? {} : { headingId }),
      ...(isFirst && continueFromPrevious ? { continueFromPrevious: true } : {}),
      ...(isLast && continueToNext ? { continueToNext: true } : {}),
    }));
  }
  const preservedNotes = renderPreservedNotes(notes);
  if (preservedNotes.length > 0) bodyItems.push(preservedNotes);
  return bodyItems;
}

function serializeLogicalXhtml(
  document: FileShapeDocument,
  pages: DocumentPage[],
  notesByPage: Map<number, PreservedUnresolvedAnnotation[]>,
  heading: EpubInferredHeading | undefined,
  headingByPage: Map<number, EpubInferredHeading>,
  options: EpubXhtmlOptions,
): string {
  const firstPage = pages[0];
  if (!firstPage) throw new Error("logical EPUB resource must contain at least one source page");
  const language = requireNonEmpty(options.language ?? "ja", "language");
  const titlePrefix = requireNonEmpty(options.titlePrefix ?? "FileShape", "titlePrefix");
  const rubyMode = options.rubyMode ?? "on";
  const title = heading?.title ?? `${titlePrefix} ${firstPage.sourcePage}`;
  const stylesheet = options.stylesheetHref === undefined
    ? ""
    : `\n    <link rel="stylesheet" type="text/css" href="${escapeXmlAttribute(requireNonEmpty(options.stylesheetHref, "stylesheetHref"))}" />`;

  const joins: boolean[] = [];
  for (let index = 1; index < pages.length; index += 1) {
    const previous = pages[index - 1]!;
    const current = pages[index]!;
    joins[index - 1] = continuesAcrossSourcePage(
      previous,
      current,
      notesByPage.get(previous.sourcePage) ?? [],
      notesByPage.get(current.sourcePage) ?? [],
      headingByPage,
    );
  }

  const mixedOrientation = pages.some((page) => page.orientation !== firstPage.orientation);
  const bodyItems: string[] = [];
  let activeOrientation: DocumentPage["orientation"] | undefined;

  for (const [index, page] of pages.entries()) {
    if (mixedOrientation && activeOrientation !== page.orientation) {
      if (activeOrientation !== undefined) bodyItems.push("    </section>");
      bodyItems.push(`    <section ${orientationRunAttributes(page.orientation)}>`);
      activeOrientation = page.orientation;
    }

    bodyItems.push(...renderSourcePageItems(
      document,
      page,
      notesByPage.get(page.sourcePage) ?? [],
      rubyMode,
      heading?.sourcePage === page.sourcePage ? heading : undefined,
      index > 0 && joins[index - 1] === true,
      index < pages.length - 1 && joins[index] === true,
    ));
  }

  if (mixedOrientation && activeOrientation !== undefined) bodyItems.push("    </section>");

  // Do not inject formatting whitespace between fragments: a paragraph may
  // remain open across a physical PDF page boundary. Mixed-orientation runs are
  // wrapped only at boundaries where continuation is already prohibited.
  const body = bodyItems.length === 0 ? "" : `\n${bodyItems.join("")}\n  `;
  const bodyAttributes = mixedOrientation
    ? 'class="fileshape-page fileshape-mixed-orientation"'
    : orientationAttributes(firstPage);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXmlAttribute(language)}" lang="${escapeXmlAttribute(language)}">\n  <head>\n    <meta charset="utf-8" />\n    <title>${escapeXmlText(title)}</title>${stylesheet}\n  </head>\n  <body ${bodyAttributes}>${body}</body>\n</html>\n`;
}

export function serializeEpubXhtml(
  document: FileShapeDocument,
  options: EpubXhtmlOptions = {},
): EpubXhtmlSerialization {
  const policy = applyEpubContentPolicy(
    document,
    options.unresolvedRubyPolicy === undefined
      ? {}
      : { unresolvedRuby: options.unresolvedRubyPolicy },
  );
  const notesByPage = new Map(policy.pages.map((page) => [page.sourcePage, page.notes]));
  const headings = validateStructuralHeadings(document, options.structuralHeadings ?? []);
  const headingByPage = new Map(headings.map((heading) => [heading.sourcePage, heading]));
  const outlineBoundaries = outlineBoundaryPages(document);

  return {
    documentId: document.id,
    pages: logicalGroups(document.pages, headings, outlineBoundaries).map((group) => {
      const firstPage = group.pages[0];
      if (!firstPage) throw new Error("logical EPUB group is empty");
      return {
        sourcePage: firstPage.sourcePage,
        sourcePages: group.pages.map((page) => page.sourcePage),
        href: pageHref(firstPage.sourcePage),
        mediaType: "application/xhtml+xml" as const,
        xhtml: serializeLogicalXhtml(
          document,
          group.pages,
          notesByPage,
          group.heading,
          headingByPage,
          options,
        ),
        ...(group.heading === undefined ? {} : { heading: group.heading }),
      };
    }),
  };
}