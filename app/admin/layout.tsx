import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Мастерская ТИХО — управление", robots: { index: false, follow: false }, alternates: { canonical: null } };
export default function AdminLayout({ children }: { children: ReactNode }) { return children; }
