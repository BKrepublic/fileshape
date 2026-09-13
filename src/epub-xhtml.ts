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

export type EpubInferredHeading = {
  title: string;
  sourcePage: number;
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
  /** Heading inferred from source text/geometry when the PDF has no usable outline. */
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
};

function escapeXmlText(value: string): string {
  return value
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

function renderBlock(block: DocumentTextBlock, rubyMode: EpubRubyMode, headingId?: string): string {
  const body = block.inlines.map((inline) => renderInline(inline, rubyMode)).join("");
  if (headingId !== undefined) {
    return `    <h1 id="${escapeXmlAttribute(headingId)}" class="fileshape-heading" data-source-page="${block.sourcePage}" data-semantic-block="${block.semanticBlockIndex}" xml:space="preserve">${body}</h1>`;
  }
  return `    <p class="fileshape-block" data-source-page="${block.sourcePage}" data-semantic-block="${block.semanticBlockIndex}" xml:space="preserve">${body}</p>`;
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

function pageHref(page: number): string {
  return `text/page-${String(page).padStart(4, "0")}.xhtml`;
}

function pageTargetId(page: number): string {
  return `source-page-${page}`;
}

function headingTargetId(page: number): string {
  return `heading-page-${page}`;
}

/**
 * Syosetu-style PDFs place chapter labels such as `０２　天使様の申し出`
 * as the first semantic block of the source page. PDF.js does not expose a
 * heading semantic, so infer only a deliberately narrow, source-backed form:
 * 2-4 leading digits followed by a short title and no sentence-final mark.
 * This avoids treating ordinary body paragraphs as headings.
 */
function inferHeading(page: DocumentPage): EpubInferredHeading | undefined {
  const first = page.blocks[0];
  if (!first) return undefined;
  const normalized = first.semanticText.replace(/[\s\u3000]+/gu, "").trim();
  if (normalized.length < 3 || normalized.length > 64) return undefined;
  if (!/^[0-9０-９]{2,4}[^0-9０-９].+/u.test(normalized)) return undefined;
  if (/[。！？!?」』]$/u.test(normalized)) return undefined;
  return {
    title: normalized,
    sourcePage: page.sourcePage,
    targetId: headingTargetId(page.sourcePage),
  };
}

function logicalGroups(pages: DocumentPage[]): Array<{ pages: DocumentPage[]; heading?: EpubInferredHeading }> {
  const headings = new Map<number, EpubInferredHeading>();
  for (const page of pages) {
    const heading = inferHeading(page);
    if (heading) headings.set(page.sourcePage, heading);
  }

  // Preserve the old one-PDF-page-per-XHTML behavior for documents where no
  // chapter signal can be inferred. Once headings are present, source PDF page
  // boundaries inside a chapter become provenance markers only, not EPUB
  // pagination boundaries.
  if (headings.size === 0) {
    return pages.map((page) => ({ pages: [page] }));
  }

  const groups: Array<{ pages: DocumentPage[]; heading?: EpubInferredHeading }> = [];
  let current: { pages: DocumentPage[]; heading?: EpubInferredHeading } | undefined;
  let chapterFlowStarted = false;

  for (const page of pages) {
    const heading = headings.get(page.sourcePage);
    if (heading) {
      if (current) groups.push(current);
      current = { pages: [page], heading };
      chapterFlowStarted = true;
      continue;
    }

    if (chapterFlowStarted && current) {
      current.pages.push(page);
      continue;
    }

    // Front matter before the first inferred chapter keeps its original page
    // boundaries. This avoids joining title/copyright/introduction layouts that
    // can legitimately use different writing directions.
    groups.push({ pages: [page] });
  }

  if (current) groups.push(current);
  return groups;
}

function renderSourcePageItems(
  document: FileShapeDocument,
  page: DocumentPage,
  notes: PreservedUnresolvedAnnotation[],
  rubyMode: EpubRubyMode,
  heading: EpubInferredHeading | undefined,
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

  const bodyItems: string[] = [
    `    <span id="${pageTargetId(page.sourcePage)}" class="fileshape-source-page-marker" data-source-page="${page.sourcePage}"></span>`,
  ];
  for (let gap = 0; gap <= page.blocks.length; gap += 1) {
    for (const occurrence of imagesByGap.get(gap) ?? []) {
      const resource = resources.get(occurrence.resourceId);
      if (!resource) throw new Error(`page ${page.sourcePage} image references missing resource ${occurrence.resourceId}`);
      bodyItems.push(renderImage(occurrence, resource));
    }
    const block = page.blocks[gap];
    if (block) {
      const headingId = heading && gap === 0 ? heading.targetId : undefined;
      bodyItems.push(renderBlock(block, rubyMode, headingId));
    }
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
  const bodyItems: string[] = [];
  for (const page of pages) {
    bodyItems.push(...renderSourcePageItems(
      document,
      page,
      notesByPage.get(page.sourcePage) ?? [],
      rubyMode,
      heading?.sourcePage === page.sourcePage ? heading : undefined,
    ));
  }
  const body = bodyItems.length === 0 ? "" : `\n${bodyItems.join("\n")}\n  `;

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXmlAttribute(language)}" lang="${escapeXmlAttribute(language)}">\n  <head>\n    <meta charset="utf-8" />\n    <title>${escapeXmlText(title)}</title>${stylesheet}\n  </head>\n  <body ${orientationAttributes(firstPage)}>${body}</body>\n</html>\n`;
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

  return {
    documentId: document.id,
    pages: logicalGroups(document.pages).map((group) => {
      const firstPage = group.pages[0];
      if (!firstPage) throw new Error("logical EPUB group is empty");
      return {
        sourcePage: firstPage.sourcePage,
        sourcePages: group.pages.map((page) => page.sourcePage),
        href: pageHref(firstPage.sourcePage),
        mediaType: "application/xhtml+xml" as const,
        xhtml: serializeLogicalXhtml(document, group.pages, notesByPage, group.heading, options),
        ...(group.heading === undefined ? {} : { heading: group.heading }),
      };
    }),
  };
}
