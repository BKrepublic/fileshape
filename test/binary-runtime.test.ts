import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createWebBinaryRuntime } from "../src/binary-runtime-web.js";
import { sha256HexSync } from "../src/binary-runtime.js";
import { nodeBinaryRuntime } from "../src/binary-runtime-node.js";
import { extractPdfImageResourceWithRuntime } from "../src/pdf-image-resource-core.js";
import { instantiateZlibWasm } from "../src/zlib-wasm-adapter.js";

const WRAPPER_SHA256 = "ec5bafe66f5681573efc13d5066e11162427e07d3c32b9a8b72fb53e05c6b126";
const WASM_SHA256 = "90bc26f8c73322492510a9438e04d41c5ab7badcf76d0ae1e70d1aae4d9176f1";
const wasmDeflater = readFile("web/vendor/fileshape-zlib-ng-2.3.3.wasm").then(instantiateZlibWasm);

async function webRuntime() {
  return createWebBinaryRuntime(await wasmDeflater);
}

function bytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 31 + 17) & 0xff);
}

test("pinned zlib-ng WASM provenance and required exports are stable", async () => {
  const [wrapper, wasm] = await Promise.all([
    readFile("vendor/zlib-ng/fileshape-zlib-wrapper.c", "utf8"),
    readFile("web/vendor/fileshape-zlib-ng-2.3.3.wasm"),
  ]);
  assert.equal(sha256HexSync(new TextEncoder().encode(wrapper)), WRAPPER_SHA256);
  assert.equal(sha256HexSync(wasm), WASM_SHA256);
});

test("sync and web SHA-256 match the accepted Node provider", async () => {
  const runtime = await webRuntime();
  for (const source of [new Uint8Array(), new TextEncoder().encode("abc"), bytes(65_537)]) {
    const node = await nodeBinaryRuntime.sha256Hex(source);
    assert.equal(sha256HexSync(source), node);
    assert.equal(await runtime.sha256Hex(source), node);
  }
});

test("web zlib-ng WASM deflate matches Node zlib bytes for all accepted fixtures", async () => {
  const web = await webRuntime();
  for (const source of [new Uint8Array(), Uint8Array.from([0]), bytes(257), bytes(65_537), pngRawFixture()]) {
    const node = await nodeBinaryRuntime.deflateZlib(source);
    const browser = await web.deflateZlib(source);
    assert.deepEqual(browser, node);
  }
});

function pngRawFixture(): Uint8Array {
  const rowLength = 1 + 800 * 3;
  const output = new Uint8Array(600 * rowLength);
  for (let row = 0; row < 600; row += 1) {
    const rowStart = row * rowLength;
    output[rowStart] = 0;
    for (let byte = 0; byte < rowLength - 1; byte += 1) {
      output[rowStart + 1 + byte] = (row * 17 + byte * 13 + 23) & 0xff;
    }
  }
  return output;
}

test("runtime-neutral image core preserves Node PNG identity under the web provider", async () => {
  const runtime = await webRuntime();
  const image = {
    width: 2,
    height: 2,
    kind: 3,
    data: Uint8Array.from([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]),
  };
  const [node, web] = await Promise.all([
    extractPdfImageResourceWithRuntime("fixture", image, nodeBinaryRuntime),
    extractPdfImageResourceWithRuntime("fixture", image, runtime),
  ]);
  assert.ok(!("status" in node));
  assert.ok(!("status" in web));
  assert.equal(web.contentHash, node.contentHash);
  assert.deepEqual(web.bytes, node.bytes);
});
