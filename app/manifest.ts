import type { MetadataRoute } from "next";

// Permite "Agregar a pantalla de inicio" en el iPhone para usarla como app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bravo IA",
    short_name: "Bravo IA",
    description: "App creada por dropshippers, para dropshippers",
    start_url: "/",
    display: "standalone",
    background_color: "#111111",
    theme_color: "#111111",
    lang: "es",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
