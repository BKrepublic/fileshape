import type { FileShapeDocument } from "./document-model.js";
import { navigationCounts, type DocumentNavigationItem } from "./document-navigation.js";

export type EpubNavigationSummary = {
  mode: "outline" | "pages";
  outlineEntries: number;
  unresolvedOutlineEntries: number;
};

export type EpubNavigationOptions = {
  stylesheetHref?: string;
};

function text(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function attribute(value: string): string {
  return text(value).replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function label(item: DocumentNavigationItem): string {
  return text(item.title.trim().length > 0 ? item.title : "Untitled entry");
}

export function serializeEpubNavigation(
  document: FileShapeDocument,
  title: string,
  language: string,
  pages: Array<{ sourcePage: number; href: string }>,
  options: EpubNavigationOptions = {},
): { xhtml: string; summary: EpubNavigationSummary } {
  const pageHrefs = new Map(pages.map((page) => [page.sourcePage, page.href]));
  function render(items: DocumentNavigationItem[]): { html: string; unlinked: DocumentNavigationItem[] } {
    const html: string[] = [];
    const unlinked: DocumentNavigationItem[] = [];
    for (const item of items) {
      const children = render(item.children);
      const nested = children.html ? `<ol>${children.html}</ol>` : "";
      if (item.target.status === "resolved") {
        const href = pageHrefs.get(item.target.sourcePage);
        if (href === undefined) throw new Error(`outline target page ${item.target.sourcePage} has no XHTML`);
        html.push(`<li><a href="${attribute(href)}">${label(item)}</a>${nested}</li>`);
        unlinked.push(...children.unlinked);
      } else if (nested) {
        html.push(`<li><span>${label(item)}</span>${nested}</li>`);
        unlinked.push(...children.unlinked);
      } else {
        // EPUB toc spans cannot be leaves. Retain these labels outside the nav.
        unlinked.push(item, ...children.unlinked);
      }
    }
    return { html: html.join("\n"), unlinked };
  }
  const outline = render(document.navigation ?? []);
  const pageItems = pages.map((page) => `        <li><a href="${attribute(page.href)}">Page ${page.sourcePage}</a></li>`).join("\n");
  const mode = outline.html ? "outline" : "pages";
  const items = outline.html || pageItems;
  const pageList = mode === "outline"
    ? `\n    <nav epub:type="page-list" id="page-list" hidden="hidden">\n      <h2>Pages</h2>\n      <ol>\n${pageItems}\n      </ol>\n    </nav>` : "";
  const retained = outline.unlinked.length > 0
    ? `\n    <section class="fileshape-unlinked-outline">\n      <h2>Other outline entries</h2>\n      <ul>${outline.unlinked.map((item) => `<li>${label(item)}</li>`).join("")}</ul>\n    </section>` : "";
  const counts = navigationCounts(document.navigation ?? []);
  const stylesheet = options.stylesheetHref === undefined
    ? ""
    : `\n    <link rel="stylesheet" type="text/css" href="${attribute(options.stylesheetHref)}" />`;
  return {
    summary: { mode, outlineEntries: counts.total, unresolvedOutlineEntries: counts.unresolved },
    xhtml: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${attribute(language)}" lang="${attribute(language)}">\n  <head>\n    <meta charset="utf-8" />\n    <title>${text(title)}</title>${stylesheet}\n  </head>\n  <body>\n    <nav epub:type="toc" id="toc">\n      <h1>${text(title)}</h1>\n      <ol>\n${items}\n      </ol>\n    </nav>${pageList}${retained}\n  </body>\n</html>\n`,
  };
}
