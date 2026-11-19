"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- full navigation restores the storefront section and its document metadata */
import type { Product, StorefrontData } from "../../lib/catalog";
import { productPath, productTitle } from "../../lib/seo";
import { ShoppingProvider, ProductDetailContent, CartOverlay, CartTrigger, useShopping } from "./storefront-commerce";
import { PageViewCounter } from "./page-view-counter";

export function ProductPage({ product, data }: { product: Product; data: StorefrontData }) {
  const index = data.products.findIndex(item => item.id === product.id);
  const previous = data.products[index - 1];
  const next = data.products[index + 1];
  return <ShoppingProvider initialData={data}><div className="tiho-site product-page">
    <PageViewCounter path="/" />
    <header className="product-page-header"><a className="wordmark" href="/" aria-label="ТИХО — на главную">тихо</a><a href="/#collection">Коллекция</a><CartTrigger /></header>
    <main className="product-page-main">
      <article className="product-dialog product-page-card" aria-label={productTitle(product)}>
        <div className="detail-toolbar"><a href="/#collection" className="icon-button detail-close" aria-label="Вернуться к коллекции">×</a></div>
        <LiveProductContent productId={product.id} />
      </article>
      <nav className="product-page-navigation" aria-label="Другие свечи">{previous ? <a href={productPath(previous)}>Предыдущая свеча</a> : <span />}{next && <a href={productPath(next)}>Следующая свеча</a>}</nav>
    </main>
    <footer className="product-page-footer"><a href="/privacy">Политика обработки данных</a><a href="/consent">Согласие для заказа</a></footer>
    <CartOverlay />
  </div></ShoppingProvider>;
}

function LiveProductContent({ productId }: { productId: number }) {
  const shop = useShopping();
  const product = shop.products.find(item => item.id === productId);
  if (!product) return <div className="detail-content"><h1>Свеча больше недоступна</h1><a href="/#collection">Вернуться к коллекции</a></div>;
  return <ProductDetailContent product={product} standalone />;
}
