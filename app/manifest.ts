import type { MetadataRoute } from "next";

// Permite "Agregar a pantalla de inicio" en el iPhone para usarla como app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bravo IA",
    short_name: "Bravo IA",
    description: "App creada por dropshippers, para dropshippers",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0e11",
    theme_color: "#0b0e11",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
