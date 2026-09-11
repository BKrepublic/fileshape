import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  inspectPdfImageResources,
  summarizeImageResourceCorpus,
} from "../src/pdf-image-resource-inventory.js";
import { imagePdfBytes } from "./pdf-image-fixture.js";

test("real PDF image resources are extracted once per page resource and occurrences stay distinct", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-image-resource-"));
  try {
    const file = path.join(directory, "fixture.pdf");
    await writeFile(file, imagePdfBytes());
    const report = await inspectPdfImageResources(file);

    assert.equal(report.pages, 1);
    assert.ok(report.imagePaints >= 4);
    assert.ok(report.xobjectPaints >= 3);
    assert.equal(report.unsupportedResources, 0);
    assert.ok(report.extractedResources >= 1);
    assert.ok(report.uniqueContentResources >= 1);
    assert.ok(report.totalDecodedBytes > 0);
    assert.ok(report.totalPngBytes > 0);
    assert.ok(report.maxPixels >= 1);
    assert.equal(report.occurrences.length, report.imagePaints);

    const xobjects = report.occurrences.filter((occurrence) => occurrence.kind === "xobject");
    assert.ok(xobjects.length >= 3);
    assert.ok(xobjects.every((occurrence) => occurrence.resourceRefHash !== undefined));
    assert.ok(xobjects.every((occurrence) => occurrence.contentHash !== undefined));
    assert.ok(xobjects.some((occurrence) => occurrence.formDepth > 0));
    assert.ok(report.occurrences.some((occurrence) => occurrence.clipObserved));

    const encoded = JSON.stringify(report);
    assert.doesNotMatch(encoded, /Im1|Fm1|fixture\.pdf/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("resource corpus summary preserves extracted and unsupported accounting", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-image-resource-summary-"));
  try {
    const file = path.join(directory, "fixture.pdf");
    await writeFile(file, imagePdfBytes());
    const one = await inspectPdfImageResources(file);
    const summary = summarizeImageResourceCorpus([one, one]);
    assert.equal(summary.pdfs, 2);
    assert.equal(summary.pages, 2);
    assert.equal(summary.imagePaints, one.imagePaints * 2);
    assert.equal(summary.extractedResources, one.extractedResources * 2);
    assert.equal(summary.unsupportedResources, one.unsupportedResources * 2);
    assert.equal(summary.uniqueContentResources, one.uniqueContentResources);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
