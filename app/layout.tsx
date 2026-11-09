import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bravo IA",
  description: "App creada por dropshippers, para dropshippers",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Bravo IA", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#111111", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
