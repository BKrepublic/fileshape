/** Original PDF outline metadata is separate from the TextItem source store. */
export type OutlineTarget =
  | { status: "resolved"; sourcePage: number }
  | { status: "unresolved"; reason: "no-destination" | "external-destination" | "invalid-destination" };

export type SourceOutlineItem = {
  title: string;
  destination: string | unknown[] | null;
  externalUrl?: string;
  target: OutlineTarget;
  items: SourceOutlineItem[];
};

export type DocumentNavigationItem = {
  kind: "outline";
  title: string;
  /** Zero-based indexes into DocumentSourceStore.outline, from root to leaf. */
  sourceOutlinePath: number[];
  target: OutlineTarget;
  children: DocumentNavigationItem[];
};

export function buildDocumentNavigation(source: SourceOutlineItem[], parent: number[] = []): DocumentNavigationItem[] {
  return source.map((item, index) => {
    const sourceOutlinePath = [...parent, index];
    return {
      kind: "outline",
      title: item.title,
      sourceOutlinePath,
      target: { ...item.target },
      children: buildDocumentNavigation(item.items, sourceOutlinePath),
    };
  });
}

export function validateDocumentNavigation(
  source: SourceOutlineItem[],
  navigation: DocumentNavigationItem[],
  pages: Set<number>,
): string[] {
  const errors: string[] = [];
  function visit(originals: SourceOutlineItem[], items: DocumentNavigationItem[], parent: number[]): void {
    if (originals.length !== items.length) errors.push(`outline ${parent.join("/")}: navigation source coverage differs`);
    for (const [index, original] of originals.entries()) {
      const address = [...parent, index];
      const label = `outline ${address.join("/")}`;
      const item = items[index];
      if (!item) continue;
      if (item.kind !== "outline" || JSON.stringify(item.sourceOutlinePath) !== JSON.stringify(address)) {
        errors.push(`${label}: navigation source path differs`);
      }
      if (item.title !== original.title) errors.push(`${label}: navigation title differs from source`);
      const target = original.target;
      if (target.status === "resolved") {
        if (!Number.isInteger(target.sourcePage) || target.sourcePage < 1 || !pages.has(target.sourcePage)) {
          errors.push(`${label}: target page is missing`);
        }
        if (item.target.status !== "resolved" || item.target.sourcePage !== target.sourcePage) {
          errors.push(`${label}: navigation target differs from source`);
        }
      } else if (target.status === "unresolved") {
        if (!["no-destination", "external-destination", "invalid-destination"].includes(target.reason)) {
          errors.push(`${label}: invalid unresolved target reason`);
        }
        if (item.target.status !== "unresolved" || item.target.reason !== target.reason) {
          errors.push(`${label}: unresolved target was changed`);
        }
      } else errors.push(`${label}: invalid source target status`);
      visit(original.items, item.children, address);
    }
  }
  visit(source, navigation, []);
  return errors;
}

export function navigationCounts(items: DocumentNavigationItem[]): { total: number; unresolved: number } {
  let total = 0;
  let unresolved = 0;
  for (const item of items) {
    const child = navigationCounts(item.children);
    total += 1 + child.total;
    unresolved += Number(item.target.status === "unresolved") + child.unresolved;
  }
  return { total, unresolved };
}
