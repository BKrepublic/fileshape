import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createEpubChecker, parseEpubCheckReport } from "../src/epubcheck.js";
import { EPUBCHECK_VERSION } from "../src/epubcheck-config.js";

function report(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    checker: { checkerVersion: EPUBCHECK_VERSION, nFatal: 0, nError: 0, nWarning: 0, nUsage: 0, ...overrides },
    messages: [],
  });
}

test("EPUBCheck pass requires both a clean report and a successful process", () => {
  assert.equal(parseEpubCheckReport(report(), 0).valid, true);
  assert.equal(parseEpubCheckReport(report(), 1).valid, false);
  assert.equal(parseEpubCheckReport(report(), 2).valid, false);
  for (const key of ["nFatal", "nError", "nWarning"]) {
    assert.equal(parseEpubCheckReport(report({ [key]: 1 }), 0).valid, false, key);
  }
});

test("EPUBCheck cannot pass with missing, malformed or mismatched version evidence", () => {
  for (const json of ["", "{}", "null", '{"checker":{}}', report({ checkerVersion: "0.0.0" }),
    report({ nError: undefined }), report({ nFatal: -1 }), report({ nWarning: "0" }), report({ nError: 0.5 })]) {
    assert.throws(() => parseEpubCheckReport(json, 0));
  }
});

test("EPUBCheck diagnostics remain visible and cannot be hidden by zero counters", () => {
  const json = JSON.parse(report());
  json.messages = [{ ID: "RSC-005", severity: "ERROR", message: "Invalid document" }];
  const result = parseEpubCheckReport(JSON.stringify(json), 0);
  assert.equal(result.valid, false);
  assert.deepEqual(result.messages, [{ id: "RSC-005", severity: "ERROR", message: "Invalid document" }]);
});

test("EPUBCheck unavailable JAR and Java fail before conversion", async () => {
  await assert.rejects(createEpubChecker({ jarPath: "test/no-such-epubcheck.jar" }), /Run npm run setup:epubcheck/);
  await assert.rejects(createEpubChecker({
    jarPath: "package.json",
    javaCommand: path.resolve("test/no-such-java"),
  }), /Could not run EPUBCheck/);
});
