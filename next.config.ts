import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Não anunciar o framework/versão (facilita varredura por CVE conhecida).
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Sempre a versão atual, para o aplicativo instalado receber correções.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // O link de aprovação do orçamento leva o token na URL: não pode vazar para outros sites.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
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
