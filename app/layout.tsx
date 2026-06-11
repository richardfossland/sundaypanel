import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Sora } from "next/font/google";
import "./globals.css";

const display = Sora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});
const body = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SundayPanel — anonyme spørsmål på storskjerm",
  description:
    "Ungdommene sender inn anonyme spørsmål fra mobilen, panelet velger hva som vises på storskjermen.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="no" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
