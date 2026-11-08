import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  experimental: {
    // HU-06: el logo sube por un Server Action. El límite de la app es 2 MB
    // (lib/marca.ts y el bucket); 3 MB deja margen para el resto del formulario
    // y permite responder "pesa más de 2 MB" en lugar de un error genérico.
    serverActions: { bodySizeLimit: "3mb" },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
