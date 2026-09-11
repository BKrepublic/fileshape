import {
  applyEpubContentPolicy,
  type PreservedUnresolvedAnnotation,
  type UnresolvedRubyPolicy,
} from "./content-policy.js";
import type {
  DocumentPage,
  DocumentTextBlock,
  FileShapeDocument,
  InlineNode,
} from "./document-model.js";

export type EpubXhtmlPage = {
  sourcePage: number;
  href: string;
  mediaType: "application/xhtml+xml";
  xhtml: string;
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

function renderBlock(block: DocumentTextBlock, rubyMode: EpubRubyMode): string {
  const body = block.inlines.map((inline) => renderInline(inline, rubyMode)).join("");
  return `    <p class="fileshape-block" data-source-page="${block.sourcePage}" data-semantic-block="${block.semanticBlockIndex}" xml:space="preserve">${body}</p>`;
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
  switch (page.orientation) {
    case "vertical":
      return 'class="fileshape-page fileshape-vertical" style="writing-mode: vertical-rl;"';
    case "horizontal":
      return 'class="fileshape-page fileshape-horizontal" style="writing-mode: horizontal-tb;"';
    case "unknown":
      return 'class="fileshape-page fileshape-orientation-unknown"';
  }
}

function pageHref(page: number): string {
  return `text/page-${String(page).padStart(4, "0")}.xhtml`;
}

function serializePageXhtml(
  page: DocumentPage,
  notes: PreservedUnresolvedAnnotation[],
  options: EpubXhtmlOptions,
): string {
  const language = requireNonEmpty(options.language ?? "ja", "language");
  const titlePrefix = requireNonEmpty(options.titlePrefix ?? "FileShape", "titlePrefix");
  const rubyMode = options.rubyMode ?? "on";
  const title = `${titlePrefix} ${page.sourcePage}`;
  const stylesheet = options.stylesheetHref === undefined
    ? ""
    : `\n    <link rel="stylesheet" type="text/css" href="${escapeXmlAttribute(requireNonEmpty(options.stylesheetHref, "stylesheetHref"))}" />`;
  const blocks = page.blocks.map((block) => renderBlock(block, rubyMode));
  const preservedNotes = renderPreservedNotes(notes);
  const bodyItems = preservedNotes.length === 0 ? blocks : [...blocks, preservedNotes];
  const body = bodyItems.length === 0 ? "" : `\n${bodyItems.join("\n")}\n  `;

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXmlAttribute(language)}" lang="${escapeXmlAttribute(language)}">\n  <head>\n    <meta charset="utf-8" />\n    <title>${escapeXmlText(title)}</title>${stylesheet}\n  </head>\n  <body ${orientationAttributes(page)}>${body}</body>\n</html>\n`;
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
    pages: document.pages.map((page) => ({
      sourcePage: page.sourcePage,
      href: pageHref(page.sourcePage),
      mediaType: "application/xhtml+xml" as const,
      xhtml: serializePageXhtml(page, notesByPage.get(page.sourcePage) ?? [], options),
    })),
  };
}
