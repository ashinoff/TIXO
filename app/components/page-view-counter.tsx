"use client";
import { useEffect } from "react";
import { isSitePage, type SitePage } from "../../lib/site-stats";

/** One anonymous increment per page mount; never read browser storage or send cookies/referrer. */
export function PageViewCounter({ path }: { path: SitePage }) {
  useEffect(() => {
    if (!isSitePage(path)) return;
    // A cancelled mount (including React StrictMode's probe) must not count a view.
    const timer = window.setTimeout(() => {
      void fetch("/api/stats/pageview", {
        method: "POST", mode: "same-origin", credentials: "omit", referrerPolicy: "no-referrer",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ path }), keepalive: true,
      }).catch(() => {}); // No retries: a lost response must not double-count the view.
    }, 0);
    return () => window.clearTimeout(timer);
  }, [path]);
  return null;
}
