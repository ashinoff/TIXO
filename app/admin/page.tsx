"use client";
/* eslint-disable @next/next/no-img-element -- admin previews use local data URLs */

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import "./admin.css";

type AdminProduct = {
  id: number;
  name: string;
  category: string;
  notes: string;
  price: number;
  stock: number;
  published: boolean;
  image: string | null;
};

const emptyProduct: AdminProduct = { id: 0, name: "", category: "", notes: "", price: 0, stock: 0, published: false, image:null };
const formatPrice = (price: number) => `${price.toLocaleString("ru-RU")} ₽`;

export default function AdminPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loadProducts = async () => {
    const response = await fetch("/api/products", { cache:"no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить каталог");
    setProducts(await response.json());
  };

  useEffect(() => {
    fetch("/api/admin/session").then((r) => r.json()).then(async ({ authenticated:ok }) => { setAuthenticated(ok); if (ok) await loadProducts(); }).catch(() => setAuthenticated(false));
  }, []);

  const visibleProducts = useMemo(() => products.filter((product) =>
    `${product.name} ${product.category} ${product.notes}`.toLowerCase().includes(query.toLowerCase()),
  ), [products, query]);

  const notifySaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setError("");
    const form = new FormData();
    for (const key of ["name","category","notes","price","stock"] as const) form.set(key, String(editing[key]));
    form.set("published", String(editing.published)); if (imageFile) form.set("image", imageFile);
    const response = await fetch(editing.id ? `/api/products/${editing.id}` : "/api/products", { method:editing.id ? "PATCH" : "POST", body:form });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Не удалось сохранить товар"); return; }
    await loadProducts(); setEditing(null); setImageFile(null); notifySaved();
  };

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editing) return; setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setEditing({ ...editing, image: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const login = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const response = await fetch("/api/admin/login", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ password }) });
    const data = await response.json(); if (!response.ok) { setError(data.error || "Не удалось войти"); return; }
    setAuthenticated(true); setPassword(""); await loadProducts();
  };

  const togglePublished = async (product:AdminProduct) => {
    const form = new FormData();
    for (const key of ["name","category","notes","price","stock"] as const) form.set(key, String(product[key]));
    form.set("published", String(!product.published));
    const response = await fetch(`/api/products/${product.id}`, { method:"PATCH", body:form });
    if (response.ok) { await loadProducts(); notifySaved(); }
  };

  if (authenticated === null) return <main className="admin-login"><div className="login-card"><span className="admin-logo">ТИХО●</span><p>Загрузка админки…</p></div></main>;
  if (!authenticated) return <main className="admin-login"><form className="login-card" onSubmit={login}><Link className="admin-logo" href="/">ТИХО<span>●</span></Link><span className="admin-kicker">Закрытая зона</span><h1>Вход в админку</h1><p>Введите пароль, установленный в секретах приложения Amvera.</p><label>Пароль<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} autoFocus required /></label>{error && <div className="editor-error">{error}</div>}<button className="save" type="submit">Войти</button></form></main>;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-logo" href="/">ТИХО<span>●</span></Link>
        <nav>
          <a className="active" href="#products"><span>◫</span> Товары</a>
          <a href="#orders"><span>♡</span> Заказы <i>скоро</i></a>
          <a href="#content"><span>✦</span> Контент <i>скоро</i></a>
          <a href="#settings"><span>⚙</span> Настройки</a>
        </nav>
        <div className="admin-owner"><span>НА</span><div><strong>Владелец</strong><small>Администратор</small></div></div>
      </aside>

      <section className="admin-workspace" id="products">
        <header className="admin-header">
          <div><span className="admin-kicker">Управление магазином</span><h1>Товары</h1></div>
          <div className="admin-actions"><Link href="/" target="_blank">Открыть сайт ↗</Link><button onClick={() => setEditing({ ...emptyProduct })}>＋ Добавить товар</button></div>
        </header>

        <div className="admin-status admin-status-ready">
          <div><span className="status-dot" /><p><strong>Серверное хранение</strong> Товары записываются в PostgreSQL, фотографии — на постоянный диск Amvera.</p></div>
          <span className="status-tag">Готово для Amvera</span>
        </div>

        <div className="admin-stats">
          <article><span>Всего товаров</span><strong>{products.length}</strong><small>{products.filter((p) => p.published).length} опубликовано</small></article>
          <article><span>В наличии</span><strong>{products.filter((p) => p.stock > 0).length}</strong><small>{products.reduce((sum, p) => sum + p.stock, 0)} свечей</small></article>
          <article><span>Нет в наличии</span><strong>{products.filter((p) => p.stock === 0).length}</strong><small>нужно пополнить</small></article>
        </div>

        <div className="admin-table-card">
          <div className="table-toolbar"><label>⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по каталогу" /></label><span>{visibleProducts.length} позиций</span></div>
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>Товар</th><th>Цена</th><th>Остаток</th><th>Статус</th><th /></tr></thead>
              <tbody>{visibleProducts.map((product) => (
                <tr key={product.id}>
                  <td><div className="product-cell"><div className="product-preview">{product.image ? <img src={product.image} alt="" /> : <span>♢</span>}</div><div><strong>{product.name}</strong><small>{product.category}</small></div></div></td>
                  <td><strong>{formatPrice(product.price)}</strong></td>
                  <td><span className={product.stock === 0 ? "stock-empty" : ""}>{product.stock} шт.</span></td>
                  <td><button className={product.published ? "publish on" : "publish"} onClick={() => togglePublished(product)}><i />{product.published ? "На сайте" : "Черновик"}</button></td>
                  <td><button className="edit-button" onClick={() => setEditing({ ...product })} aria-label={`Редактировать ${product.name}`}>•••</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>

        <section className="amvera-plan" id="settings">
          <div><span className="admin-kicker">Архитектура</span><h2>Готово для Amvera</h2><p>Один контейнер обслуживает сайт, защищённую админку и API. PostgreSQL хранит каталог, постоянный диск — оригиналы фотографий.</p></div>
          <ol><li><span>1</span>GitHub-репозиторий</li><li><span>2</span>Приложение Amvera</li><li><span>3</span>База и хранилище</li><li><span>4</span>Домен и HTTPS</li></ol>
        </section>
      </section>

      {editing && <div className="editor-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
        <form className="product-editor" onSubmit={saveProduct}>
          <header><div><span className="admin-kicker">Карточка товара</span><h2>{editing.id ? "Редактировать" : "Новый товар"}</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></header>
          <label className="image-upload">
            {editing.image ? <img src={editing.image} alt="Предпросмотр товара" /> : <><span>＋</span><strong>Добавить фотографию</strong><small>JPG, PNG или WebP</small></>}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImage} />
          </label>
          <label>Название<input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Например, Лимонный вечер" /></label>
          <label>Категория<input required value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="Цитрусовый · свежий" /></label>
          <label>Ноты аромата<textarea required value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="лимон · бергамот · белый чай" /></label>
          <div className="editor-row"><label>Цена, ₽<input type="number" min="0" required value={editing.price || ""} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} /></label><label>Остаток<input type="number" min="0" required value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} /></label></div>
          <label className="publish-check"><input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} /><span><strong>Опубликовать на сайте</strong><small>Товар станет виден покупателям</small></span></label>
          {error && <div className="editor-error">{error}</div>}
          <footer><button type="button" className="cancel" onClick={() => setEditing(null)}>Отмена</button><button type="submit" className="save">Сохранить товар</button></footer>
        </form>
      </div>}

      <div className={saved ? "admin-toast show" : "admin-toast"}>Черновик сохранён ✓</div>
    </main>
  );
}
