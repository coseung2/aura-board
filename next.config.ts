import type { NextConfig } from "next";

// CSP frame-src allowlist for the live embeds we render inside cards.
// We only set frame-src here — other directives are left at their browser
// defaults so NextAuth flows, next/image, and external thumbnail hosts
// keep working exactly as before.
const FRAME_SRC_ALLOWLIST = [
  "'self'",
  "https://www.googletagmanager.com",
  "https://www.canva.com",
  "https://www.youtube.com",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "egestive-sharron-farrandly.ngrok-free.dev"],
  images: {
    // Thumbnails we optimize via next/image. All other external hosts
    // must flow through /api/canva/thumbnail (proxy) or be proxied
    // through our own origin.
    remotePatterns: [
      { protocol: "https", hostname: "www.canva.com", pathname: "/**" },
      { protocol: "https", hostname: "canva.com", pathname: "/**" },
      { protocol: "https", hostname: "document-export.canva.com", pathname: "/**" },
      { protocol: "https", hostname: "**.canva.com", pathname: "/**" },
      { protocol: "https", hostname: "**.canva-web-files.com", pathname: "/**" },
      // YouTube thumbnails (used for video preview posters)
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/**" },
      { protocol: "https", hostname: "img.youtube.com", pathname: "/**" },
      // YouTube channel / user avatars served from Google User Content.
      // Channels resolve their og:image to yt3.googleusercontent.com
      // (900x900 etc.), so without this pattern every channel link
      // preview fails next/image's optimizer fetch and falls back to
      // the "이미지를 불러올 수 없어요" placeholder.
      { protocol: "https", hostname: "yt3.googleusercontent.com", pathname: "/**" },
      // External generated thumbnails used by saved link previews.
      { protocol: "https", hostname: "**.cloudfront.net", pathname: "/**" },
      // Supabase Storage — Aura-board uploaded assets after the Blob quota fix.
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
    // Device size variants used to build the srcset for responsive images.
    // Galaxy Tab S6 Lite viewport (1500×2000 CSS, DPR 2) is covered by
    // 640/750/828/1080 widths.
    deviceSizes: [360, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 64, 96, 160, 320, 480, 640],
    formats: ["image/webp"],
  },
  async redirects() {
    return [
      {
        source: "/privacy.html",
        destination: "/privacy",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-src ${FRAME_SRC_ALLOWLIST.join(" ")}`,
          },
        ],
      },
      // CORS for Canva Apps SDK origin. We need credentialed requests so the
      // Aura student_session cookie rides along and the server can attribute
      // the card to the logged-in student. Credentials require a concrete
      // origin — wildcard origin + credentials is rejected by browsers.
      // Canva hosts each app on a unique subdomain of canva-apps.com, so we
      // match the two origins that matter for this app specifically.
      {
        source: "/api/external/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "https://app-aahaamw43f4.canva-apps.com",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Authorization, Content-Type",
          },
          { key: "Access-Control-Max-Age", value: "86400" },
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
