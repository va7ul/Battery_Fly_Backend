# PROJECT_CONTEXT.md — Battery Fly Backend

> Onboarding-довідка для нової сесії Claude Code. Актуально станом на момент створення файлу
> (гілки `feature/monopay-return` / `master` — ідентичні за вмістом, всі monopay-PR змерджені).
> Значення `.env` тут ніде не наводяться — лише назви змінних.

## 1. Огляд

- **Проєкт:** Battery Fly — бекенд інтернет-магазину (акумулятори/батареї, збірки, 3D-друк на замовлення).
- **Стек:** Node.js (`^18`), Express `4.17.1`, MongoDB Atlas через Mongoose `^8.0.0`, Joi для валідації тіла запитів, JWT (`jsonwebtoken`) + `bcrypt` для авторизації (окремо клієнти й окремо адміни), `multer` + `cloudinary` для завантаження зображень, `nodemailer` для листів (є й `@sendgrid/mail` серед залежностей, але фактично підключений лише nodemailer-хелпер), `axios` для зовнішніх HTTP (Нова Пошта, monobank).
- **Деплой:** Render.com. Судячи з історії PR у цьому репо — прод-гілка `master`, деплой автоматичний при мерджі туди.
- **Гілки:** feature-гілки на кожну задачу (`feature/monopay`, `feature/monopay-resend`, `feature/monopay-return`, …), мердж у `master` через Pull Request власником. **Не мержити в master і не пушити туди самостійно без явного прохання** — це усталене правило в цьому репо.
- **Локальний запуск:** `npm run start:dev` (nodemon), `npm start` — прод-режим. Порт — `process.env.PORT` з дефолтом 3000 (в `.env` зазвичай не заданий, Render підставляє свій).

## 2. Структура

```
app.js                  — Express app: middleware, монтування роутів, error-хендлер
server.js                — точка входу: mongoose.connect → app.listen
controllers/              — по одному файлу на ресурс (orders.js, admin.js, monopay.js, ...)
models/                   — Mongoose-схеми + Joi-схеми валідації, часто в одному файлі
routes/api/                — Express-роутери, по одному на префікс
middlewares/               — validateBody, auth (клієнт), authAdm (адмін), upload (multer), isValidId
helpers/                    — HttpError, ctrlWrapper, sendEmail, cloudinary, monopay.js (HMAC/axios-клієнт)
_backups/<feature>-<timestamp>/  — знімки файлів ПЕРЕД правками в кожній фічовій сесії (конвенція
                                    цього репо, не сміття — лишати як є)
```

Патерн контролера скрізь однаковий: `async (req, res) => {...}` без власного `try/catch`, помилки
кидаються через `throw HttpError(status, message)`, увесь контролер обгортається в `ctrlWrapper`
при експорті (`ctrlWrapper` ловить виняток і викликає `next(error)`). Глобальний error-хендлер в
`app.js` читає `err.status`/`err.message`.

## 3. Модель Order (`models/order.js`)

Один плоский документ на будь-який тип замовлення (звичайне / ПЧ / майбутній еквайринг) —
розрізняються лише значенням поля `payment`. Немає дискримінаторів чи піддокументів на кожен спосіб
оплати.

| Поле | Тип | Required / Default | Нотатка |
|---|---|---|---|
| `status` | String | default `'Нове'` | керується адмінкою (`Нове`/`В роботі`/`Скасовано`/`Доставлено`) |
| `numberOfOrder` | String | unique | наскрізний номер, спільний лічильник для всіх типів |
| `firstName`, `lastName` | String | required | — |
| `email` | String | required | — |
| `comment` | String | default `""` | в addOrder мапиться з `userData.text` |
| `tel` | String | required | — |
| `total` | Number | required | сума до знижки |
| `promoCode` | String | — | — |
| `promoCodeDiscount` | Number | required | — |
| `discountValue` | Number | required | — |
| `together` | Number | required | **фінальна сума до сплати** — саме це поле йде в monobank як `total_sum` |
| `cartItems` | Array | required | **без вкладеної Joi/Mongoose-схеми** — див. розділ 7 |
| `deliveryType`, `city`, `warehouse` | String | required | Нова Пошта / самовивіз |
| `payment` | String | required | вільний рядок без enum: спостережені значення `'card'` (задає фронтенд), `'monopay_parts'` (проставляє бек) |
| `monopayOrderId` | String | default `null`, indexed | ID заявки на боці monobank (ПЧ) |
| `monopayState` / `monopaySubState` | String | default `null` | останній синхронізований стан ПЧ (SUCCESS/IN_PROCESS/FAIL + підстан) |
| `payParts` | Number | default `null` | кількість платежів ПЧ (3–25) |
| `isTest` | Boolean | default `false` | мітка тестового замовлення (сендбокс monobank) |
| `monopayReturnedSum` | Number | default `0` | скільки вже повернено клієнту (ПЧ) |
| `monopayReturns` | Array<Object> | default `[]` | історія повернень: `{store_return_id, sum, date, return_money_to_card}` |

**Полів під онлайн-еквайринг ще немає.** Коли будете додавати — за аналогією з ПЧ: nullable-поля
з власним префіксом (напр. `acquiringInvoiceId`, `acquiringStatus`), у той самий плоский
`orderSchema`, без нової колекції.

Joi-схеми в цьому ж файлі: `schemas.addOrder` (звичайне замовлення) і `schemas.createMonopayOrder`
(ПЧ, той самий набір полів мінус `payment` плюс `payParts`, телефон валідується строгіше —
`/^\+380\d{9}$/`, бо йде напряму в monobank `client_phone`).

## 4. API-роути

Middleware-скорочення: **auth** = клієнтський JWT (`middlewares/auth.js`, проти колекції `User`),
**authAdm** = адмінський JWT (`middlewares/authAdm.js`, проти колекції `Admin`) — дві незалежні
моделі, спільний `SECRET_KEY`. **validateBody(schema)** — Joi-валідація тіла.

| Префікс | Метод + шлях | Middleware | Призначення |
|---|---|---|---|
| `/api/auth` | POST `/signup` | validateBody | реєстрація клієнта |
| | POST `/signin` | validateBody | логін клієнта |
| | POST `/signout` | auth | вихід |
| | GET `/current` | auth | поточний користувач |
| | POST `/forgot-password` | — | скидання паролю |
| `/api/products` | GET `/` | — | усі товари |
| | POST `/` | — | товари за масивом id (`getProductsArray`) |
| | GET `/batteries`, `/batteries/21700`, `/18650`, `/32650`, `/lipo`, `/lifepo4` | — | батареї за категорією |
| | GET `/batteries-for-fpv`, `/-transport`, `/-toys` | — | батареї за призначенням |
| | GET `/assemblies`, `/sale`, `/devices`, `/materials` | — | інші категорії каталогу |
| | GET `/:id` | — | картка товару |
| `/api/user` | GET `/favorite` | auth | список обраного |
| | POST/DELETE `/favorite/:id` | auth | додати/прибрати з обраного |
| | GET `/verify/:verifyToken` | — | підтвердження email |
| | POST `/resend` | — | повторний лист верифікації |
| | POST `/change-info` \| `/change-password` \| `/change-delivery` | auth + validateBody | зміна профілю |
| `/api/order` | POST `/getDeliveryCity`, `/getWarehouses` | — | проксі до Нової Пошти |
| | POST `/add-order` | validateBody(addOrder) | **звичайне замовлення**: інкремент `NumberOfOrders`, `Order.create(...)`, лист клієнту через `sendEmail`, відповідь `{orderNum}` |
| | GET `/get-orders`, `/get-order/:id` | auth | замовлення поточного клієнта |
| | GET `/promo-code/:name` | auth | перевірка промокоду |
| | POST `/quick-order` | validateBody | швидке замовлення (окрема колекція `QuickOrder`) |
| `/api/3dprint` | GET `/` | — | список заявок на 3D-друк |
| | POST `/` | upload.single + validateBody | нова заявка на 3D-друк (файл) |
| `/api/feedback` | POST `/` | — | форма зворотного зв'язку |
| `/api/hero` | GET `/` | — | зображення хедера |
| `/api/adm` | POST `/signin` | validateBody | логін адміна |
| | POST `/signout`, GET `/current` | authAdm | — |
| | POST `/product-add`, PUT `/product-edit/:id`, DELETE `/product/:id` | authAdm + upload | CRUD товарів |
| | POST `/assemblies-add`, PUT `/assemblies-edit/:id`, DELETE `/assemblies/:id` | authAdm + upload | CRUD збірок |
| | PUT/POST/DELETE `/hero/:id`, `/hero/` | authAdm + upload | керування хедером |
| | GET `/get-orders`, `/get-order/:id` | authAdm | список/картка замовлень (адмін) |
| | GET `/3dprint-orders`, `/3dprint-orders/:id` | authAdm | заявки 3D-друку |
| | GET `/quick-orders`, `/quick-order/:id` | authAdm | швидкі замовлення |
| | GET `/users`, `/user/:id` | authAdm | клієнти |
| | GET/POST/PUT/DELETE `/promo-codes`, `/promo-code`, `/promo-code/:id` | authAdm | промокоди |
| | GET `/feedback` | authAdm | звернення |
| | PUT `/put-order/:id` | authAdm | **зміна статусу замовлення** — шукає за `_id` (не `numberOfOrder`, на відміну від GET-роутів вище) |
| `/api/monopay` | POST `/create` | validateBody(createMonopayOrder) | створити заявку ПЧ + Order |
| | POST `/callback` | — (HMAC-перевірка в тілі функції) | вебхук від monobank |
| | POST `/state/:id` | authAdm | ручний опитувальний запит статусу |
| | POST `/confirm/:id` | authAdm | підтвердити видачу товару → активує ПЧ |
| | POST `/reject/:id` | authAdm | відмовити у видачі |
| | POST `/resend/:id` | authAdm | повторний create після FAIL (той самий `store_order_id`) |
| | POST `/return/:id` | authAdm | повернення коштів за активною ПЧ (повне/часткове) |

Усюди `:id` для `/api/monopay/*` і GET-роутів адмінки — це `numberOfOrder`, окрім `put-order/:id`,
де це Mongo `_id`.

## 5. Інтеграції monobank

### 5.1. Покупка частинами (`monopay`) — **у проді, змерджено в master**

Архітектура: роут → контролер → helper. Helper — єдине місце, що знає про HTTP до monobank.

- **`helpers/monopay.js`** — окремий axios-інстанс `monopayClient = axios.create({ baseURL: process.env.MONOPAY_BASE_URL })`; `signBody()` (HMAC-SHA256 → base64); `verifyCallbackSignature()` (звірка вхідного підпису через `crypto.timingSafeEqual`); `monopayPost(path, payload)` — єдина точка виходу: `JSON.stringify` **один раз**, підписати той самий рядок, відправити рядком (не об'єктом), заголовки `store-id` + `signature`; білдери тіл — `buildCreatePayload`, `buildOrderIdPayload`, `buildReturnPayload`.
- **`controllers/monopay.js`** — 7 функцій: `createMonopayOrder`, `monopayCallback`, `getMonopayState`, `confirmMonopayOrder`, `rejectMonopayOrder`, `resendMonopayOrder`, `returnMonopayOrder`. Усі, крім `create`/`callback`, шукають замовлення через приватний хелпер `findMonopayOrder(numberOfOrder)` (404 якщо нема або нема `monopayOrderId`).
- **`routes/api/monopay.js`** — див. таблицю вище.
- **Статус:** усі 7 ендпоінтів у `master` (PR #128–#132), пройшли перевірку на сендбоксі monobank (`test_store_with_confirm`), включно з тестовими номерами `...1..4` і симуляцією підписаного callback.

### 5.2. Онлайн-еквайринг (`invoice/create`) — **не почато**

У коді немає жодного окремого клієнта, роута чи поля під acquiring/invoice — лише «Покупка
частинами». Що вже готове й перевикористовне з розділу 5.1:
- патерн окремого axios-клієнта (не займати глобальний `axios.defaults`, див. розділ 7);
- патерн HMAC-підпису точного рядка тіла (`signBody`/`monopayPost`);
- `req.rawBody` вже глобально доступний для перевірки підпису нового вебхука;
- вільне поле `payment` без enum — новий спосіб оплати це просто ще одне значення рядка;
- спільний лічильник `NumberOfOrders`.

Чого немає й треба будувати з нуля: власний вебхук-контролер (формат тіла в еквайринга інший, ніж
`{order_id, state, order_sub_state}` у ПЧ), нові nullable-поля в Order, нова Joi-схема створення,
новий роутер або розширення `routes/api/monopay.js`.

⚠️ **Пастка з документацією monobank:** повна схема тіла запиту `POST /api/order/create` для ПЧ
рендериться клієнтським JS (Redoc-подібна сторінка) — простий `curl`/fetch показує лише спрощений
приклад з головної сторінки, реальні обов'язкові поля (`invoice`, `available_programs`, `products`)
видно тільки в реальному браузері з розгорнутими акордеонами схеми. Для еквайрингу варто одразу
перевірити відповідний розділ `api-docs/acquiring/...` так само — через браузер, не через простий
HTTP-фетч.

## 6. ENV-змінні (лише назви, без значень)

**База даних / core:**
`DB_HOST`, `SECRET_KEY`, `BASE_URL`

**Пошта:**
`MAIL_USER`, `MAIL_PASS`

**Нова Пошта:**
`NOVA_POST`

**Cloudinary (зображення):**
`CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET`

**monobank / Покупка частинами:**
`MONOPAY_BASE_URL`, `MONOPAY_STORE_ID`, `MONOPAY_SECRET`, `PUBLIC_URL` (база для `result_callback`)

⚠️ `.env.example` **застарілий** — містить лише перший блок (DB_HOST…CLOUD_API_SECRET), чотирьох
monopay-змінних там немає. Варто оновити при наступній нагоді.

## 7. Важливі рішення й нюанси (неочевидне з коду)

- **`cartItems` без схеми предмета.** Ні Joi (`Joi.array()` без `.items()`), ні Mongoose
  (`type: Array` без вкладеної схеми) не описують форму товару в кошику. Бек ніколи не читає
  окремі поля товару (name/qty/price/code) — приймає масив як є і зберігає байт-у-байт. **Не
  вигадувати** поля товару без звірки з фронтендом.
- **`NumberOfOrders` — спільний лічильник, не атомарний.** Один документ, інкремент через
  `findOne({}) → numberOrder += 1 → save()` — класичний read-modify-write без транзакції/атомарного
  `findOneAndUpdate`. Гонка теоретично можлива при паралельних запитах. Це наявна, свідомо не
  чіпана поведінка — не «виправляти» її мимохідь у несуміжній задачі.
- **`req.rawBody`.** У `app.js`: `express.json({ verify: (req,res,buf) => { req.rawBody = buf } })`
  — додає сирі байти тіла для HMAC-перевірки monopay-callback, не змінює парсинг JSON для решти
  роутів.
- **Окремі axios-клієнти — принципово.** `controllers/orders.js` виставляє
  `axios.defaults.baseURL = "https://api.novaposhta.ua/v2.0/json/"` **глобально**. Будь-який новий
  зовнішній інтеграційний код (monobank, майбутні інтеграції) **мусить** іти через власний
  `axios.create({...})`, інакше ламається Нова Пошта.
- **HMAC — підписувати точний рядок, що відправляється.** І вихідні запити (`monopayPost`), і
  вхідний callback (`verifyCallbackSignature` через `req.rawBody`) свідомо уникають подвійної
  серіалізації — signature рахується від того самого `JSON.stringify`-рядка, що йде в тіло, байт у
  байт. Якщо колись переробити на об'єкт замість рядка — підпис розійдеться, monobank поверне 401.
- **`authAdm`/`auth` — відомий баг з відсутнім `return`.** В обох middlewares (`middlewares/authAdm.js`,
  `middlewares/auth.js`) гілки `if (bearer !== 'Bearer')` і `if (!user...)` викликають
  `next(HttpError(401,...))` **без** `return` — виконання продовжується і `next()` може викликатись
  вдруге. На практиці Express це не валить процес, але це крихка поведінка. Виправлено **лише**
  точково в `controllers/admin.js → updateOrderById` (додано `return` перед `res.json`), самі
  middlewares не займали.
- **`get-orders` (адмінка) — ручний whitelist полів.** `controllers/admin.js → getOrders` будує
  відповідь через `.map()` з явним переліком полів — нові поля Order (в т.ч. `monopayReturnedSum`,
  `monopayReturns`, `isTest`) **не** з'являються в списку автоматично, поки їх туди не додати
  вручну. Зараз у whitelist є: `_id, numberOfOrder, ..., payParts, monopayState, monopaySubState,
  monopayOrderId, createdAt, status` — повернень (5.1 return) там ще нема.
- **`put-order/:id` шукає за `_id`, решта admin GET-роутів — за `numberOfOrder`.** Свідомо різні
  ключі: мутуючі дії — по Mongo `_id`, читання списком/по одному — по публічному номеру.
- **Сендбокс monobank — не 1:1 з продом.** Канонічні тестові номери телефону (`...1`, `...2`,
  `...3`, `...4` — миттєве схвалення / очікування клієнта / недостатній ліміт / очікування
  підтвердження магазину) повертають **той самий фіксований `order_id`** незалежно від
  `store_order_id`; `confirm`/`reject` у сендбоксі можуть віддати «успішну» відповідь, яка **не**
  відображається в наступному `/state`-запиті для тих самих canned-фікстур. Не сприймати
  сендбокс-поведінку як гарантію ідентичної поведінки в проді для унікальних реальних замовлень.
- **`isExistsOtherOpenOrderError` (в `resendMonopayOrder`) — неперевірена евристика.** Точний
  формат відповіді monobank для `FAIL/EXISTS_OTHER_OPEN_ORDER` не вдалось відтворити наживо
  (сендбокс не відмовляє повторний create для canned-номерів) — перевірка йде по збігу тексту
  повідомлення (`EXISTS_OTHER_OPEN_ORDER` або «незаверш»), позначено коментарем у коді. Варто
  звірити на першому реальному випадку в проді.
- **`payment` — вільний рядок, без enum.** Ні Joi, ні Mongoose не обмежують можливі значення.
  Бек лише порівнює `=== 'monopay_parts'` у кількох місцях (`return`, і неявно через
  `findMonopayOrder`, який перевіряє `monopayOrderId`, не сам `payment`). Новий спосіб оплати не
  вимагає міграції схеми — просто нове значення рядка.
- **`_backups/` — навмисна конвенція, не сміття.** Кожна сесія редагування коду в цьому репо
  створює `_backups/<фіча>-<таймстемп>/` зі знімком файлів до правок і комітить їх разом з кодом.

## 8. Що в процесі / TODO

- [ ] Онлайн-еквайринг monobank (`invoice/create`) — **не починали**, лише розвідка архітектури
      (окрема довідка робилась для консультанта, у репо не збережена).
- [ ] UI/адмінка для `resend`/`return` — ТЗ на `return` явно ділилось на «Частина 1 (бек)» і
      «Частина 2 (адмінка)»; зроблено лише бек. Кнопка «Оформити повернення», модалка суми/способу,
      бейджі статусів — не реалізовано.
- [ ] `get-orders` (адмін-список замовлень) не показує `monopayReturnedSum`/`monopayReturns`/`isTest`
      — додати у whitelist, якщо знадобиться бачити повернення в списку.
- [ ] `.env.example` не містить `MONOPAY_BASE_URL`/`MONOPAY_STORE_ID`/`MONOPAY_SECRET`/`PUBLIC_URL`.
- [ ] Баг з відсутнім `return` в `authAdm`/`auth` (розділ 7) — не виправлений на рівні middleware,
      лише обійдений локально в одному контролері.
- [ ] `NumberOfOrders` — не атомарний інкремент (відомий, свідомо не чіпаний технічний борг).
- [ ] Продакшн store-id/secret/URL для monobank ще не підставлені — усе перевірено лише на
      сендбоксі (`u2-demo-ext.mono.st4g3.com` / `test_store_with_confirm`); є ще stage-середовище
      (`u2-ext.mono.st4g3.com`) перед реальним продом (`u2.monobank.com.ua`), його не проходили.
