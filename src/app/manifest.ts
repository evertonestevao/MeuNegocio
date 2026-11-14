import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";

// Os ícones têm nome fixo e o Chrome guarda os do manifest num cache próprio (o prompt de
// instalação nativo). Ao trocar a logo, suba esta versão para o navegador reler e buscar o
// ícone atual. Mantenha igual ao ?v= usado no banner (install-banner.tsx).
const ICON_V = "?v=2";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: brand.name,
    short_name: brand.name,
    description: brand.tagline,
    lang: "pt-BR",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#17222f",
    theme_color: "#17222f",
    categories: ["business", "productivity"],
    icons: [
      { src: `/icons/icon-192.png${ICON_V}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/icons/icon-512.png${ICON_V}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/icons/icon-maskable-512.png${ICON_V}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Agenda", url: "/dashboard/schedule", icons: [{ src: `/icons/icon-192.png${ICON_V}`, sizes: "192x192" }] },
      { name: "Novo orçamento", url: "/dashboard/quotes/new", icons: [{ src: `/icons/icon-192.png${ICON_V}`, sizes: "192x192" }] },
    ],
  };
}
