import type { Metadata } from "next";
import "@fontsource-variable/raleway/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ТИХО — пусть мир подождёт",
  description: "ТИХО — скульптурные свечи и авторские ароматы, созданные вручную.",
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
