import type { NextConfig } from "next";

const productionHost = "straftatpresets\\.com";

export function securityConfig(isDevelopment: boolean): Pick<NextConfig, "headers"> {
  // Keep static rendering and Next's inline hydration scripts. This is a
  // containment policy, not a strict nonce-based defense against inline XSS.
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    // NextAuth's sign-in form may redirect to the Discord OAuth provider.
    "form-action 'self' https://discord.com",
    "frame-ancestors 'none'",
  ].join("; ");

  return {
    async headers() {
      return [
        { source: "/(.*)", headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
          { key: "Content-Security-Policy", value: policy },
        ] },
        {
          source: "/(.*)",
          has: [{ type: "host", value: productionHost }],
          headers: [
            // Host-only: do not opt unaudited subdomains into HSTS or preload.
            { key: "Strict-Transport-Security", value: "max-age=31536000" },
            { key: "Content-Security-Policy", value: `${policy}; upgrade-insecure-requests` },
          ],
        },
        { source: "/weapons/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=7776000, immutable" }] },
      ];
    },
  };
}
