"use client";
/* eslint-disable @next/next/no-img-element */
import { CSSProperties, useEffect, useState } from "react";
import { availableVariants, money, selectVariant, type Product, type Variant } from "@/lib/catalog";

export function ProductCard({ product, index, scentId, favorite, onSelect, onFavorite, onAdd }: {
  product: Product; index: number; scentId?: number | null; favorite: boolean;
  onSelect: (scentId: number) => void; onFavorite: () => void; onAdd: (variant?: Variant) => void;
}) {
  const variants = availableVariants(product);
  const variant = selectVariant(product, scentId);
  const stock = product.hasVariants ? variant?.stock ?? 0 : product.stock;
  const image = variant?.image ?? product.image;
  return <article className="product-card" style={{ "--candle-color": variant?.scent.color ?? "#ded5c6", "--card-delay": `${Math.min(index, 5) * 60}ms` } as CSSProperties}>
    <div className="product-art">
      {image ? <VariantPhoto src={image} alt={`${product.name}${variant ? ` — ${variant.scent.colorName}, ${variant.scent.name}` : ""}`} /> : <div className="photo-unavailable"><span>ТИХО</span><small>Фото скоро появится</small></div>}
      <span className="art-number">{String(index + 1).padStart(2, "0")}</span>
      <button className={favorite ? "favorite favorite-active" : "favorite"} onClick={onFavorite} aria-label={`${favorite ? "Убрать" : "Добавить"} ${product.name} ${favorite ? "из избранного" : "в избранное"}`} aria-pressed={favorite}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill={favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>
      </button>
      {variant && <span className="photo-color"><i style={{ background: variant.scent.color }} />{variant.scent.colorName}</span>}
    </div>
    <div className="product-info">
      <div className="product-topline"><h3>{product.name}</h3><strong>{money(product.price)}</strong></div>
      {variants.length > 0 ? <>
        <div className="variant-heading" aria-live="polite"><span>Аромат</span><strong>{variant?.scent.name}</strong></div>
        <div className="variant-swatches" role="group" aria-label={`Аромат свечи ${product.name}`}>
          {variants.map(v => <button key={v.id} type="button" className={`variant-swatch${variant?.id === v.id ? " selected" : ""}${v.stock === 0 ? " sold-out" : ""}`} style={{ "--swatch": v.scent.color } as CSSProperties} onClick={() => onSelect(v.scentId)} aria-pressed={variant?.id === v.id} aria-label={`${v.scent.name}, ${v.scent.colorName}${v.stock === 0 ? ", нет в наличии" : ""}`} title={`${v.scent.name} · ${v.scent.colorName}${v.stock === 0 ? " · нет в наличии" : ""}`}><i /></button>)}
        </div>
        <p className="product-notes" key={variant?.id}>{variant?.scent.notes.join(" · ") || variant?.scent.description}</p>
        {product.notes && <p className="product-details">{product.notes}</p>}
      </> : <p className="product-notes">{product.notes}</p>}
      <button className="add-button" disabled={stock === 0} onClick={() => onAdd(variant)}>{stock > 0 ? "В корзину" : "Нет в наличии"}<span aria-hidden="true">{stock > 0 ? "+" : "—"}</span></button>
    </div>
  </article>;
}

function VariantPhoto({ src, alt }: { src: string; alt: string }) {
  const [layers, setLayers] = useState({ current: src, previous: "" });
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (src === layers.current) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => { if (!cancelled) { setLayers(current => ({ current: src, previous: current.current })); setFailed(null); } };
    image.onerror = () => { if (!cancelled) setFailed(src); };
    image.src = src;
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [src, layers.current]);
  if (failed === src) return <div className="photo-unavailable"><span>ТИХО</span><small>Не удалось загрузить фото</small></div>;
  return <div className="photo-layers" aria-busy={src !== layers.current}>
    {layers.previous && <img className="product-photo previous-photo" src={layers.previous} alt="" aria-hidden="true" />}
    <img key={layers.current} className="product-photo" src={layers.current} alt={alt} loading="lazy" onError={() => setFailed(layers.current)} />
    {src !== layers.current && <span className="photo-loading" role="status">Меняем оттенок…</span>}
  </div>;
}
