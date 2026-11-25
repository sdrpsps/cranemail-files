import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ["/upload/:path*", "/s/:path*"].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));
  },
  images: { unoptimized: true },
};

export default nextConfig;

if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then(async ({ initOpenNextCloudflareForDev, getCloudflareContext }) => {
    await initOpenNextCloudflareForDev();
    try {
      const { env } = getCloudflareContext();
      for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
        if (typeof value === "string") {
          process.env[key] = value;
        }
      }
    } catch {
      // Next.js loads next.config.ts in a second process where initOpenNextCloudflareForDev is a no-op.
    }
  });
}
