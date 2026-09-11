import {
  assertDocumentModel,
  type DocumentPage,
  type DocumentTextBlock,
  type FileShapeDocument,
  type InlineNode,
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

export type EpubXhtmlOptions = {
  /** BCP 47 language tag written to html lang/xml:lang. Defaults to ja. */
  language?: string;
  /** Optional stylesheet path relative to each generated XHTML page. */
  stylesheetHref?: string;
  /** Optional human-readable title prefix. Defaults to FileShape. */
  titlePrefix?: string;
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

function renderInline(inline: InlineNode): string {
  if (inline.kind === "text") return escapeXmlText(inline.text);
  return `<ruby>${escapeXmlText(inline.base.text)}<rt>${escapeXmlText(inline.annotation.text)}</rt></ruby>`;
}

function renderBlock(block: DocumentTextBlock): string {
  const body = block.inlines.map(renderInline).join("");
  return `    <p class="fileshape-block" data-source-page="${block.sourcePage}" data-semantic-block="${block.semanticBlockIndex}" xml:space="preserve">${body}</p>`;
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

function assertEpubRenderable(document: FileShapeDocument): void {
  assertDocumentModel(document);

  const unresolved = document.pages.flatMap((page) =>
    page.unresolvedRuby.map((span) => ({ page: page.sourcePage, reason: span.reason })),
  );
  if (unresolved.length > 0) {
    const details = unresolved
      .slice(0, 5)
      .map((entry) => `page ${entry.page}: ${entry.reason}`)
      .join("; ");
    const suffix = unresolved.length > 5 ? `; +${unresolved.length - 5} more` : "";
    throw new Error(
      `EPUB serialization requires unresolved ruby policy before rendering (${unresolved.length} candidate(s): ${details}${suffix})`,
    );
  }
}

export function serializeEpubPageXhtml(
  page: DocumentPage,
  options: EpubXhtmlOptions = {},
): string {
  const language = requireNonEmpty(options.language ?? "ja", "language");
  const titlePrefix = requireNonEmpty(options.titlePrefix ?? "FileShape", "titlePrefix");
  const title = `${titlePrefix} ${page.sourcePage}`;
  const stylesheet = options.stylesheetHref === undefined
    ? ""
    : `\n    <link rel="stylesheet" type="text/css" href="${escapeXmlAttribute(requireNonEmpty(options.stylesheetHref, "stylesheetHref"))}" />`;
  const blocks = page.blocks.map(renderBlock).join("\n");
  const body = blocks.length === 0 ? "" : `\n${blocks}\n  `;

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXmlAttribute(language)}" lang="${escapeXmlAttribute(language)}">\n  <head>\n    <meta charset="utf-8" />\n    <title>${escapeXmlText(title)}</title>${stylesheet}\n  </head>\n  <body ${orientationAttributes(page)}>${body}</body>\n</html>\n`;
}

export function serializeEpubXhtml(
  document: FileShapeDocument,
  options: EpubXhtmlOptions = {},
): EpubXhtmlSerialization {
  assertEpubRenderable(document);
  return {
    documentId: document.id,
    pages: document.pages.map((page) => ({
      sourcePage: page.sourcePage,
      href: pageHref(page.sourcePage),
      mediaType: "application/xhtml+xml" as const,
      xhtml: serializeEpubPageXhtml(page, options),
    })),
  };
}
