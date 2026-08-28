"use client";
/* eslint-disable @next/next/no-img-element -- production images are pre-compressed WebP assets */

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";

type Product = {
  id: number;
  name: string;
  family: string;
  notes: string;
  price: number;
  art: string;
  badge?: string;
  image?: string | null;
  categorySlug?: string | null;
};
type Category={id:number;name:string;slug:string;mood:string;description:string;notes:string[];paper:string;ink:string;accent:string;soft:string};
type SiteContent = Record<string, { value:string; kind:string }>;

const defaultProducts: Product[] = [
  { id: 1, name: "Ещё пять минут", family: "тёплый · древесный", notes: "ваниль · сандал · бобы тонка", price: 2490, art: "twist", badge: "хит" },
  { id: 2, name: "Тёплый хлеб", family: "гурманский · мягкий", notes: "бриошь · кедр · морская соль", price: 2290, art: "ribbed" },
  { id: 3, name: "После дождя", family: "свежий · зелёный", notes: "ветивер · мох · мокрый камень", price: 2590, art: "bubble", badge: "new" },
  { id: 4, name: "Яблоко & дым", family: "пряный · дымный", notes: "печёное яблоко · кожа · камин", price: 2390, art: "arch" },
  { id: 5, name: "Белые простыни", family: "чистый · воздушный", notes: "хлопок · нероли · белый чай", price: 2190, art: "shell" },
  { id: 6, name: "Без спешки", family: "зелёный · сливочный", notes: "инжир · чай матча · кашемир", price: 2490, art: "knot" },
];

const defaultCategories:Category[] = [
  {
    id:1,slug: "warm",name: "Тепло",mood: "Дом обнимает",description: "Для вечера, когда хочется завернуться в плед, выключить уведомления и никуда не спешить.",paper:"#f4ede2",ink:"#2a201b",accent:"#8a3f2d",soft:"#dec4a7",
    notes: ["ваниль", "сандал", "тонка"],
  },
  {
    id:2,slug: "fresh",name: "Свежо",mood: "Окна настежь",description: "Чистый воздух после дождя, прохладный лён и зелёные ветви. Лёгкость без сладости.",paper:"#edf4ef",ink:"#18322b",accent:"#397766",soft:"#c8ddd4",
    notes: ["ветивер", "нероли", "мох"],
  },
  {
    id:3,slug: "floral",name: "Нежно",mood: "Цветы без повода",description: "Не букет, а память о нём: прозрачные лепестки, пудровая дымка и мягкое утреннее солнце.",paper:"#f7edf1",ink:"#3c2530",accent:"#a45a78",soft:"#ead0da",
    notes: ["пион", "ирис", "мускус"],
  },
  {
    id:4,slug: "deep",name: "Глубоко",mood: "Свет после полуночи",description: "Тёмное дерево, специи и едва заметный дым — камерный аромат с длинным послевкусием.",paper:"#e9e5df",ink:"#211d1a",accent:"#51463f",soft:"#c8beb1",
    notes: ["кедр", "кожа", "амбра"],
  },
];

const money = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

export default function Home() {
  const [products, setProducts] = useState<Product[]>(defaultProducts);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [favorites, setFavorites] = useState<number[]>([]);
  const [categories,setCategories]=useState<Category[]>(defaultCategories);
  const [activeScent, setActiveScent] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [orderError, setOrderError] = useState("");
  const [content, setContent] = useState<SiteContent>({});
  const c = (key:string, fallback:string) => content[key]?.value || fallback;

  useEffect(() => {
    fetch("/api/products").then((response) => response.ok ? response.json() : Promise.reject()).then((items) => {
      if (!Array.isArray(items) || !items.length) return;
      setProducts(items.map((item, index) => ({ id:item.id, name:item.name, family:item.category,categorySlug:item.categorySlug, notes:item.notes, price:item.price, image:item.image, art:defaultProducts[index % defaultProducts.length].art })));
    }).catch(() => undefined);
  }, []);
  useEffect(() => { fetch("/api/content").then((r) => r.ok ? r.json() : {}).then(setContent).catch(() => undefined); }, []);
  useEffect(()=>{fetch("/api/categories").then(r=>r.ok?r.json():Promise.reject()).then(setCategories).catch(()=>undefined)},[]);

  useEffect(() => {
    document.body.style.overflow = cartOpen || menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [cartOpen, menuOpen]);

  const cartItems = useMemo(
    () => products.filter((product) => cart[product.id]).map((product) => ({ ...product, quantity: cart[product.id] })),
    [cart, products],
  );
  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
  const scent = categories.find((profile) => profile.slug === activeScent);
  const visibleProducts=useMemo(()=>activeScent?[...products].sort((a,b)=>Number(b.categorySlug===activeScent)-Number(a.categorySlug===activeScent)):products,[products,activeScent]);
  const themeStyle=scent?({"--paper":scent.paper,"--cream":scent.soft,"--ink":scent.ink,"--wine":scent.accent,"--apricot":scent.accent,"--sage":scent.soft,"--line":`${scent.ink}2b`} as CSSProperties):undefined;

  const addToCart = (product: Product) => {
    setCart((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
    setToast(`«${product.name}» уже в корзине`);
    window.setTimeout(() => setToast(null), 2200);
  };

  const changeQuantity = (id: number, delta: number) => {
    setCart((current) => {
      const next = (current[id] ?? 0) + delta;
      const updated = { ...current };
      if (next <= 0) delete updated[id];
      else updated[id] = next;
      return updated;
    });
  };

  const toggleFavorite = (id: number) => {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const handleSubscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubscribed(true);
  };

  const handleOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOrderError(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/orders", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ customerName:form.get("name"), phone:form.get("phone"), email:form.get("email"), address:form.get("address"), delivery:form.get("delivery"), comment:form.get("comment"), items:cartItems.map((item) => ({ productId:item.id, quantity:item.quantity })) }) });
    const data = await response.json();
    if (!response.ok) { setOrderError(data.error || "Не удалось отправить заказ"); return; }
    setOrderNumber(data.orderNumber); setOrderPlaced(true); setCart({});
  };

  return (
    <main className={scent?"mood-active":""} style={themeStyle}>
      <div className="announcement">
        <span>{c("announcement.main", "Бесплатная доставка от 4 500 ₽")}</span>
        <span className="announcement-note">{c("announcement.note", "Каждая свеча отлита вручную")}</span>
      </div>

      <header className="site-header">
        <button
          className={menuOpen ? "menu-button menu-button-open" : "menu-button"}
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span />
          <span />
        </button>

        <a className="wordmark" href="#top" aria-label="ТИХО — на главную">
          ТИХО<span>●</span>
        </a>

        <nav className={menuOpen ? "nav nav-open" : "nav"}>
          <a href="#catalog" onClick={() => setMenuOpen(false)}>Каталог</a>
          <a href="#scents" onClick={() => setMenuOpen(false)}>Ароматы</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>О нас</a>
          <a href="#delivery" onClick={() => setMenuOpen(false)}>Доставка</a>
        </nav>

        <button className="cart-button" type="button" onClick={() => setCartOpen(true)} aria-label={`Открыть корзину, товаров: ${cartCount}`}>
          Корзина <span>{cartCount}</span>
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span /> Сделано руками. Зажигается сердцем.</div>
          <h1>
            {c("hero.title", "Свет, который")}
            <em>{c("hero.emphasis", "создаёт настроение")}</em>
          </h1>
          <p className="hero-lead">
            {c("hero.description", "Скульптурные свечи и авторские ароматы для тихих вечеров, долгих разговоров и дома, в который хочется возвращаться.")}
          </p>
          <div className="hero-actions">
            <a className="button button-dark" href="#catalog">Выбрать свою свечу <span>↗</span></a>
            <a className="text-link" href="#about">Познакомиться с нами <span>→</span></a>
          </div>
          <div className="hero-meta">
            <span>100% соевый воск</span>
            <span>Фитили из дерева и хлопка</span>
            <span>До 60 часов горения</span>
          </div>
        </div>

        <div className="hero-visual">
          <img src={c("image.hero", "/images/hero-candles.webp")} alt="Коллекция скульптурных свечей ТИХО" fetchPriority="high" />
          <div className="hero-sticker">
            <span>new</span>
            <strong>08</strong>
            <small>летняя<br />коллекция</small>
          </div>
          <div className="hero-caption">
            <span>01</span>
            <p><strong>Тёплый свет.</strong><br />Умиротворяющий аромат.</p>
          </div>
        </div>
      </section>

      <section className="intro-strip" aria-label="Философия бренда">
        <p>Маленькие объекты</p>
        <span>✦</span>
        <p className="intro-feature">больших чувств</p>
        <span>✦</span>
        <p>созданные медленно</p>
      </section>

      <section className={`scent-section scent-${activeScent||"default"}`} id="scents">
        <div className="scent-header"><span className="section-index">01 / настроение</span><h2>Как вы хотите <em>себя чувствовать?</em></h2></div>
        <div className="scent-tabs" role="tablist" aria-label="Выберите настроение">
          <button className={!activeScent?"scent-tab active":"scent-tab"} onClick={()=>setActiveScent("")}>Как сейчас</button>
          {categories.map(profile=><button key={profile.id} className={activeScent===profile.slug?"scent-tab active":"scent-tab"} onClick={()=>setActiveScent(profile.slug)}>{profile.name}</button>)}
        </div>
        {scent&&<div className="scent-content"><div className="scent-orbit" aria-hidden="true"><div className="orbit-ring ring-one"/><div className="orbit-ring ring-two"/><span>тихо<br/>внутри</span></div><div className="scent-description"><span>ваше настроение</span><h3>{scent.mood}</h3><p>{scent.description}</p><div className="note-list">{scent.notes.map((note,index)=><span key={note}><b>0{index+1}</b>{note}</span>)}</div><a className="text-link" href="#catalog">Показать свечи <span>→</span></a></div></div>}
      </section>

      <section className="catalog-section" id="catalog">
        <div className="section-heading">
          <div>
            <span className="section-index">01 / каталог</span>
            <h2>Наши <em>любимчики</em></h2>
          </div>
          <p>У каждой свечи свой характер. Выбирайте по настроению — аромат раскроется постепенно и останется с вами надолго.</p>
        </div>

        <div className="product-grid">
          {visibleProducts.map((product, index) => (
            <article className="product-card" key={product.id}>
              <div className={`product-art art-${product.art}`}>
                {product.image && <img className="product-photo" src={product.image} alt={product.name} loading="lazy" />}
                <span className="art-number">0{index + 1}</span>
                {product.badge && <span className="product-badge">{product.badge}</span>}
                <button
                  className={favorites.includes(product.id) ? "favorite favorite-active" : "favorite"}
                  onClick={() => toggleFavorite(product.id)}
                  aria-label={favorites.includes(product.id) ? `Убрать ${product.name} из избранного` : `Добавить ${product.name} в избранное`}
                  aria-pressed={favorites.includes(product.id)}
                >♡</button>
                <div className="wax-form"><i /><b /></div>
                <span className="art-shadow" />
              </div>
              <div className="product-info">
                <div className="product-topline">
                  <h3>{product.name}</h3>
                  <strong>{money(product.price)}</strong>
                </div>
                <p className="product-family">{product.family}</p>
                <p className="product-notes">{product.notes}</p>
                <button className="add-button" onClick={() => addToCart(product)}>
                  Добавить в корзину <span>＋</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="manifesto">
        <div className="manifesto-image">
          <img src={c("image.collection", "/images/collection-candles.webp")} alt="Пять свечей из коллекции ТИХО" loading="lazy" />
          <span>Коллекция 01 / 2026</span>
        </div>
        <div className="manifesto-copy">
          <span className="section-index light">наш манифест</span>
          <blockquote>{c("manifesto.quote", "«Свеча — это маленькая архитектура настроения»")}</blockquote>
          <p>{c("manifesto.text", "Мы не торопим воск и не повторяем формы до идеальной одинаковости. В каждой свече остаётся след ручной работы — поэтому она живая.")}</p>
          <div className="manifesto-facts">
            <div><strong>7</strong><span>этапов<br />ручной работы</span></div>
            <div><strong>48ч</strong><span>на полное<br />застывание</span></div>
            <div><strong>0%</strong><span>парафина<br />и фталатов</span></div>
          </div>
        </div>
      </section>

      <section className="gift-section">
        <div className="gift-copy">
          <span className="section-index">подарки без повода</span>
          <h2>Дарите не вещь.<br /><em>Дарите ощущение.</em></h2>
          <p>Соберём набор из двух или трёх свечей, добавим открытку с вашими словами и упакуем так, что жалко открывать.</p>
          <a className="button button-outline" href="#delivery">Собрать подарок <span>↗</span></a>
        </div>
        <div className="gift-visual">
          <img src={c("image.gift", "/images/collection-candles.webp")} alt="Подарочная коллекция ароматических свечей" loading="lazy" />
          <div className="gift-label"><span>от</span><strong>4 900</strong><small>₽</small></div>
        </div>
      </section>

      <section className="about-section" id="about">
        <div className="about-image">
          <img src={c("image.about", "/images/workshop-candle-making.webp")} alt="Ручная заливка соевого воска в мастерской ТИХО" loading="lazy" />
          <span className="vertical-note">Сочи · маленькая мастерская · большие планы</span>
        </div>
        <div className="about-copy">
          <span className="section-index">03 / о нас</span>
          <h2>Сделано <em>не фабрикой,</em><br />а человеком</h2>
          <p className="about-lead">{c("about.lead", "ТИХО началось с желания вернуть дому его главное свойство — быть местом, где можно выдохнуть.")}</p>
          <p>{c("about.text", "Мы смешиваем ароматы маленькими партиями, вручную готовим формы и проверяем горение каждой новой композиции. Нам важны не скорость и тираж, а тот самый момент, когда вы зажигаете фитиль и пространство вокруг меняется.")}</p>
          <div className="signature">с теплом, команда тихо</div>
          <a className="text-link" href="#catalog">Смотреть коллекцию <span>→</span></a>
        </div>
      </section>

      <section className="reviews">
        <div className="section-heading reviews-heading">
          <div><span className="section-index">04 / говорят о нас</span><h2>Ваши тихие <em>истории</em></h2></div>
          <div className="review-score"><strong>4.9</strong><span>★★★★★<br />на основе 186 отзывов</span></div>
        </div>
        <div className="review-grid">
          <article><span>01</span><div className="stars">★★★★★</div><blockquote>«Пахнет так, будто дома испекли что-то тёплое, но без приторности. Теперь это мой ритуал по воскресеньям»</blockquote><p>— Марина, Москва</p></article>
          <article><span>02</span><div className="stars">★★★★★</div><blockquote>«Свеча “После дождя” — буквально воздух после летней грозы. И даже незажжённая выглядит как арт-объект»</blockquote><p>— Лиза, Краснодар</p></article>
          <article><span>03</span><div className="stars">★★★★★</div><blockquote>«Дарила набор подруге. Упаковка, открытка, сами свечи — всё очень личное и без ощущения масс-маркета»</blockquote><p>— Алина, Санкт-Петербург</p></article>
        </div>
      </section>

      <section className="delivery-section" id="delivery">
        <div className="delivery-intro">
          <span className="section-index light">доставка и забота</span>
          <h2>Привезём тепло<br /><em>куда скажете</em></h2>
        </div>
        <div className="delivery-list">
          <div><span>01</span><h3>По России</h3><p>СДЭК и Boxberry, 2–7 рабочих дней. Бесплатно от 4 500 ₽.</p></div>
          <div><span>02</span><h3>По Сочи</h3><p>Курьером в день заказа или самовывозом из мастерской.</p></div>
          <div><span>03</span><h3>В подарок</h3><p>Без чека в коробке, с вашей открыткой и точно в нужную дату.</p></div>
        </div>
      </section>

      <section className="newsletter">
        <span>письма, которые хочется открывать</span>
        <h2>{subscribed ? "Теперь будем на связи ♡" : "Редкие новости о новых ароматах"}</h2>
        {!subscribed && (
          <form onSubmit={handleSubscribe}>
            <label className="sr-only" htmlFor="email">Ваш email</label>
            <input id="email" type="email" placeholder="ВАШ EMAIL" required />
            <button type="submit">Подписаться <span>→</span></button>
          </form>
        )}
        <small>Никакого спама. Только красивое и полезное.</small>
      </section>

      <footer>
        <div className="footer-top">
          <a className="footer-wordmark" href="#top">ТИХО<span>●</span></a>
          <p>Свечи для дома,<br />в котором хорошо.</p>
          <div className="footer-links"><a href="#catalog">Каталог</a><a href="#about">О бренде</a><a href="#delivery">Доставка</a><a href="#delivery">Оплата</a></div>
          <div className="footer-links"><a href="mailto:hello@tiho-candles.ru">Email</a><a href="#top">Telegram</a><a href="#top">Instagram*</a><a href="/admin">Управление</a></div>
        </div>
        <div className="footer-bottom"><span>© 2026 ТИХО</span><span>Политика конфиденциальности</span><span>* Instagram принадлежит Meta, признанной экстремистской организацией в РФ</span></div>
      </footer>

      <div className={cartOpen ? "cart-overlay visible" : "cart-overlay"} onClick={() => { setCartOpen(false); setCheckoutOpen(false); }} />
      <aside className={cartOpen ? "cart-drawer cart-open" : "cart-drawer"} aria-hidden={!cartOpen} aria-label="Корзина">
        <div className="cart-header"><div><span>ваш выбор</span><h2>Корзина <em>({cartCount})</em></h2></div><button onClick={() => { setCartOpen(false); setCheckoutOpen(false); }} aria-label="Закрыть корзину">×</button></div>
        {cartItems.length === 0 ? (
          <div className="empty-cart"><div className="empty-flame">♢</div><h3>Здесь пока тихо</h3><p>Добавьте свечу, которая совпала с вашим настроением.</p><button className="button button-dark" onClick={() => setCartOpen(false)}>Перейти в каталог</button></div>
        ) : (
          <>
            <div className="cart-items">
              {cartItems.map((item) => (
                <article className="cart-item" key={item.id}>
                  <div className={`cart-thumb art-${item.art}`}><div className="wax-form"><i /></div></div>
                  <div className="cart-item-copy"><h3>{item.name}</h3><p>{item.notes}</p><div className="quantity"><button onClick={() => changeQuantity(item.id, -1)} aria-label={`Уменьшить количество ${item.name}`}>−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.id, 1)} aria-label={`Увеличить количество ${item.name}`}>＋</button></div></div>
                  <strong>{money(item.price * item.quantity)}</strong>
                </article>
              ))}
            </div>
            <div className="cart-footer">
              <div className="cart-total"><span>Итого</span><strong>{money(cartTotal)}</strong></div>
              <p>{cartTotal >= 4500 ? "Доставка будет бесплатной ♡" : `До бесплатной доставки ещё ${money(4500 - cartTotal)}`}</p>
              <button className="button button-dark checkout-button" onClick={() => setCheckoutOpen(true)}>Перейти к оформлению <span>→</span></button>
              <small>Менеджер уточнит доставку перед оплатой</small>
            </div>
          </>
        )}

        <div className={checkoutOpen ? "checkout-panel checkout-panel-open" : "checkout-panel"} aria-hidden={!checkoutOpen}>
          {!orderPlaced ? (
            <>
              <div className="checkout-heading">
                <button onClick={() => setCheckoutOpen(false)} aria-label="Вернуться в корзину">←</button>
                <div><span>почти готово</span><h2>Оформление</h2></div>
              </div>
              <form className="checkout-form" onSubmit={handleOrder}>
                <label>Как к вам обращаться?<input type="text" name="name" placeholder="Имя" required /></label>
                <label>Телефон<input type="tel" name="phone" placeholder="+7 999 000-00-00" required /></label>
                <label>Email<input type="email" name="email" placeholder="name@example.ru" required /></label>
                <label>Адрес доставки<textarea name="address" placeholder="Город, улица, дом, квартира или удобный пункт выдачи" required /></label>
                <fieldset><legend>Как доставить?</legend><label><input type="radio" name="delivery" value="Пункт выдачи" defaultChecked /> Пункт выдачи</label><label><input type="radio" name="delivery" value="Курьером" /> Курьером</label></fieldset>
                <label>Комментарий<textarea name="comment" placeholder="Пожелания к заказу (необязательно)" /></label>
                <div className="checkout-summary"><span>{cartCount} шт.</span><strong>{money(cartTotal)}</strong></div>
                {orderError && <p className="checkout-error">{orderError}</p>}
                <button className="button button-dark checkout-button" type="submit">Отправить заявку <span>→</span></button>
                <p>Нажимая кнопку, вы соглашаетесь с политикой конфиденциальности.</p>
              </form>
            </>
          ) : (
            <div className="order-success">
              <span>♡</span>
              <h2>Спасибо.<br /><em>Будем на связи</em></h2>
              <p>Заказ {orderNumber} принят. Мы проверим детали и скоро свяжемся с вами, чтобы подтвердить доставку.</p>
              <button className="button button-dark" onClick={() => { setOrderPlaced(false); setCheckoutOpen(false); setCartOpen(false); }}>Вернуться на сайт</button>
            </div>
          )}
        </div>
      </aside>

      <div className={toast ? "toast toast-visible" : "toast"} role="status">{toast}<span>✓</span></div>
    </main>
  );
}
