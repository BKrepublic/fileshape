import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { StructTreeNode } from "pdfjs-dist/types/src/display/api.js";

export type PdfStructureInventory = {
  pages: number;
  scannedPages: number;
  markInfo: { Marked: boolean; UserProperties: boolean; Suspects: boolean } | null;
  structurePages: number;
  /** Includes the synthetic Root node returned by PDF.js on each tagged page. */
  structureNodes: number;
  headingNodes: number;
  contentReferences: number;
  objectReferences: number;
};

/** Read-only evidence inventory. No text, titles, role inference or EPUB changes. */
export async function inspectPdfStructure(inputPath: string): Promise<PdfStructureInventory> {
  const task = getDocument({ data: new Uint8Array(await readFile(inputPath)) });
  try {
    const pdf = await task.promise;
    // pdfjs-dist 6.3.289 returns a Map at runtime although its declaration says object.
    const rawMarkInfo: unknown = await pdf.getMarkInfo();
    const flags: unknown = rawMarkInfo instanceof Map ? Object.fromEntries(rawMarkInfo) : rawMarkInfo;
    let markInfo: PdfStructureInventory["markInfo"] = null;
    if (flags !== null) {
      if (typeof flags !== "object" || !("Marked" in flags) || typeof flags.Marked !== "boolean" ||
          !("UserProperties" in flags) || typeof flags.UserProperties !== "boolean" ||
          !("Suspects" in flags) || typeof flags.Suspects !== "boolean") throw new Error("invalid PDF MarkInfo result");
      markInfo = { Marked: flags.Marked, UserProperties: flags.UserProperties, Suspects: flags.Suspects };
    }
    const result: PdfStructureInventory = {
      pages: pdf.numPages, scannedPages: 0, markInfo,
      structurePages: 0, structureNodes: 0, headingNodes: 0,
      contentReferences: 0, objectReferences: 0,
    };
    function visit(node: StructTreeNode): void {
      result.structureNodes += 1;
      // These are PDF standard roles, already resolved through PDF RoleMap.
      if (/^H[1-6]?$/.test(node.role)) result.headingNodes += 1;
      for (const child of node.children) {
        if ("role" in child) visit(child);
        else if (child.type === "content") result.contentReferences += 1;
        else if (child.type === "object") result.objectReferences += 1;
      }
    }
    // Do not skip pages based on MarkInfo; actual page trees are the evidence.
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      try {
        const tree = await page.getStructTree();
        if (tree) { result.structurePages += 1; visit(tree); }
        result.scannedPages += 1;
      } finally { page.cleanup(); }
    }
    return result;
  } finally { await task.destroy(); }
}

async function main(): Promise<void> {
  const [input, flag, output, ...extra] = process.argv.slice(2);
  if (!input || input.startsWith("--") || extra.length > 0 ||
      (flag !== undefined && (flag !== "--output" || !output || output.startsWith("--")))) {
    throw new Error("usage: npm run inspect:structure -- PDF_OR_DIRECTORY [--output NEW_FILE]");
  }
  const files = (await stat(input)).isDirectory()
    ? (await readdir(input, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
      .map((entry) => path.join(input, entry.name)).sort()
    : [input];
  if (files.length === 0) throw new Error("no PDF files found");
  const reports = [];
  for (const [index, file] of files.entries()) {
    process.stderr.write(`Structure inventory: ${index + 1}/${files.length}\n`);
    reports.push({ file: path.basename(file), ...await inspectPdfStructure(file) });
  }
  const report = JSON.stringify({
    pdfs: reports.length,
    pages: reports.reduce((sum, item) => sum + item.pages, 0),
    scannedPages: reports.reduce((sum, item) => sum + item.scannedPages, 0),
    structurePages: reports.reduce((sum, item) => sum + item.structurePages, 0),
    headingNodes: reports.reduce((sum, item) => sum + item.headingNodes, 0),
    reports,
  }, null, 2) + "\n";
  if (output) await writeFile(output, report, { flag: "wx" });
  else process.stdout.write(report);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
