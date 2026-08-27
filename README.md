# ТИХО — интернет-магазин ароматических свечей

Сайт бренда ТИХО с каталогом, корзиной и защищённой административной панелью. Проект подготовлен для развёртывания в Amvera через Docker.

## Возможности

- управление товарами, ценами, остатками и публикацией через `/admin`;
- загрузка JPG, PNG и WebP до 10 МБ;
- хранение каталога в PostgreSQL;
- хранение фотографий на постоянном диске `/data/uploads`;
- защищённая серверная сессия администратора;
- адаптивный магазин и админка.

## Запуск в Amvera

В приложении используются следующие переменные окружения:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
PGSSL=false
ADMIN_PASSWORD=replace-with-a-strong-password
SESSION_SECRET=replace-with-at-least-32-random-characters
UPLOAD_DIR=/data/uploads
```

Подключите постоянное хранилище Amvera к `/data`. Контейнер принимает запросы на порту `3000`. Подробная последовательность находится в [AMVERA_DEPLOY.md](./AMVERA_DEPLOY.md).

## Локальная проверка

```bash
npm ci
npm run build:amvera
npm run start:amvera
```

Секреты, база данных и загруженные фотографии не должны добавляться в Git.
