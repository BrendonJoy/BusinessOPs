import type { NextConfig } from "next";

// Content-Security-Policy is NOT here — it carries a per-request nonce and is
// set in `src/proxy.ts`. Everything below is static and safe to serve from the
// edge on every response, including static assets the proxy skips.
const SECURITY_HEADERS = [
  // Two years, matching the usual guidance. Deliberately WITHOUT `preload`:
  // preloading commits the whole joytech.nz tree to HTTPS in browsers shipped
  // months from now, and removal takes just as long. That is a poor trade while
  // the apex is still an unbuilt landing page and more subdomains are planned.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },

  { key: "X-Content-Type-Options", value: "nosniff" },

  // Superseded by CSP's frame-ancestors (which is also set) but kept for
  // browsers and scanners that still look for it.
  { key: "X-Frame-Options", value: "DENY" },

  // Send the full URL within our own origin, but only the origin when leaving
  // it — so a public quote token never appears in a third party's referer log.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // All three of these ARE used by the app and must stay enabled for our own
  // origin: geolocation for clock-in geofencing and address lookup, microphone
  // for speech dictation in the assistant, camera for job photo capture. The
  // common copy-pasted value disables all three and would silently break them.
  // browsing-topics is opted out of outright — we have no use for it and it is
  // an interest-profiling signal we do not want leaking from a work tool.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(self), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: SECURITY_HEADERS },
      {
        // Belt and braces with robots.txt. If a crawler honours robots.txt it
        // never fetches these; if it ignores robots.txt — which is exactly when
        // this matters — it still gets an explicit noindex it does honour.
        source: "/q/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  transpilePackages: ["@trade-assist/db"],
  // Testing on a real phone means loading the dev server over the LAN IP rather
  // than localhost. Next blocks cross-origin requests to /_next/* dev assets by
  // default, which lets the server-rendered HTML through but stops React from
  // hydrating — the page looks right and every button is dead. Dev-only; has no
  // effect on the production build.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
