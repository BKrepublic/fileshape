import assert from "node:assert/strict";
import test from "node:test";
import { applyEpubContentPolicy } from "../src/content-policy.js";
import type { FileShapeDocument } from "../src/document-model.js";
import { serializeEpubPackage } from "../src/epub-package.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";

function fixture(): FileShapeDocument {
  return {
    kind: "document",
    id: "policy:fixture",
    imageResources: [],
    source: {
      documentId: "policy:fixture",
      pages: [{
        page: 1,
        textItems: [
          { itemIndex: 0, text: "本文" },
          { itemIndex: 1, text: "<注&記>" },
        ],
      }],
    },
    pages: [{
      kind: "page",
      imageOccurrences: [],
      sourcePage: 1,
      rotation: 0,
      orientation: "horizontal",
      blocks: [{
        kind: "text",
        sourcePage: 1,
        semanticBlockIndex: 0,
        unitIndexes: [0],
        semanticText: "本文",
        sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: 2 }],
        inlines: [{
          kind: "text",
          text: "本文",
          sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: 2 }],
        }],
      }],
      unresolvedRuby: [{
        status: "unresolved",
        reason: "no-base",
        annotationSourceRanges: [{ page: 1, itemIndex: 1, charStart: 0, charEnd: 5 }],
        baseSourceRanges: [],
        annotationGlyphRefs: [],
        baseGlyphRefs: [],
        alternatives: [],
      }],
      unmappedExactRuby: [],
    }],
  };
}

test("strict unresolved-ruby policy remains fail-closed", () => {
  assert.throws(
    () => serializeEpubXhtml(fixture()),
    /requires unresolved ruby policy before rendering page 1/,
  );
});

test("preserve-as-page-note resolves annotation text without mutating the document", () => {
  const document = fixture();
  const result = applyEpubContentPolicy(document, { unresolvedRuby: "preserve-as-page-note" });
  const note = result.pages[0]!.notes[0]!;

  assert.equal(note.kind, "unresolved-annotation");
  assert.equal(note.reason, "no-base");
  assert.equal(note.text, "<注&記>");
  assert.deepEqual(note.sourceRanges, [{ page: 1, itemIndex: 1, charStart: 0, charEnd: 5 }]);
  assert.equal(result.pages[0]!.hiddenProvenance.length, 0);
  assert.equal(document.pages[0]!.unresolvedRuby.length, 1);
  assert.equal(document.source.pages[0]!.textItems[1]!.text, "<注&記>");
});

test("preserved unresolved annotation is emitted as a page note only when explicitly requested", () => {
  const xhtml = serializeEpubXhtml(fixture(), {
    unresolvedRubyPolicy: "preserve-as-page-note",
  }).pages[0]!.xhtml;

  assert.match(xhtml, />本文<\/p>/);
  assert.match(xhtml, /class="fileshape-unresolved-annotation"/);
  assert.match(xhtml, /data-fileshape-reason="no-base"/);
  assert.match(xhtml, /&lt;注&amp;記&gt;/);
  assert.doesNotMatch(xhtml, /<ruby>&lt;注/);
  assert.doesNotMatch(xhtml, /fileshape-unresolved-provenance/);
});

test("hidden provenance preserves unresolved source evidence without reader-visible notes", () => {
  const document = fixture();
  const result = applyEpubContentPolicy(document, {
    unresolvedRuby: "preserve-as-hidden-provenance",
  });
  const page = result.pages[0]!;
  const evidence = page.hiddenProvenance[0]!;

  assert.equal(page.notes.length, 0);
  assert.equal(evidence.text, "<注&記>");
  assert.equal(evidence.reason, "no-base");
  assert.deepEqual(evidence.sourceRanges, [{ page: 1, itemIndex: 1, charStart: 0, charEnd: 5 }]);
  assert.equal(document.pages[0]!.unresolvedRuby.length, 1);
});

test("hidden provenance is serialized as hidden source evidence, never a Notes section", () => {
  const xhtml = serializeEpubXhtml(fixture(), {
    unresolvedRubyPolicy: "preserve-as-hidden-provenance",
  }).pages[0]!.xhtml;

  assert.match(xhtml, /hidden="hidden" class="fileshape-unresolved-provenance-set"/);
  assert.match(xhtml, /hidden="hidden" class="fileshape-unresolved-provenance"/);
  assert.match(xhtml, /data-fileshape-reason="no-base"/);
  assert.match(xhtml, /data-fileshape-source-ranges=/);
  assert.match(xhtml, /&lt;注&amp;記&gt;/);
  assert.doesNotMatch(xhtml, /fileshape-unresolved-notes/);
  assert.doesNotMatch(xhtml, /fileshape-unresolved-annotation/);
  assert.doesNotMatch(xhtml, /<h2>Notes<\/h2>/);
});

test("EPUB package carries the explicit page-note policy through to packaged XHTML", () => {
  const packageResult = serializeEpubPackage(fixture(), {
    title: "Policy Fixture",
    modified: "2026-09-11T12:00:00Z",
    unresolvedRubyPolicy: "preserve-as-page-note",
  });
  const page = packageResult.files.find((file) => file.path === "OEBPS/text/page-0001.xhtml");
  assert.ok(page);
  const xhtml = new TextDecoder().decode(page.data);
  assert.match(xhtml, /fileshape-unresolved-annotation/);
  assert.match(xhtml, /&lt;注&amp;記&gt;/);
});

test("EPUB package carries hidden provenance without exposing unresolved notes", () => {
  const packageResult = serializeEpubPackage(fixture(), {
    title: "Policy Fixture",
    modified: "2026-09-11T12:00:00Z",
    unresolvedRubyPolicy: "preserve-as-hidden-provenance",
  });
  const page = packageResult.files.find((file) => file.path === "OEBPS/text/page-0001.xhtml");
  assert.ok(page);
  const xhtml = new TextDecoder().decode(page.data);
  assert.match(xhtml, /hidden="hidden" class="fileshape-unresolved-provenance"/);
  assert.doesNotMatch(xhtml, /fileshape-unresolved-notes/);
  assert.doesNotMatch(xhtml, /fileshape-unresolved-annotation/);
});

test("preserve policies fail closed when an unresolved candidate has no annotation source", () => {
  for (const unresolvedRuby of ["preserve-as-page-note", "preserve-as-hidden-provenance"] as const) {
    const document = fixture();
    document.pages[0]!.unresolvedRuby[0]!.annotationSourceRanges = [];
    assert.throws(
      () => applyEpubContentPolicy(document, { unresolvedRuby }),
      /has no annotation source ranges/,
    );
  }
});
