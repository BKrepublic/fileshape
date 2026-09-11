import { fileURLToPath } from "node:url";

// Official release asset and digest from the W3C GitHub release API.
export const EPUBCHECK_VERSION = "5.3.0";
export const EPUBCHECK_SHA256 = "6c07e68584b2e2ce2f89fe06e1246dfead3eb36b46b340e7d93524f29dcff6c5";
export const EPUBCHECK_URL = `https://github.com/w3c/epubcheck/releases/download/v${EPUBCHECK_VERSION}/epubcheck-${EPUBCHECK_VERSION}.zip`;
export const EPUBCHECK_CACHE = fileURLToPath(new URL("../.cache/epubcheck/", import.meta.url));
export const DEFAULT_EPUBCHECK_JAR = fileURLToPath(
  new URL(`../.cache/epubcheck/epubcheck-${EPUBCHECK_VERSION}/epubcheck.jar`, import.meta.url),
);
