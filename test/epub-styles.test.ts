import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultEpubStyles,
  EPUB_STYLES_HREF_FROM_NAV,
  EPUB_STYLES_HREF_FROM_TEXT,
  EPUB_STYLES_PATH,
} from "../src/epub-styles.js";

test("default EPUB stylesheet uses only reflow-friendly layout rules", () => {
  const css = defaultEpubStyles();
  assert.equal(EPUB_STYLES_PATH, "styles/fileshape.css");
  assert.equal(EPUB_STYLES_HREF_FROM_TEXT, "../styles/fileshape.css");
  assert.equal(EPUB_STYLES_HREF_FROM_NAV, "styles/fileshape.css");
  assert.match(css, /writing-mode:\s*vertical-rl/);
  assert.match(css, /writing-mode:\s*horizontal-tb/);
  assert.match(css, /ruby-position:\s*over/);
  assert.match(css, /fileshape-unresolved-notes/);
  assert.doesNotMatch(css, /position:\s*absolute/);
  assert.doesNotMatch(css, /^\s*height:\s*\d/m);
  assert.doesNotMatch(css, /font-size:\s*\d+(?:px|pt)/);
});
