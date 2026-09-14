import type { FileShapeDocument } from "./document-model.js";
import { normalizeEpubNavigationText } from "./epub-navigation-text.js";
import type { EpubXhtmlPage } from "./epub-xhtml.js";

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function xmlAttr(value: string): string {
  return xmlText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function resolvedOutlineEntries(document: FileShapeDocument, pages: EpubXhtmlPage[]): Array<{ title: string; href: string }> {
  const targets = new Map<number, string>();
  for (const page of pages) {
    for (const sourcePage of page.sourcePages) {
      targets.set(sourcePage, `${page.href}#source-page-${sourcePage}`);
    }
  }

  const entries: Array<{ title: string; href: string }> = [];
  const visit = (items: NonNullable<FileShapeDocument["navigation"]>): void => {
    for (const item of items) {
      if (item.target.status === "resolved") {
        const href = targets.get(item.target.sourcePage);
        if (href !== undefined) entries.push({ title: item.title.trim() || "Untitled entry", href });
      }
      visit(item.children);
    }
  };
  visit(document.navigation ?? []);
  return entries;
}

function inferredHeadingEntries(pages: EpubXhtmlPage[]): Array<{ title: string; href: string }> {
  return pages.flatMap((page) => page.heading === undefined
    ? []
    : [{ title: page.heading.title, href: `${page.href}#${page.heading.targetId}` }]);
}

function fallbackPageEntries(pages: EpubXhtmlPage[]): Array<{ title: string; href: string }> {
  return pages.flatMap((page) =>
    page.sourcePages.map((sourcePage) => ({
      title: `Page ${sourcePage}`,
      href: `${page.href}#source-page-${sourcePage}`,
    })));
}

export function serializeLegacyNcx(
  document: FileShapeDocument,
  title: string,
  identifier: string,
  pages: EpubXhtmlPage[],
): string {
  const outline = resolvedOutlineEntries(document, pages);
  const inferred = inferredHeadingEntries(pages);
  const entries = outline.length > 0 ? outline : inferred.length > 0 ? inferred : fallbackPageEntries(pages);

  // NCX requires references to the same content target to carry the same
  // playOrder value. PDF outlines can legitimately contain several labels that
  // resolve to one source page (for example a parent and child bookmark on the
  // same page). Preserve every source label, but allocate playOrder per unique
  // target rather than per navPoint.
  const playOrderByHref = new Map<string, number>();
  let nextPlayOrder = 1;
  const navPoints = entries.map((entry, index) => {
    let playOrder = playOrderByHref.get(entry.href);
    if (playOrder === undefined) {
      playOrder = nextPlayOrder;
      nextPlayOrder += 1;
      playOrderByHref.set(entry.href, playOrder);
    }
    return `    <navPoint id="navPoint-${index + 1}" playOrder="${playOrder}">\n      <navLabel><text>${xmlText(normalizeEpubNavigationText(entry.title))}</text></navLabel>\n      <content src="${xmlAttr(entry.href)}"/>\n    </navPoint>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n  <head>\n    <meta name="dtb:uid" content="${xmlAttr(identifier)}"/>\n    <meta name="dtb:depth" content="1"/>\n    <meta name="dtb:totalPageCount" content="0"/>\n    <meta name="dtb:maxPageNumber" content="0"/>\n  </head>\n  <docTitle><text>${xmlText(title)}</text></docTitle>\n  <navMap>\n${navPoints}\n  </navMap>\n</ncx>\n`;
}
