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

function storedZipEntryText(bytes: Uint8Array, expectedPath: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;

  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const entryPath = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    if (entryPath === expectedPath) {
      assert.equal(method, 0, `${expectedPath} must remain a stored ZIP entry in this fixture`);
      return decoder.decode(bytes.slice(dataStart, dataStart + compressedSize));
    }
    offset = dataStart + compressedSize;
  }

  assert.fail(`missing ZIP entry ${expectedPath}`);
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
    const epub = new Uint8Array(await readFile(output));
    const content = storedZipEntryText(epub, "OEBPS/text/page-0001.xhtml");
    assert.match(content, /fileshape-unresolved-provenance-set/);
    assert.match(content, /hidden="hidden" class="fileshape-unresolved-provenance"/);
    assert.match(content, />note<\/span>/);
    assert.doesNotMatch(content, /fileshape-unresolved-annotation/);
    assert.doesNotMatch(content, /fileshape-unresolved-notes/);
    assert.doesNotMatch(content, /<ruby>note/);
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
