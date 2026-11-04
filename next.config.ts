import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "vjmjhaidlqkmascdjocw.supabase.co", pathname: "/storage/v1/object/public/course-assets/**" },
      { protocol: "https", hostname: "qitqxizuwmmlhlcgsrqe.supabase.co", pathname: "/storage/v1/object/public/course-assets/**" },
    ],
  },
  async headers() {
    return [{ source: "/edu-push-sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }, {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      ],
    }, {
      // The local 3D world is embedded only by the authenticated campus host.
      // Payment and account pages remain unframeable.
      source: "/campus/world/:path*",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
      ],
    }, {
      // Public course information can be read inside this site’s campus dialog.
      source: "/classes/:slug",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
      ],
    }];
  },
};

export default nextConfig;
