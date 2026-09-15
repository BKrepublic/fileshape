const ADSENSE_CLIENT_PATTERN = /^ca-pub-\d{16}$/;

function randomNonce() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function strictCsp(nonce) {
  return [
    "object-src 'none'",
    `script-src 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' 'strict-dynamic' https: http:`,
    "base-uri 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
    "frame-src https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
  ].join("; ");
}

function shouldLoadAds(pathname) {
  return pathname === "/" || pathname.startsWith("/guide/");
}

function configuredAdsenseClient(env) {
  const primary = String(env.ADSENSE_ACCOUNT ?? "").trim();
  const legacy = String(env.ADSENSE_CLIENT_ID ?? "").trim();
  const configured = primary || legacy;
  return ADSENSE_CLIENT_PATTERN.test(configured) ? configured : "";
}

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const nonce = randomNonce();
  const url = new URL(context.request.url);
  const adsenseClient = configuredAdsenseClient(context.env);

  let rewriter = new HTMLRewriter()
    .on('meta[http-equiv="Content-Security-Policy"]', {
      element(element) {
        // The production response header below supersedes static development CSP.
        element.remove();
      },
    })
    .on("script", {
      element(element) {
        element.setAttribute("nonce", nonce);
      },
    });

  if (adsenseClient && shouldLoadAds(url.pathname)) {
    rewriter = rewriter.on("head", {
      element(element) {
        const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClient)}`;
        element.append(
          `<meta name="google-adsense-account" content="${adsenseClient}"><script nonce="${nonce}" async src="${src}" crossorigin="anonymous"></script>`,
          { html: true },
        );
      },
    });
  }

  const transformed = rewriter.transform(response);
  const headers = new Headers(transformed.headers);
  headers.set("Content-Security-Policy", strictCsp(nonce));
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  return new Response(transformed.body, {
    status: transformed.status,
    statusText: transformed.statusText,
    headers,
  });
}
