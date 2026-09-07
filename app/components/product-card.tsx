"use client";
/* eslint-disable @next/next/no-img-element */
import { CSSProperties, useState } from "react";
import { money, productShape, selectVariant, type Product, type Scent, type Variant } from "@/lib/catalog";
import { CandlePreview } from "./candle-preview";
import { Modal } from "./modal";

export function ProductCard({ product, index, scent, favorite, onFavorite, onAdd }: {
  product: Product; index: number; scent?: Scent; favorite: boolean;
  onFavorite: () => void; onAdd: (variant?: Variant) => void;
}) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const variant = selectVariant(product, scent?.id);
  const stock = !scent ? 0 : product.hasVariants ? variant?.stock ?? 0 : product.stock;
  const photo = variant?.image ?? product.image;
  return <article className="product-card" data-product-id={product.id} data-scent-id={scent?.id} style={{ "--candle-color": scent?.color ?? "#f7f5ef", "--card-delay": `${Math.min(index, 5) * 60}ms` } as CSSProperties}>
    <div className="product-art">
      <CandlePreview shape={productShape(product)} color={scent?.color} label={`${product.name} — предпросмотр, ${scent?.colorName ?? "цвет свечи"}`} />
      <span className="art-number">{String(index + 1).padStart(2, "0")}</span>
      <button className={favorite ? "favorite favorite-active" : "favorite"} onClick={onFavorite} aria-label={`${favorite ? "Убрать" : "Добавить"} ${product.name} ${favorite ? "из избранного" : "в избранное"}`} aria-pressed={favorite}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill={favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>
      </button>
      {scent && <span className="photo-color"><i style={{ background: scent.color }} />{scent.colorName}</span>}
      {photo && <button className="form-photo-button" onClick={() => setPhotoOpen(true)}>Фото формы ↗</button>}
    </div>
    <div className="product-info">
      <div className="product-topline"><h3>{product.name}</h3><strong>{money(product.price)}</strong></div>
      <p className="chosen-scent"><i style={{ background: scent?.color }} />{scent?.name ?? "Ароматы скоро появятся"}</p>
      {product.notes && <details className="form-details"><summary>О форме</summary><p>{product.notes}</p></details>}
      <button className="add-button" disabled={stock === 0} onClick={() => onAdd(variant)}>{stock > 0 ? "В корзину" : "Нет в наличии"}<span aria-hidden="true">{stock > 0 ? "+" : "—"}</span></button>
    </div>
    {photoOpen && photo && <Modal className="form-photo-modal" label={`Фото формы ${product.name}`} onClose={() => setPhotoOpen(false)}><button className="form-photo-close" onClick={() => setPhotoOpen(false)} aria-label="Закрыть фото">×</button><img src={photo} alt={product.name} /><h3>{product.name}</h3>{product.notes && <p>{product.notes}</p>}<p>Фотография формы. Выбранный цвет — {scent?.colorName.toLowerCase()}.</p></Modal>}
  </article>;
}
