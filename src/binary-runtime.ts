export type BinaryRuntime = {
  /** Return a lowercase 64-character SHA-256 digest. */
  sha256Hex(bytes: Uint8Array): string | Promise<string>;
  /** Return an RFC 1950 zlib stream containing DEFLATE-compressed bytes. */
  deflateZlib(bytes: Uint8Array): Uint8Array | Promise<Uint8Array>;
};

export function assertSha256Hex(value: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("binary runtime returned an invalid SHA-256 digest");
  }
  return value;
}
