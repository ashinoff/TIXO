"use client";

import { useSyncExternalStore } from "react";

const query = "(max-width: 760px)";
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;

/** Shared breakpoint for DOM order, section numbers and navigation. */
export function useMobileLayout() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
