"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "./catalog";
import { absoluteImage, productDescription, productPath, productTitle, SITE_URL } from "./seo";

type Candle = { productId: number; scentId?: number; colorId?: number };
type Selection = Candle & { catalog: Candle[] };
type Entry = { selection: Selection; returnUrl: string };

/** Keep the existing filtered modal and scroll position while giving it a shareable URL. */
export function useProductNavigation(products: Product[]) {
  const [detail, setDetail] = useState<Selection | null>(null);
  const current = useRef<Selection | null>(null);
  const returnUrl = useRef("/");
  const select = useCallback((selection: Selection | null) => { current.current = selection; setDetail(selection); }, []);

  const openProduct = (productId: number, scentId?: number, colorId?: number, catalog: Candle[] = []) => {
    const product = products.find(item => item.id === productId);
    if (!product) return;
    const selection = { productId, scentId, colorId, catalog };
    const alreadyOpen = Boolean(current.current);
    if (!alreadyOpen) returnUrl.current = window.location.pathname + window.location.search + window.location.hash;
    const entry: Entry = { selection, returnUrl: returnUrl.current };
    window.history[alreadyOpen ? "replaceState" : "pushState"]({ ...window.history.state, tihoProduct: entry }, "", productPath(product));
    select(selection);
  };
  const closeProduct = () => {
    if (!current.current) return;
    select(null);
    if (window.history.state?.tihoProduct) window.history.back();
  };
  const moveProduct = (offset: number) => {
    const selection = current.current;
    if (!selection) return;
    const index = selection.catalog.findIndex(item => item.productId === selection.productId && item.colorId === selection.colorId && item.scentId === selection.scentId);
    const next = selection.catalog[index + offset];
    if (next) openProduct(next.productId, next.scentId, next.colorId, selection.catalog);
  };

  useEffect(() => {
    const restore = () => {
      const entry = window.history.state?.tihoProduct as Entry | undefined;
      const product = entry && products.find(item => item.id === entry.selection?.productId);
      if (entry && product && window.location.pathname === productPath(product)) {
        returnUrl.current = entry.returnUrl;
        select(entry.selection);
      } else select(null);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [products, select]);

  const product = products.find(item => item.id === detail?.productId);
  useEffect(() => {
    if (!product) return;
    const previousTitle = document.title;
    const title = `${productTitle(product)} — свеча ТИХО`;
    const description = productDescription(product).slice(0, 200);
    document.title = title;
    const saved: { node: Element; attribute: string; value: string | null; created: boolean }[] = [];
    const update = (selector: string, attribute: string, value: string, tag: string, key: string, keyValue: string) => {
      let node = document.head.querySelector(selector);
      const created = !node;
      if (!node) { node = document.createElement(tag); node.setAttribute(key, keyValue); document.head.append(node); }
      saved.push({ node, attribute, value: node.getAttribute(attribute), created });
      node.setAttribute(attribute, value);
    };
    update('link[rel="canonical"]', "href", `${SITE_URL}${productPath(product)}`, "link", "rel", "canonical");
    update('meta[name="description"]', "content", description, "meta", "name", "description");
    for (const [name, value] of Object.entries({ "og:title": title, "og:description": description, "og:url": `${SITE_URL}${productPath(product)}`, "og:image": absoluteImage(product.image) })) {
      update(`meta[property="${name}"]`, "content", value, "meta", "property", name);
    }
    return () => {
      document.title = previousTitle;
      for (const { node, attribute, value, created } of saved) {
        if (created) node.remove(); else if (value === null) node.removeAttribute(attribute); else node.setAttribute(attribute, value);
      }
    };
  }, [product]);
  return { detail, openProduct, closeProduct, moveProduct };
}
