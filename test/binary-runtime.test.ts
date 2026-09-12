import assert from "node:assert/strict";
import test from "node:test";
import { sha256HexSync } from "../src/binary-runtime.js";
import { nodeBinaryRuntime } from "../src/binary-runtime-node.js";
import { webBinaryRuntime } from "../src/binary-runtime-web.js";
import { extractPdfImageResourceWithRuntime } from "../src/pdf-image-resource-core.js";

function bytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 31 + 17) & 0xff);
}

test("sync and web SHA-256 match the accepted Node provider", async () => {
  for (const source of [new Uint8Array(), new TextEncoder().encode("abc"), bytes(65_537)]) {
    const node = await nodeBinaryRuntime.sha256Hex(source);
    assert.equal(sha256HexSync(source), node);
    assert.equal(await webBinaryRuntime.sha256Hex(source), node);
  }
});

test("web CompressionStream deflate matches Node zlib bytes", async () => {
  for (const source of [new Uint8Array(), Uint8Array.from([0]), bytes(257), bytes(65_537)]) {
    const node = await nodeBinaryRuntime.deflateZlib(source);
    const web = await webBinaryRuntime.deflateZlib(source);
    assert.deepEqual(web, node);
  }
});

test("runtime-neutral image core preserves Node PNG identity under the web provider", async () => {
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
    extractPdfImageResourceWithRuntime("fixture", image, webBinaryRuntime),
  ]);
  assert.ok(!("status" in node));
  assert.ok(!("status" in web));
  assert.equal(web.contentHash, node.contentHash);
  assert.deepEqual(web.bytes, node.bytes);
});
