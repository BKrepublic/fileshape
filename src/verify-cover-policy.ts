import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CoverOccurrenceSelector } from "./cover-policy.js";
import { buildDocumentFromInspection } from "./pdf-document-pipeline.js";
import { inspectPdf } from "./pdf-inspector.js";
import { convertPdfToEpub } from "./pdf-to-epub.js";
import { createEpubChecker, epubCheckSummary } from "./epubcheck.js";
import { validateEpubImagePackage } from "./epub-image-package-validation.js";

const SAMPLE_DIRECTORY = "local-samples";
const EXPECTED_PDF_COUNT = 9;
const FIXED_MODIFIED = "2026-09-12T00:00:00Z";

async function findExactImageOccurrence(files: string[]): Promise<{ file: string; selector: CoverOccurrenceSelector }> {
  for (const [index, file] of files.entries()) {
    const inspection = await inspectPdf(file, { includeImages: true });
    const { document } = buildDocumentFromInspection(inspection, `local:cover-smoke:${index + 1}`);
    for (const page of document.pages) {
      const occurrence = page.imageOccurrences[0];
      if (!occurrence) continue;
      return {
        file,
        selector: {
          sourcePage: occurrence.sourcePage,
          operatorIndex: occurrence.operatorIndex,
          occurrenceIndex: occurrence.occurrenceIndex,
        },
      };
    }
  }
  throw new Error("private corpus has no production image occurrence for explicit cover smoke verification");
}

async function main(): Promise<void> {
  const names = (await readdir(SAMPLE_DIRECTORY))
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();
  assert.equal(names.length, EXPECTED_PDF_COUNT, `expected ${EXPECTED_PDF_COUNT} PDFs but found ${names.length}`);
  const files = names.map((name) => path.join(SAMPLE_DIRECTORY, name));
  const selected = await findExactImageOccurrence(files);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "fileshape-cover-smoke-"));
  try {
    const defaultOutput = path.join(temporary, "default.epub");
    const coverOutput = path.join(temporary, "cover.epub");
    const common = {
      title: "FileShape private cover smoke",
      modified: FIXED_MODIFIED,
      unresolvedRubyPolicy: "preserve-as-page-note" as const,
    };
    await convertPdfToEpub(selected.file, defaultOutput, common);
    const coverResult = await convertPdfToEpub(selected.file, coverOutput, {
      ...common,
      coverOccurrence: selected.selector,
    });
    assert.ok(coverResult.coverImageResourceId, "explicit cover conversion did not resolve a cover image resource");

    const defaultBytes = new Uint8Array(await readFile(defaultOutput));
    const coverBytes = new Uint8Array(await readFile(coverOutput));
    const defaultValidation = validateEpubImagePackage(defaultBytes);
    const coverValidation = validateEpubImagePackage(coverBytes);
    assert.deepEqual(defaultValidation.issues, [], `default image package issues: ${defaultValidation.issues.join("; ")}`);
    assert.deepEqual(coverValidation.issues, [], `cover image package issues: ${coverValidation.issues.join("; ")}`);
    assert.equal(defaultValidation.coverImageHashes.length, 0, "default conversion unexpectedly designates a cover");
    assert.equal(coverValidation.coverImageHashes.length, 1, "explicit cover conversion must designate exactly one cover resource");
    assert.equal(defaultValidation.occurrenceCount, coverValidation.occurrenceCount, "cover designation changed body image occurrence count");
    assert.equal(defaultValidation.resourceCount, coverValidation.resourceCount, "cover designation changed PNG resource count");
    assert.deepEqual(defaultValidation.resourceHashes, coverValidation.resourceHashes, "cover designation changed packaged image resources");
    assert.equal(
      coverValidation.coverImageHashes[0],
      coverResult.coverImageResourceId.slice("image-".length),
      "OPF cover-image marker does not match the exact selected occurrence resource",
    );

    const checker = await createEpubChecker();
    const epubcheck = await checker.check(coverOutput);
    assert.equal(epubcheck.valid, true, epubCheckSummary(epubcheck) + JSON.stringify(epubcheck.messages));
    assert.equal(epubcheck.errors, 0, "explicit cover EPUBCheck produced errors");
    assert.equal(epubcheck.warnings, 0, "explicit cover EPUBCheck produced warnings");

    console.log("COVER_SMOKE=PASS");
    console.log(`PDFS=${names.length}`);
    console.log(`BODY_IMAGE_OCCURRENCES=${coverValidation.occurrenceCount}`);
    console.log(`PNG_RESOURCES=${coverValidation.resourceCount}`);
    console.log(`COVER_MARKERS=${coverValidation.coverImageHashes.length}`);
    console.log("BODY_OCCURRENCES_PRESERVED=yes");
    console.log("PNG_RESOURCES_UNCHANGED=yes");
    console.log(`EPUBCheck ${checker.version}: pass (0 errors, 0 warnings)`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
