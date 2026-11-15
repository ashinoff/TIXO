export const sitePageNames = { "/": "Витрина", "/privacy": "Политика обработки данных", "/consent": "Согласие для заказа" } as const;
export type SitePage = keyof typeof sitePageNames;
export type SiteStats = {
  days: number; from: string; to: string;
  summary: { today: number; week: number; month: number; total: number };
  daily: { date: string; views: number }[];
  pages: { path: SitePage; views: number }[];
};
export const isSitePage = (value: unknown): value is SitePage => typeof value === "string" && Object.hasOwn(sitePageNames, value);
