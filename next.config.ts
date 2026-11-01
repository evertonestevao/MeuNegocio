import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Só os links de arquivo, que já exigem token assinado ou bucket público. Ver STORAGE_PUBLIC_ORIGIN.
  async rewrites() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return [];
    return ["sign", "public"].map((kind) => ({
      source: `/storage/v1/object/${kind}/:path*`,
      destination: `${supabaseUrl}/storage/v1/object/${kind}/:path*`,
    }));
  },
};

export default nextConfig;
