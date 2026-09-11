import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDocumentFromInspection } from "../src/pdf-document-pipeline.js";
import { convertPdfToEpub } from "../src/pdf-to-epub.js";
import type { InspectPage, InspectResult, InspectTextItem } from "../src/pdf-inspector.js";

function pdfBytes(): Buffer {
  const content = "BT /F1 20 Tf 1 0 0 1 100 500 Tm (Wi,) Tj ET\nBT /F1 10 Tf 1 0 0 1 101 516 Tm (abc) Tj ET";
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

function firstZipEntry(bytes: Uint8Array): { name: string; method: number; data: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const method = view.getUint16(8, true);
  const size = view.getUint32(18, true);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const nameStart = 30;
  const dataStart = nameStart + nameLength + extraLength;
  return {
    name: new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength)),
    method,
    data: bytes.slice(dataStart, dataStart + size),
  };
}

function item(text: string, x: number, y: number, width: number, height: number): InspectTextItem {
  return {
    text,
    dir: "ltr",
    fontName: "F1",
    width,
    height,
    transform: [10, 0, 0, 10, x, y],
    x,
    y,
    displayTransform: [10, 0, 0, -10, x, 800 - y],
    displayX: x,
    displayY: 800 - y,
    fontSize: 10,
    hasEOL: false,
  };
}

function ambiguousItem(text: string, x: number, y: number): InspectTextItem {
  return {
    ...item(text, x, y, 10, 10),
    displayTransform: [1, 1, 0, 1, x, 800 - y],
  };
}

function inspection(pages: InspectPage[]): InspectResult {
  return { file: "fixture.pdf", byteLength: 1, pageCount: pages.length, pages };
}

function page(pageNumber: number, textItems: InspectTextItem[]): InspectPage {
  return {
    page: pageNumber,
    width: 600,
    height: 800,
    rotation: 0,
    userUnit: 1,
    view: [0, 0, 600, 800],
    textItemCount: textItems.length,
    imagePaintOps: 0,
    textItems,
  };
}

test("converts a real PDF into a complete EPUB archive", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-epub-e2e-"));
  try {
    const input = path.join(directory, "fixture.pdf");
    const output = path.join(directory, "fixture.epub");
    await writeFile(input, pdfBytes());

    const result = await convertPdfToEpub(input, output, {
      title: "Fixture",
      modified: "2026-09-11T12:00:00Z",
    });
    assert.equal(result.pageCount, 1);
    assert.match(result.documentId, /^urn:sha256:[0-9a-f]{64}$/);
    assert.equal(result.outputPath, path.resolve(output));

    const epub = new Uint8Array(await readFile(output));
    assert.equal(epub.byteLength, result.byteLength);
    const first = firstZipEntry(epub);
    assert.equal(first.name, "mimetype");
    assert.equal(first.method, 0);
    assert.equal(new TextDecoder().decode(first.data), "application/epub+zip");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("document context resolves a short unknown page between matching orientations", () => {
  const pages = [
    page(1, [item("long horizontal line", 100, 700, 180, 10)]),
    page(2, [ambiguousItem("X", 100, 700)]),
    page(3, [item("another horizontal line", 100, 700, 200, 10)]),
  ];
  const result = buildDocumentFromInspection(inspection(pages), "doc:context");
  assert.equal(result.document.pages[1]?.orientation, "horizontal");
  assert.equal(result.document.pages[1]?.blocks[0]?.inlines[0]?.kind, "text");
});

test("text-bearing page with unresolved orientation fails closed", () => {
  const source = inspection([page(1, [ambiguousItem("X", 100, 700)])]);
  assert.throws(
    () => buildDocumentFromInspection(source, "doc:unknown"),
    /visible text but unresolved writing orientation/,
  );
});
