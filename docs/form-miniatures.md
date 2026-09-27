# Миниатюры форм — 27 сентября 2026

Для фильтра каталога созданы отдельные изображения с освещением и фактурой. Они не являются масками для окрашивания товара. Пользователь уточнил текущую линейку: змея, кашпо, кашпо XS, тыква, лимон. У малого кашпо используется тот же портрет цилиндра, уменьшенный до 76% площади сцены по каждой стороне.

## Файлы и использование

- `public/assets/forms/portraits/snake.webp` — 640 × 640, настоящий alpha-канал.
- `public/assets/forms/portraits/pumpkin.webp` — 640 × 640, настоящий alpha-канал.
- `public/assets/forms/portraits/pot.webp` — 640 × 640, настоящий alpha-канал.
- `public/assets/forms/portraits/lemon.webp` — 640 × 640, настоящий alpha-канал.

Генерация: встроенный image_gen, по фотографиям готовых свечей из действующего каталога, по одной генерации на форму. Исходники не менялись. WebP подготовлены через sharp с сохранением пропорций и alpha, quality 88. Суммарно около 244 КиБ. Отдельные проработки чаш и ребристого кашпо после уточнения владельца не включены в сайт.

Портреты подбираются по нормализованным названиям из `lib/form-portraits.ts`. Идентификаторы форм не зашиты. Для неизвестной формы загруженный силуэт отображается как исходное изображение с нейтральным CSS-фильтром; без файла остаётся совместимый геометрический предпросмотр. Готовые маски, двухцветность и товарные фотографии не изменены. Старые прототипные чаша и ребристые формы скрыты из фильтра, пока у них нет опубликованных товаров; новые названия из справочника не блокируются.

## Финальные запросы генерации

### snake

Use case: product-mockup. Asset type: single premium photorealistic 3D candle miniature for an ecommerce shape filter. Render ONE isolated object, square composition, fully visible with about 10% transparent padding, true transparent alpha background. Entire object in warm neutral ivory / limestone / beige, with real tactile fine ceramic texture, rich sculptural relief and gentle satin highlights. Strong enough light-dark modeling to stay legible at 140px. Soft studio key from upper left, darker right side, very subtle small contact shadow. Front three-quarter view from slightly above, realistic proportions, not flattened, not distorted, sharp focus throughout. No text, no labels, no environment, no props, no decorative pedestal. Input image is ONLY the geometry reference. Preserve the exact recognizable candle container: upright slightly egg-shaped cylindrical jar, conical domed closed lid, sculpted snake coiled diagonally around the jar and curving up to its head on top of lid. Total height about 1.55 times body width. Keep intricate snake scales and little dark recessed eye, obvious lid seam. Replace green body and silver snake with unified warm ivory ceramic, slightly deeper taupe in scale grooves. Do not turn it into a squat blob or abstract swirl. One complete closed candle only.

### pumpkin

Use case: product-mockup. Asset type: single premium photorealistic 3D candle miniature for an ecommerce shape filter. Render ONE isolated object, square composition, fully visible with about 10% transparent padding, true transparent alpha background. Entire object in warm neutral ivory / limestone / beige, with real tactile fine ceramic texture, rich sculptural relief and gentle satin highlights. Strong enough light-dark modeling to stay legible at 140px. Soft studio key from upper left, darker right side, very subtle small contact shadow. Front three-quarter view from slightly above, realistic proportions, not flattened, not distorted, sharp focus throughout. No text, no labels, no environment, no props, no decorative pedestal. Input image is ONLY geometry reference. Preserve this plump pumpkin-shaped candle container with deep vertical lobes, removable matching lid closed and short bent sculpted stem. Body height about 0.76 times width, total height with stem about equal width. Entire pumpkin and stem warm ivory ceramic instead of red or gold. Tactile shallow handmade pores with smooth satin raised lobes and darker grooves. One complete closed candle only.

### pot

Use case: product-mockup. Asset type: single premium photorealistic 3D candle miniature for an ecommerce shape filter. Render ONE isolated object, square composition, fully visible with about 10% transparent padding, true transparent alpha background. Entire object in warm neutral ivory / limestone / beige, with real tactile fine ceramic texture, rich sculptural relief and gentle satin highlights. Strong enough light-dark modeling to stay legible at 140px. Soft studio key from upper left, darker right side, very subtle small contact shadow. Front three-quarter view from slightly above, realistic proportions, not flattened, not distorted, sharp focus throughout. No text, no labels, no environment, no props, no decorative pedestal. Input image is ONLY geometry reference. Preserve the upright simple circular cylindrical container, thick round rim, straight vertical walls, body height about 1.1 times diameter. Open top visible, creamy candle wax and one small unlit rectangular wooden wick. Replace black coating with warm ivory limestone-like ceramic with fine subtle porous mineral texture. Do not make it shiny glass, a teacup or a low bowl. One candle only.

### lemon

Use case: product-mockup. Asset type: single premium photorealistic 3D candle miniature for an ecommerce shape filter. Render ONE isolated object, square composition, fully visible with about 10% transparent padding, true transparent alpha background. Entire object in warm neutral ivory / limestone / beige, with real tactile fine ceramic texture, rich sculptural relief and gentle satin highlights. Strong enough light-dark modeling to stay legible at 140px. Soft studio key from upper left, darker right side, very subtle small contact shadow. Front three-quarter view from slightly above, realistic proportions, not flattened, not distorted, sharp focus throughout. No text, no labels, no environment, no props, no decorative pedestal. Input image is ONLY geometry reference. Preserve a lemon-shaped candle container lying horizontally: deep oval lower lemon half bowl filled with creamy wax, one small unlit wick, matching curved lemon-peel lid leaning upright against its right side. Clear pointed lemon ends and finely stippled realistic citrus rind texture carved in warm neutral ivory ceramic. No yellow. Preserve the substantial depth of the bowl, do not flatten into a dish. Exactly one candle with its lid.

