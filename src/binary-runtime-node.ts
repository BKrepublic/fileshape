import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { BinaryRuntime } from "./binary-runtime.js";

export const nodeBinaryRuntime: BinaryRuntime = Object.freeze({
  sha256Hex(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
  },
  deflateZlib(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(deflateSync(bytes));
  },
});
