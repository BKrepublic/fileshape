import type { OutlineTarget, SourceOutlineItem } from "./document-navigation.js";

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
};

/** Only explicit local PDF destinations can produce EPUB links. No URL is followed. */
export async function readPdfOutline(pdf: OutlineReader): Promise<SourceOutlineItem[]> {
  async function resolve(item: PdfOutlineItem): Promise<OutlineTarget> {
    if (item.url || item.unsafeUrl) return { status: "unresolved", reason: "external-destination" };
    if (item.dest === null) return { status: "unresolved", reason: "no-destination" };
    try {
      const destination = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
      if (!Array.isArray(destination) || destination.length < 2) throw new Error("invalid destination");
      const first: unknown = destination[0];
      let index: number;
      if (typeof first === "number") index = first;
      else if (typeof first === "object" && first !== null && "num" in first && "gen" in first &&
          typeof first.num === "number" && Number.isInteger(first.num) && first.num > 0 &&
          typeof first.gen === "number" && Number.isInteger(first.gen) && first.gen >= 0) {
        index = await pdf.getPageIndex({ num: first.num, gen: first.gen });
      } else throw new Error("invalid page reference");
      if (!Number.isInteger(index) || index < 0 || index >= pdf.numPages) throw new Error("page out of range");
      return { status: "resolved", sourcePage: index + 1 };
    } catch {
      return { status: "unresolved", reason: "invalid-destination" };
    }
  }

  async function visit(items: PdfOutlineItem[]): Promise<SourceOutlineItem[]> {
    const output: SourceOutlineItem[] = [];
    for (const item of items) {
      const externalUrl = item.unsafeUrl ?? item.url ?? undefined;
      output.push({
        title: item.title,
        destination: structuredClone(item.dest),
        ...(externalUrl === undefined ? {} : { externalUrl }),
        target: await resolve(item),
        items: await visit(item.items),
      });
    }
    return output;
  }
  return visit(await pdf.getOutline() ?? []);
}
