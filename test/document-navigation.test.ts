import assert from "node:assert/strict";
import test from "node:test";
import { assertDocumentModel } from "../src/document-model.js";
import { buildDocumentNavigation, type SourceOutlineItem } from "../src/document-navigation.js";
import { serializeEpubPackage } from "../src/epub-package.js";
import { epubcheckDocumentFixture } from "./epubcheck-fixture.js";

function fixture() {
  const document = epubcheckDocumentFixture();
  const outline: SourceOutlineItem[] = [{
    title: "Part & One",
    destination: null,
    target: { status: "unresolved", reason: "no-destination" },
    items: [{ title: " <𠮷> Section ", destination: [1, { name: "Fit" }], target: { status: "resolved", sourcePage: 2 }, items: [] }],
  }, {
    title: "External entry", destination: null, externalUrl: "javascript:alert(1)",
    target: { status: "unresolved", reason: "external-destination" }, items: [],
  }];
  document.source.outline = outline;
  document.navigation = buildDocumentNavigation(outline);
  return document;
}

const options = { title: "Book", modified: "2026-09-11T00:00:00Z", unresolvedRubyPolicy: "preserve-as-page-note" } as const;
const nav = (document = fixture()) => new TextDecoder().decode(serializeEpubPackage(document, options).files.find((file) => file.path === "OEBPS/nav.xhtml")!.data);

test("navigation provenance rejects altered titles, targets, paths, hierarchy and source coverage", () => {
  for (const mutate of [
    (d: ReturnType<typeof fixture>) => { d.navigation![0]!.title = "Changed"; },
    (d: ReturnType<typeof fixture>) => { d.navigation![0]!.target = { status: "resolved", sourcePage: 1 }; },
    (d: ReturnType<typeof fixture>) => { d.navigation![0]!.children[0]!.target = { status: "resolved", sourcePage: 1 }; },
    (d: ReturnType<typeof fixture>) => { d.navigation![0]!.sourceOutlinePath = [1]; },
    (d: ReturnType<typeof fixture>) => { d.navigation!.reverse(); },
    (d: ReturnType<typeof fixture>) => { d.navigation!.pop(); },
    (d: ReturnType<typeof fixture>) => { d.navigation![0]!.children = []; },
  ]) {
    const document = fixture();
    assertDocumentModel(document);
    mutate(document);
    assert.throws(() => assertDocumentModel(document), /outline/);
  }
  const document = fixture();
  document.source.outline![0]!.items[0]!.target = { status: "resolved", sourcePage: 999 };
  document.navigation = buildDocumentNavigation(document.source.outline!);
  assert.throws(() => assertDocumentModel(document), /target page is missing/);
});

test("EPUB nav preserves hierarchy, exact titles and page access without activating external links", () => {
  const xhtml = nav();
  assert.match(xhtml, /<li><span>Part &amp; One<\/span><ol><li><a href="text\/page-0001.xhtml#source-page-2"> &lt;𠮷&gt; Section <\/a><\/li><\/ol><\/li>/);
  assert.match(xhtml, /epub:type="page-list"/);
  assert.match(xhtml, /href="text\/page-0001\.xhtml#source-page-1"[^>]*>Page 1<\/a>/);
  assert.match(xhtml, /href="text\/page-0001\.xhtml#source-page-2"[^>]*>Page 2<\/a>/);
  assert.match(xhtml, /href="text\/page-0003\.xhtml#source-page-3"[^>]*>Page 3<\/a>/);
  assert.match(xhtml, /<li>External entry<\/li>/);
  assert.doesNotMatch(xhtml, /javascript:|href="https?:/);
});

test("without usable outline targets, page navigation remains and unlinked labels are retained", () => {
  const document = fixture();
  document.source.outline![0]!.items[0]!.target = { status: "unresolved", reason: "invalid-destination" };
  document.navigation = buildDocumentNavigation(document.source.outline!);
  const result = serializeEpubPackage(document, options);
  assert.equal(result.navigation.mode, "pages");
  const xhtml = nav(document);
  assert.match(xhtml, />Page 1<\/a>/);
  assert.match(xhtml, /<li>Part &amp; One<\/li><li> &lt;𠮷&gt; Section <\/li>/);
  assert.doesNotMatch(xhtml, /<span>|epub:type="page-list"/);
});

test("blank outline labels get a presentation fallback while the source title stays exact", () => {
  const document = fixture();
  document.source.outline![0]!.items[0]!.title = "  ";
  document.navigation = buildDocumentNavigation(document.source.outline!);
  assert.match(nav(document), />Untitled entry<\/a>/);
  assert.equal(document.navigation[0]!.children[0]!.title, "  ");
});

test("adding navigation changes only navigation resources, never body text, ruby, notes, OPF or spine", () => {
  const document = fixture();
  const withOutline = serializeEpubPackage(document, options);
  const without = structuredClone(document);
  delete without.navigation;
  delete without.source.outline;
  const baseline = serializeEpubPackage(without, options);
  const nonNavigation = (files: typeof withOutline.files) => files.filter((f) =>
    f.path !== "OEBPS/nav.xhtml" && f.path !== "OEBPS/toc.ncx");
  assert.deepEqual(nonNavigation(withOutline.files), nonNavigation(baseline.files));
  assert.equal(baseline.navigation.mode, "pages");
  assert.deepEqual(withOutline.bytes, serializeEpubPackage(document, options).bytes);
});
