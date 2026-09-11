import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectPdfStructure } from "../src/pdf-structure-inventory.js";
import { pdfBytes } from "./pdf-fixture.js";

/** Actual PDF structure tree, MCIDs and custom RoleMap; no visual heading heuristic. */
function taggedPdf(marked: boolean): Buffer {
  const content = "/ChapterTitle <</MCID 0>> BDC BT /F1 12 Tf 10 700 Td (Heading) Tj ET EMC\n/P <</MCID 1>> BDC BT /F1 12 Tf 10 680 Td (Paragraph) Tj ET EMC";
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R /MarkInfo << /Marked ${marked} >> >>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /StructParents 0 /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /StructTreeRoot /K [7 0 R] /ParentTree 10 0 R /ParentTreeNextKey 1 /RoleMap << /ChapterTitle /H1 >> >>",
    "<< /Type /StructElem /S /Document /P 6 0 R /K [8 0 R 9 0 R] >>",
    "<< /Type /StructElem /S /ChapterTitle /P 7 0 R /Pg 3 0 R /K 0 >>",
    "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 1 >>",
    "<< /Nums [0 [8 0 R 9 0 R]] >>",
  ];
  let text = "%PDF-1.7\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}

test("real tagged PDFs expose mapped heading roles even when MarkInfo is false", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-structure-"));
  try {
    for (const marked of [true, false]) {
      const file = path.join(directory, `${marked}.pdf`);
      await writeFile(file, taggedPdf(marked));
      const result = await inspectPdfStructure(file);
      assert.deepEqual(result, {
        pages: 1, scannedPages: 1,
        markInfo: { Marked: marked, UserProperties: false, Suspects: false },
        structurePages: 1, structureNodes: 4, headingNodes: 1,
        contentReferences: 2, objectReferences: 0,
      });
      assert.doesNotMatch(JSON.stringify(result), /Heading|Paragraph|ChapterTitle/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("an outline does not imply body heading tags; unreadable input does not return zero evidence", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-structure-"));
  try {
    const file = path.join(directory, "outline.pdf");
    await writeFile(file, pdfBytes({ outline: true }));
    const result = await inspectPdfStructure(file);
    assert.deepEqual(result, {
      pages: 1, scannedPages: 1, markInfo: null,
      structurePages: 0, structureNodes: 0, headingNodes: 0,
      contentReferences: 0, objectReferences: 0,
    });
    await assert.rejects(inspectPdfStructure(path.join(directory, "missing.pdf")), /ENOENT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
