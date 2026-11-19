import type { Metadata } from "next";
import "@fontsource-variable/raleway/wght.css";
import "./globals.css";
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION, SITE_IMAGE } from "../lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: { type: "website", locale: "ru_RU", siteName: "ТИХО", title: SITE_TITLE, description: SITE_DESCRIPTION, images: [{ url: SITE_IMAGE, alt: "Свечи ручной работы ТИХО" }] },
  twitter: { card: "summary_large_image", images: [SITE_IMAGE] },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
