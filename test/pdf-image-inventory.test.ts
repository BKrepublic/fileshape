import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectPdfImages, summarizeImageCorpus } from "../src/pdf-image-inventory.js";
import { imagePdfBytes } from "./pdf-image-fixture.js";

test("real PDF image inventory retains every paint occurrence without publishing resource names", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-image-"));
  try {
    const file = path.join(directory, "private-name.pdf");
    await writeFile(file, imagePdfBytes());
    const report = await inspectPdfImages(file);

    assert.equal(report.pages, 1);
    assert.equal(report.scannedPages, 1);
    assert.match(report.pdfId, /^sha256:[0-9a-f]{16}$/);
    assert.ok(report.paintOperations >= 4, `expected at least four paints, got ${report.paintOperations}`);
    assert.equal(report.supportedPaints + report.unsupportedPaints, report.paintOperations);
    assert.ok((report.kindCounts.xobject ?? 0) >= 3);
    assert.ok((report.kindCounts.inline ?? 0) >= 1);
    assert.ok(report.formPaints >= 1);
    assert.ok(report.clipObservedPaints >= 1);
    assert.ok(report.uniqueResourceRefs >= 1);

    const encoded = JSON.stringify(report);
    assert.doesNotMatch(encoded, /private-name/);
    assert.doesNotMatch(encoded, /Im1|Fm1/);
    assert.ok(report.pageReports[0]!.paints.every((paint) => !("resourceId" in paint)));
    assert.ok(report.pageReports[0]!.paints.some((paint) => paint.resourceRefHash !== undefined));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("corpus summary accounts for every paint and classification", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-image-summary-"));
  try {
    const file = path.join(directory, "fixture.pdf");
    await writeFile(file, imagePdfBytes());
    const one = await inspectPdfImages(file);
    const summary = summarizeImageCorpus([one, one]);
    assert.equal(summary.pdfs, 2);
    assert.equal(summary.pages, 2);
    assert.equal(summary.paintOperations, one.paintOperations * 2);
    assert.equal(summary.supportedPaints + summary.unsupportedPaints, summary.paintOperations);
    assert.equal(summary.formPaints, one.formPaints * 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
