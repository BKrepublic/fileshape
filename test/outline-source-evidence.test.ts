import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  classifyDestinationAgainstPage,
  destinationDisplayGeometry,
  inspectOutlineSourceEvidence,
  summarizeOutlineSourceEvidence,
  type OutlineEntryEvidence,
} from "../src/outline-source-evidence.js";
import type { InspectPage, InspectTextItem } from "../src/pdf-inspector.js";
import type { PhysicalPageLayout } from "../src/physical-layout.js";

function textItem(text: string): InspectTextItem {
  return {
    text,
    dir: "ltr",
    fontName: "F1",
    width: 40,
    height: 10,
    transform: [10, 0, 0, 10, 10, 20],
    x: 10,
    y: 20,
    displayTransform: [10, 0, 0, -10, 10, 20],
    displayX: 10,
    displayY: 20,
    fontSize: 10,
    hasEOL: false,
    source: { page: 1, itemIndex: 0, charStart: 0, charEnd: text.length },
    displayGeometry: {
      start: { x: 10, y: 20 },
      end: { x: 50, y: 20 },
      inline: { x: 1, y: 0 },
      side: { x: 0, y: 1 },
      inlineExtent: 40,
      crossExtent: 10,
      displayWidth: 40,
      displayHeight: 10,
    },
    glyphs: [{
      source: { page: 1, operatorIndex: 2, glyphIndex: 0 },
      unicode: text,
      text,
      geometry: {
        start: { x: 10, y: 20 }, end: { x: 50, y: 20 }, inline: { x: 1, y: 0 }, side: { x: 0, y: 1 },
        inlineExtent: 40, crossExtent: 10, displayWidth: 40, displayHeight: 10,
      },
      sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: text.length }],
    }],
  };
}

function analysis(text = "ffi𠮷"): {
  page: InspectPage;
  orientation: "horizontal";
  bodyFontSize: number;
  physical: PhysicalPageLayout;
} {
  const item = textItem(text);
  return {
    page: {
      page: 1, width: 100, height: 100, rotation: 0, userUnit: 1, view: [0, 0, 100, 100],
      textItemCount: 1, imagePaintOps: 0, textItems: [item],
    },
    orientation: "horizontal",
    bodyFontSize: 10,
    physical: {
      orientation: "horizontal",
      inlineSize: 100,
      units: [{
        index: 0, position: 20, itemCount: 1, text,
        sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: text.length }],
        inlineStart: 10, inlineEnd: 50, inlineSpan: 40,
        inlineStartRatio: 0.1, inlineEndRatio: 0.5, inlineCoverageRatio: 0.4,
      }],
      gaps: [],
    },
  };
}

test("destination geometry uses viewport conversion instead of assuming PDF/display axes", () => {
  const rotated = {
    convertToViewportPoint(x: number, y: number): [number, number] {
      return [y, 100 - x];
    },
  };
  const result = destinationDisplayGeometry(
    [{ num: 3, gen: 0 }, { name: "FitH" }, 75],
    [0, 0, 100, 200],
    rotated,
  );
  assert.equal(result.kind, "FitH");
  assert.deepEqual(result.geometry, { kind: "line", x1: 75, y1: 100, x2: 75, y2: 0 });
});

test("point intersection preserves whole source ranges for ligatures and supplementary Unicode", () => {
  const source = analysis();
  const result = classifyDestinationAgainstPage({ kind: "point", x: 10, y: 20 }, source);
  assert.equal(result.evidenceClass, "unique-position");
  assert.equal(result.reason, "single-unit-intersection");
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0]?.sourceRanges, [
    { page: 1, itemIndex: 0, charStart: 0, charEnd: 5 },
  ]);
  assert.deepEqual(result.candidates[0]?.glyphRefs, [
    { page: 1, operatorIndex: 2, glyphIndex: 0 },
  ]);
});

test("a destination line crossing multiple units remains ambiguous instead of choosing nearest text", () => {
  const source = analysis("first");
  const secondItem = { ...textItem("second"), source: { page: 1, itemIndex: 1, charStart: 0, charEnd: 6 } };
  secondItem.displayGeometry = {
    ...secondItem.displayGeometry!,
    start: { x: 10, y: 40 }, end: { x: 50, y: 40 },
  };
  source.page.textItems.push(secondItem);
  source.physical.units.push({
    index: 1, position: 40, itemCount: 1, text: "second",
    sourceRanges: [{ page: 1, itemIndex: 1, charStart: 0, charEnd: 6 }],
    inlineStart: 10, inlineEnd: 50, inlineSpan: 40,
    inlineStartRatio: 0.1, inlineEndRatio: 0.5, inlineCoverageRatio: 0.4,
  });
  const result = classifyDestinationAgainstPage({ kind: "line", x1: 25, y1: 0, x2: 25, y2: 100 }, source);
  assert.equal(result.evidenceClass, "ambiguous-position");
  assert.equal(result.candidates.length, 2);
});

function pdfWithRotatedOutline(): Buffer {
  const pageRefs = [3, 4, 5, 6];
  const rotations = [0, 90, 180, 270];
  const objects: string[] = [];
  objects[0] = "<< /Type /Catalog /Pages 2 0 R /Outlines 12 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count 4 >>`;
  for (let index = 0; index < 4; index += 1) {
    objects[2 + index] = `<< /Type /Page /Parent 2 0 R /Rotate ${rotations[index]} /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents ${8 + index} 0 R >>`;
  }
  objects[6] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  for (let index = 0; index < 4; index += 1) {
    const content = "BT /F1 20 Tf 1 0 0 1 100 700 Tm (Heading) Tj ET";
    objects[7 + index] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }
  objects[11] = "<< /Type /Outlines /First 13 0 R /Last 17 0 R /Count 5 >>";
  for (let index = 0; index < 5; index += 1) {
    const objectNumber = 13 + index;
    const pageRef = index === 4 ? 3 : pageRefs[index]!;
    const previous = index === 0 ? "" : `/Prev ${objectNumber - 1} 0 R `;
    const next = index === 4 ? "" : `/Next ${objectNumber + 1} 0 R `;
    objects[12 + index] = `<< /Title (${index < 2 ? "Same" : `T${index}`}) /Parent 12 0 R ${previous}${next}/Dest [${pageRef} 0 R /XYZ 100 700 null] >>`;
  }

  let output = "%PDF-1.7\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

test("real PDF outline evidence survives 0/90/180/270 rotations and records duplicate controls without titles", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-outline-evidence-"));
  try {
    const file = path.join(directory, "fixture.pdf");
    await writeFile(file, pdfWithRotatedOutline());
    const report = await inspectOutlineSourceEvidence(file);
    assert.equal(report.outlineEntries, 5);
    assert.deepEqual(report.entries.slice(0, 4).map((entry) => entry.pageGeometry?.rotation), [0, 90, 180, 270]);
    assert.ok(report.entries.slice(0, 4).every((entry) => entry.evidenceClass === "unique-position"));
    assert.equal(report.entries[0]?.relationships.sameResolvedDestinationCount, 2);
    assert.equal(report.entries[4]?.relationships.sameResolvedDestinationCount, 2);
    assert.equal(report.entries[0]?.relationships.sameTitleHashCount, 2);
    assert.equal(report.entries[1]?.relationships.sameTitleHashCount, 2);
    assert.equal("title" in (report.entries[0] ?? {}), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("summary accounts for every evidence class and relationship", () => {
  const base = {
    sourceOutlinePath: [0], titleSha256: "x", titleLength: 1,
    originalDestination: { kind: "none" as const }, resolvedDestination: null,
    sourcePage: 1, destinationKind: "Fit", displayGeometry: { kind: "page" as const },
    pageGeometry: null, writingOrientation: "horizontal" as const, bodyFontSize: 10,
    evidenceClass: "page-only" as const, reason: "page-destination" as const, candidates: [],
    relationships: {
      samePageEntryCount: 2, sameResolvedDestinationCount: 1, sameTitleHashCount: 2,
      parentSamePage: false, nonMonotonicFromPreviousResolvedEntry: false,
    },
  } satisfies OutlineEntryEvidence;
  const report = summarizeOutlineSourceEvidence([{
    pdfId: "sha256:deadbeef", sha256: "0".repeat(64), pages: 2, outlineEntries: 2,
    entries: [base, {
      ...base,
      sourceOutlinePath: [1],
      evidenceClass: "unmappable",
      reason: "invalid-destination",
      relationships: { ...base.relationships, nonMonotonicFromPreviousResolvedEntry: true },
    }],
  }], "2026-09-11T00:00:00.000Z");
  assert.equal(report.outlineEntries, 2);
  assert.equal(report.classCounts["page-only"], 1);
  assert.equal(report.classCounts.unmappable, 1);
  assert.equal(report.relationshipCounts.entriesSharingPage, 2);
  assert.equal(report.relationshipCounts.entriesSharingTitleHash, 2);
  assert.equal(report.relationshipCounts.nonMonotonic, 1);
});
