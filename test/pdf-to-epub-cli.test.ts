import assert from "node:assert/strict";
import test from "node:test";
import {
  CLI_USAGE,
  convertPdfToEpub,
  parseCliArguments,
} from "../src/pdf-to-epub.js";

test("CLI parser accepts the documented option surface", () => {
  const parsed = parseCliArguments([
    "input.pdf",
    "output.epub",
    "--title", "Title",
    "--creator", "Creator",
    "--language", "ja",
    "--identifier", "urn:test:id",
    "--modified", "2026-09-12T00:00:00Z",
    "--title-prefix", "Prefix",
    "--ruby", "off",
    "--unresolved-ruby", "error",
    "--page-progression-direction", "rtl",
    "--cover-occurrence", "3:12:0",
  ]);

  assert.equal(parsed.inputPath, "input.pdf");
  assert.equal(parsed.outputPath, "output.epub");
  assert.deepEqual(parsed.options, {
    title: "Title",
    creator: "Creator",
    language: "ja",
    identifier: "urn:test:id",
    modified: "2026-09-12T00:00:00Z",
    titlePrefix: "Prefix",
    rubyMode: "off",
    unresolvedRubyPolicy: "error",
    pageProgressionDirection: "rtl",
    coverOccurrence: { sourcePage: 3, operatorIndex: 12, occurrenceIndex: 0 },
  });
});

test("CLI parser rejects unknown, missing, and invalid option values", () => {
  assert.throws(() => parseCliArguments(["input.pdf", "--unknown", "x"]), /unknown option/);
  assert.throws(() => parseCliArguments(["input.pdf", "--title"]), /missing value/);
  assert.throws(() => parseCliArguments(["input.pdf", "--ruby", "maybe"]), /--ruby must be on or off/);
  assert.throws(() => parseCliArguments(["input.pdf", "--unresolved-ruby", "drop"]), /--unresolved-ruby/);
  assert.throws(() => parseCliArguments(["input.pdf", "--page-progression-direction", "auto"]), /page-progression-direction/);
  assert.throws(() => parseCliArguments([]), /usage:/);
  assert.throws(() => parseCliArguments(["a.pdf", "b.epub", "extra"]), /usage:/);
});

test("CLI usage documents every implemented value-taking option", () => {
  for (const option of [
    "--title",
    "--creator",
    "--language",
    "--identifier",
    "--modified",
    "--title-prefix",
    "--ruby",
    "--unresolved-ruby",
    "--page-progression-direction",
    "--cover-occurrence",
  ]) {
    assert.match(CLI_USAGE, new RegExp(option.replaceAll("-", "\\-")));
  }
});

test("converter refuses to replace the source PDF path", async () => {
  await assert.rejects(
    convertPdfToEpub("same-path.pdf", "same-path.pdf"),
    /output path must differ from input PDF path/,
  );
});
