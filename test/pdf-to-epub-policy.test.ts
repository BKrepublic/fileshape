import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { convertPdfToEpub } from "../src/pdf-to-epub.js";

function pdfBytes(content: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let text = "%PDF-1.7\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}

const unresolvedPdf = () => pdfBytes(
  "BT /F1 20 Tf 1 0 0 1 100 500 Tm (Body) Tj ET\nBT /F1 10 Tf 1 0 0 1 400 100 Tm (note) Tj ET",
);

test("PDF-to-EPUB conversion retains unresolved annotation as hidden provenance by default", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-policy-default-"));
  try {
    const input = path.join(directory, "unresolved.pdf");
    const output = path.join(directory, "unresolved.epub");
    await writeFile(input, unresolvedPdf());

    const result = await convertPdfToEpub(input, output, {
      title: "Unresolved Fixture",
      modified: "2026-09-11T12:00:00Z",
    });

    assert.equal(result.unresolvedAnnotationCount, 1);
    const epubText = new TextDecoder().decode(await readFile(output));
    assert.match(epubText, /fileshape-unresolved-provenance-set/);
    assert.match(epubText, /hidden="hidden" class="fileshape-unresolved-provenance"/);
    assert.match(epubText, />note<\/span>/);
    assert.doesNotMatch(epubText, /fileshape-unresolved-annotation/);
    assert.doesNotMatch(epubText, /<ruby>note/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PDF-to-EPUB conversion can opt back into strict unresolved failure", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-policy-strict-"));
  try {
    const input = path.join(directory, "unresolved.pdf");
    const output = path.join(directory, "unresolved.epub");
    await writeFile(input, unresolvedPdf());

    await assert.rejects(
      () => convertPdfToEpub(input, output, {
        title: "Strict Fixture",
        modified: "2026-09-11T12:00:00Z",
        unresolvedRubyPolicy: "error",
      }),
      /requires unresolved ruby policy before rendering page 1/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
