import type { FileShapeDocument } from "./document-model.js";
import { navigationCounts, type DocumentNavigationItem } from "./document-navigation.js";
import { normalizeEpubNavigationText } from "./epub-navigation-text.js";

export type EpubNavigationSummary = {
  mode: "outline" | "pages";
  outlineEntries: number;
  unresolvedOutlineEntries: number;
};

export type EpubNavigationOptions = {
  stylesheetHref?: string;
};

type NavigationPage = {
  sourcePage: number;
  sourcePages?: number[];
  href: string;
  heading?: {
    title: string;
    sourcePage: number;
    targetId: string;
  };
};

function text(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function attribute(value: string): string {
  return text(value).replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function label(item: DocumentNavigationItem): string {
  const title = item.title.trim().length > 0 ? item.title : "Untitled entry";
  return text(normalizeEpubNavigationText(title));
}

export function serializeEpubNavigation(
  document: FileShapeDocument,
  title: string,
  language: string,
  pages: NavigationPage[],
  options: EpubNavigationOptions = {},
): { xhtml: string; summary: EpubNavigationSummary } {
  const pageTargets = new Map<number, string>();
  for (const page of pages) {
    for (const sourcePage of page.sourcePages ?? [page.sourcePage]) {
      pageTargets.set(sourcePage, `${page.href}#source-page-${sourcePage}`);
    }
  }

  function render(items: DocumentNavigationItem[]): { html: string; unlinked: DocumentNavigationItem[] } {
    const html: string[] = [];
    const unlinked: DocumentNavigationItem[] = [];
    for (const item of items) {
      const children = render(item.children);
      const nested = children.html ? `<ol>${children.html}</ol>` : "";
      if (item.target.status === "resolved") {
        const href = pageTargets.get(item.target.sourcePage);
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
  const inferredHeadings = pages
    .filter((page) => page.heading !== undefined)
    .map((page) => {
      const heading = page.heading!;
      return `<li><a href="${attribute(`${page.href}#${heading.targetId}`)}">${text(normalizeEpubNavigationText(heading.title))}</a></li>`;
    })
    .join("\n");
  const sourcePages = pages.flatMap((page) => page.sourcePages ?? [page.sourcePage]);
  const pageItems = sourcePages
    .map((sourcePage) => {
      const href = pageTargets.get(sourcePage);
      if (href === undefined) throw new Error(`source page ${sourcePage} has no XHTML target`);
      return `        <li><a href="${attribute(href)}">Page ${sourcePage}</a></li>`;
    })
    .join("\n");
  const hasStructuredToc = outline.html.length > 0 || inferredHeadings.length > 0;
  const mode: EpubNavigationSummary["mode"] = hasStructuredToc ? "outline" : "pages";
  const items = outline.html || inferredHeadings || pageItems;
  const pageList = hasStructuredToc
    ? `\n    <nav epub:type="page-list" id="page-list" hidden="hidden">\n      <h2>Pages</h2>\n      <ol>\n${pageItems}\n      </ol>\n    </nav>` : "";
  const retained = outline.unlinked.length > 0
    ? `\n    <section class="fileshape-unlinked-outline">\n      <h2>Other outline entries</h2>\n      <ul>${outline.unlinked.map((item) => `<li>${label(item)}</li>`).join("")}</ul>\n    </section>` : "";
  const sourceCounts = navigationCounts(document.navigation ?? []);
  const counts = outline.html.length > 0
    ? sourceCounts
    : inferredHeadings.length > 0
      ? { total: pages.filter((page) => page.heading !== undefined).length, unresolved: 0 }
      : sourceCounts;
  const stylesheet = options.stylesheetHref === undefined
    ? ""
    : `\n    <link rel="stylesheet" type="text/css" href="${attribute(options.stylesheetHref)}" />`;
  return {
    summary: { mode, outlineEntries: counts.total, unresolvedOutlineEntries: counts.unresolved },
    xhtml: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${attribute(language)}" lang="${attribute(language)}">\n  <head>\n    <meta charset="utf-8" />\n    <title>${text(title)}</title>${stylesheet}\n  </head>\n  <body>\n    <nav epub:type="toc" id="toc">\n      <h1>${text(title)}</h1>\n      <ol>\n${items}\n      </ol>\n    </nav>${pageList}${retained}\n  </body>\n</html>\n`,
  };
}
