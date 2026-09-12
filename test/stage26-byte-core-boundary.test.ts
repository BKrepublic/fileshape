import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectPdf, inspectPdfBytes, nodePdfJsResourceConfig, type InspectResult } from "../src/pdf-inspector.js";
import { convertPdfBytesToEpub, convertPdfToEpub } from "../src/pdf-to-epub.js";
import { imagePdfBytes } from "./pdf-image-fixture.js";
import { pdfBytes } from "./pdf-fixture.js";

function unresolvedPdfBytes(): Buffer {
  const content = "BT /F1 20 Tf 1 0 0 1 100 500 Tm (Body) Tj ET\nBT /F1 10 Tf 1 0 0 1 400 100 Tm (note) Tj ET";
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

function normalizedInspection(result: InspectResult): InspectResult {
  return {
    ...result,
    file: "<logical-source>",
    pages: result.pages.map((page) => ({
      ...page,
      textItems: page.textItems.map((item) => ({
        ...item,
        fontName: item.fontName.replace(/^g_d\d+_/, ""),
      })),
    })),
  };
}

test("byte inspection preserves caller bytes and matches the path inspection", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-stage26-inspect-"));
  try {
    const input = path.join(directory, "fixture.pdf");
    const source = new Uint8Array(pdfBytes({ outline: true }));
    const before = new Uint8Array(source);
    await writeFile(input, source);
    const [fromPath, fromBytes] = await Promise.all([
      inspectPdf(input, { includeGlyphs: true, includeImages: true }),
      inspectPdfBytes(source, "fixture.pdf", { includeGlyphs: true, includeImages: true }, nodePdfJsResourceConfig),
    ]);
    assert.deepEqual(source, before);
    assert.deepEqual(normalizedInspection(fromBytes), normalizedInspection(fromPath));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("byte conversion matches the CLI adapter and remains deterministic", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-stage26-convert-"));
  try {
    const input = path.join(directory, "fixture.pdf");
    const output = path.join(directory, "fixture.epub");
    const source = new Uint8Array(pdfBytes());
    const options = { title: "Fixture", modified: "2026-09-12T00:00:00Z" } as const;
    await writeFile(input, source);
    const fromBytes = await convertPdfBytesToEpub(source, "fixture.pdf", options);
    const fromPath = await convertPdfToEpub(input, output, options);
    assert.deepEqual(fromBytes.bytes, new Uint8Array(await readFile(output)));
    assert.equal(fromBytes.documentId, fromPath.documentId);
    assert.equal(fromBytes.pageCount, fromPath.pageCount);
    assert.equal(fromBytes.unresolvedAnnotationCount, fromPath.unresolvedAnnotationCount);
    const repeat = await convertPdfBytesToEpub(source, "fixture.pdf", options);
    assert.deepEqual(repeat.bytes, fromBytes.bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("byte conversion preserves unresolved policy and explicit cover lookup failures", async () => {
  const source = new Uint8Array(unresolvedPdfBytes());
  const preserved = await convertPdfBytesToEpub(source, "unresolved.pdf", {
    title: "Unresolved", modified: "2026-09-12T00:00:00Z",
  });
  assert.equal(preserved.unresolvedAnnotationCount, 1);
  assert.match(new TextDecoder().decode(preserved.bytes), /fileshape-unresolved-annotation/);
  await assert.rejects(
    () => convertPdfBytesToEpub(source, "unresolved.pdf", {
      title: "Unresolved", modified: "2026-09-12T00:00:00Z", unresolvedRubyPolicy: "error",
    }),
    /requires unresolved ruby policy before rendering page 1/,
  );
  await assert.rejects(
    () => convertPdfBytesToEpub(new Uint8Array(imagePdfBytes({ includeInline: false, rotation: 0 })), "image.pdf", {
      title: "Image", modified: "2026-09-12T00:00:00Z", coverOccurrence: { sourcePage: 1, operatorIndex: 999, occurrenceIndex: 0 },
    }),
    /cover occurrence not found/,
  );
});

test("source names do not affect identity or explicit-title EPUB bytes", async () => {
  const source = new Uint8Array(pdfBytes());
  const options = { title: "Explicit", modified: "2026-09-12T00:00:00Z" } as const;
  const first = await convertPdfBytesToEpub(source, "book.v2.pdf", options);
  const second = await convertPdfBytesToEpub(source, ".book", options);
  assert.equal(first.documentId, second.documentId);
  assert.deepEqual(first.bytes, second.bytes);
});

test("default titles use only the logical filename suffix rule", async () => {
  const source = new Uint8Array(pdfBytes());
  const options = { modified: "2026-09-12T00:00:00Z" } as const;
  for (const [sourceName, title] of [["book.v2.pdf", "book.v2"], [".book", ".book"], ["book.", "book"]] as const) {
    const result = await convertPdfBytesToEpub(source, sourceName, options);
    assert.match(new TextDecoder().decode(result.bytes), new RegExp(`<dc:title>${title}</dc:title>`));
  }
});

test("byte API validates input before PDF.js and keeps output storage independent", async () => {
  const source = new Uint8Array(pdfBytes());
  await assert.rejects(() => inspectPdfBytes(new Uint8Array(), "fixture.pdf", {}, nodePdfJsResourceConfig), /input must not be empty/);
  await assert.rejects(() => convertPdfBytesToEpub(new Uint8Array(), "fixture.pdf"), /input must not be empty/);
  for (const sourceName of ["", "dir/fixture.pdf", "dir\\fixture.pdf", "fixture\0.pdf"]) {
    await assert.rejects(() => inspectPdfBytes(source, sourceName, {}, nodePdfJsResourceConfig), /sourceName/);
    await assert.rejects(() => convertPdfBytesToEpub(source, sourceName), /sourceName/);
  }
  const result = await convertPdfBytesToEpub(source, "fixture.pdf", { modified: "2026-09-12T00:00:00Z" });
  assert.notEqual(result.bytes.buffer, source.buffer);
  const sourceBefore = new Uint8Array(source);
  result.bytes[0] = result.bytes[0]! ^ 0xff;
  assert.deepEqual(source, sourceBefore);
});
