import assert from "node:assert/strict";
import test from "node:test";
import { defaultEpubStyles } from "../src/epub-styles.js";

test("EPUB stylesheet requests strict Japanese line breaking without forced word wrapping", () => {
  const css = defaultEpubStyles();
  assert.match(css, /line-break: strict;/);
  assert.match(css, /word-break: normal;/);
  assert.match(css, /overflow-wrap: normal;/);
});
