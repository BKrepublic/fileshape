import type { BinaryRuntime } from "./binary-runtime.js";

function hex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength === 0) continue;
      const copy = Uint8Array.from(value);
      chunks.push(copy);
      length += copy.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export const webBinaryRuntime: BinaryRuntime = Object.freeze({
  async sha256Hex(bytes: Uint8Array): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable");
    const source = Uint8Array.from(bytes);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", source.buffer);
    return hex(new Uint8Array(digest));
  },

  async deflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
    if (typeof globalThis.CompressionStream !== "function") {
      throw new Error("CompressionStream deflate is unavailable");
    }
    const compression = new CompressionStream("deflate");
    const output = readAll(compression.readable);
    const writer = compression.writable.getWriter();
    try {
      await writer.write(Uint8Array.from(bytes));
      await writer.close();
    } catch (error) {
      await writer.abort(error).catch(() => undefined);
      throw error;
    } finally {
      writer.releaseLock();
    }
    return output;
  },
});
