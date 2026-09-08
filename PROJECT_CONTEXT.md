# PROJECT_CONTEXT.md — Battery Fly Backend

> Onboarding-довідка для нової сесії Claude Code.
> **Оновлено 2026-09-07** — дописано онлайн-еквайринг (розділ 5.2), якого не було в першій
> редакції файлу від 2026-09-04 (там він значився як «не почато» — це вже неправда),
> і статуси оплати + повторну оплату (гілка `feat/acquiring-status-retry`).
> Актуальний стан гілок: `master` == `origin/master` == `caced4b` (PR #133, еквайринг змерджено);
> локальна `feature/acquiring` відстає рівно на цей merge-коміт, свого коду в ній більше немає.
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
helpers/                    — HttpError, ctrlWrapper, sendEmail, cloudinary, monopay.js (HMAC/axios-клієнт),
                              telegram.js (сповіщення про замовлення й заявки)
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
| `payment` | String | required | вільний рядок без enum: спостережені значення `'card'` та інші людські підписи способів оплати (задає фронтенд), `'monopay_parts'` і `'card_online'` (проставляє бек у своїх контролерах) |
| `monopayOrderId` | String | default `null`, indexed | ID заявки на боці monobank (ПЧ) |
| `monopayState` / `monopaySubState` | String | default `null` | останній синхронізований стан ПЧ (SUCCESS/IN_PROCESS/FAIL + підстан) |
| `payParts` | Number | default `null` | кількість платежів ПЧ (3–25) |
| `isTest` | Boolean | default `false` | мітка тестового замовлення (сендбокс monobank) |
| `monopayReturnedSum` | Number | default `0` | скільки вже повернено клієнту (ПЧ) |
| `monopayReturns` | Array<Object> | default `[]` | історія повернень: `{store_return_id, sum, date, return_money_to_card}` |

**Поля онлайн-еквайрингу** (додані в тому ж плоскому `orderSchema`, за тим самим принципом, що
й monopay — nullable з власним префіксом, без нової колекції):

| Поле | Тип | Required / Default | Нотатка |
|---|---|---|---|
| `acquiringInvoiceId` | String | default `null`, indexed | ID рахунку в monobank; головний ключ пошуку у вебхуку |
| `acquiringStatus` | String | default `null` | статус оплати з monobank, зберігається **як є** (`created` ставить сам контролер при створенні) |
| `acquiringPageUrl` | String | default `null` | посилання на сторінку оплати monobank — те саме, що віддається фронту у відповіді на `create` |
| `acquiringFailureReason` | String | default `null` | `errCode: failureReason`, склеєні через `: ` (порожнє → `null`) |
| `acquiringModifiedDate` | String | default `null` | час останньої зміни на боці monobank; **зберігається рядком**, використовується для відсіву застарілих вебхуків |
| `acquiringPublicRef` | String | default `null`, indexed | випадковий 32-hex токен у `redirectUrl` (`?ref=…`); за ним публічний роут статусу знаходить замовлення. Належить **замовленню**, не рахунку — переживає повторну оплату |
| `acquiringInvoiceCreatedAt` | Date | default `null` | коли створено **поточний** рахунок; окремо від `createdAt` замовлення, бо після `resend` рахунок новий, а 24-годинне вікно життя посилання рахується від рахунку |
| `deliveredAt` | Date | default `null` | коли замовлення вперше перейшло в «Доставлено». Для середнього часу обробки на дашборді. **Пише лише сервер**, значення з тіла запиту ігнорується (адмінка шле назад увесь об'єкт замовлення) |

Joi-схеми в цьому ж файлі: `schemas.addOrder` (звичайне замовлення), `schemas.createMonopayOrder`
(ПЧ, той самий набір полів мінус `payment` плюс `payParts`, телефон валідується строгіше —
`/^\+380\d{9}$/`, бо йде напряму в monobank `client_phone`) і `schemas.createAcquiring`
(еквайринг — форма `addOrder` мінус `payment`, телефон **без** строгого патерну: карткова оплата
`client_phone` у monobank не використовує).

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

⚠️ **DELETE `/promo-code/:id` більше не блокується «Promocode in use».** Раніше
`deletePromocode` шукав будь-якого користувача з цим кодом у `user.promoCodes` і кидав
`500 'Promocode in use'` — тобто код ставав невидаляним НАЗАВЖДИ після першого ж
застосування (з трьох кодів на проді два не видалялись узагалі). `user.promoCodes` — це
історія використаних кодів, і потрібна вона рівно для одного: не дати клієнту застосувати
той самий код двічі (`getPromoCode` у `controllers/orders.js`). Видалення коду її не
ламає — назва просто лишається в історії, а знижки за нею вже не буде, бо самого коду
немає.
| | GET `/feedback` | authAdm | звернення |
| | PUT `/put-order/:id` | authAdm | **зміна статусу замовлення** — шукає за `_id` (не `numberOfOrder`, на відміну від GET-роутів вище) |
| | GET `/dashboard?period=…` | authAdm | агрегація для головної сторінки адмінки, один JSON — див. розділ 5.3 |
| `/api/monopay` | POST `/create` | validateBody(createMonopayOrder) | створити заявку ПЧ + Order |
| | POST `/callback` | — (HMAC-перевірка в тілі функції) | вебхук від monobank |
| | POST `/state/:id` | authAdm | ручний опитувальний запит статусу |
| | POST `/confirm/:id` | authAdm | підтвердити видачу товару → активує ПЧ |
| | POST `/reject/:id` | authAdm | відмовити у видачі |
| | POST `/resend/:id` | authAdm | повторний create після FAIL (той самий `store_order_id`) |
| | POST `/return/:id` | authAdm | повернення коштів за активною ПЧ (повне/часткове) |
| `/api/acquiring` | POST `/create` | validateBody(createAcquiring) | створити рахунок monobank + Order (`payment: 'card_online'`); відповідь `{orderNum, pageUrl}` |
| | POST `/webhook` | — (ECDSA-перевірка `X-Sign` у тілі функції) | вебхук monobank про зміну статусу оплати |
| | POST `/public-status` | validateBody(publicAcquiringStatus) | **публічний** статус оплати для сторінки `/payment/result`: тіло `{ref}` або `{invoiceId}`, у відповіді лише платіжні поля |
| | GET `/status/:id` | authAdm | ручний запит статусу рахунку в monobank + синхронізація в базу |
| | POST `/resend/:id` | authAdm | повторна оплата: віддає живе посилання або створює новий рахунок на те саме замовлення |

Усюди `:id` для `/api/monopay/*`, `/api/acquiring/status/:id`, `/api/acquiring/resend/:id` і
GET-роутів адмінки — це `numberOfOrder`, окрім `put-order/:id`, де це Mongo `_id`.

## 5. Інтеграції monobank

### 5.1. Покупка частинами (`monopay`) — **у проді, змерджено в master**

Архітектура: роут → контролер → helper. Helper — єдине місце, що знає про HTTP до monobank.

- **`helpers/monopay.js`** — окремий axios-інстанс `monopayClient = axios.create({ baseURL: process.env.MONOPAY_BASE_URL })`; `signBody()` (HMAC-SHA256 → base64); `verifyCallbackSignature()` (звірка вхідного підпису через `crypto.timingSafeEqual`); `monopayPost(path, payload)` — єдина точка виходу: `JSON.stringify` **один раз**, підписати той самий рядок, відправити рядком (не об'єктом), заголовки `store-id` + `signature`; білдери тіл — `buildCreatePayload`, `buildOrderIdPayload`, `buildReturnPayload`.
- **`controllers/monopay.js`** — 7 функцій: `createMonopayOrder`, `monopayCallback`, `getMonopayState`, `confirmMonopayOrder`, `rejectMonopayOrder`, `resendMonopayOrder`, `returnMonopayOrder`. Усі, крім `create`/`callback`, шукають замовлення через приватний хелпер `findMonopayOrder(numberOfOrder)` (404 якщо нема або нема `monopayOrderId`).
- **`routes/api/monopay.js`** — див. таблицю вище.
- **Статус:** усі 7 ендпоінтів у `master` (PR #128–#132), пройшли перевірку на сендбоксі monobank (`test_store_with_confirm`), включно з тестовими номерами `...1..4` і симуляцією підписаного callback.

### 5.2. Онлайн-еквайринг (`acquiring` / `card_online`) — **у `master`, задеплоєно на Render**

**Статус на 2026-09-07: у проді.** Код змерджено в `master` (PR #133, merge-коміт `caced4b`),
Render деплоїть з `master` автоматично. Перевірено наживо: `GET /api/acquiring/status/1` без
токена віддає `401 {"message":"Not authorized"}` (а не `404 Not found`) — роутер змонтований.
⚠️ Працює на **тестовому** `ACQUIRING_TOKEN`, бойові ключі ще не підставлені (розділ 8).

Файли: `helpers/acquiring.js`, `controllers/acquiring.js`, `routes/api/acquiring.js`, 5 нових
полів у `models/order.js`, Joi-схема `schemas.createAcquiring`, монтування в `app.js`.
Бекап перед правками — `_backups/acquiring-20260904-184201/`.

**Головна відмінність від ПЧ: підпису вихідних запитів немає.** Автентифікація — заголовок
`X-Token`, тому тіло віддається axios **об'єктом**, без ручного `JSON.stringify` (на відміну від
`monopayPost`, де підпис рахується від точного рядка тіла). ECDSA-підпис тут потрібен лише для
перевірки **вхідних** вебхуків. Не переносити HMAC-звички з 5.1 сюди й навпаки.

#### `helpers/acquiring.js`

- `acquiringClient = axios.create({ baseURL: process.env.ACQUIRING_BASE_URL })` — окремий інстанс
  (глобальний `axios.defaults.baseURL` зайнятий Новою Поштою, див. розділ 7);
- `acquiringPost` / `acquiringGet` — єдині точки виходу, обидві з `X-Token`;
- `toMinor()` — гривні → копійки, `NaN` для нечислового (щоб виклик міг це відсіяти);
- `buildBasketOrder(cartItems)` — проєкція кошика у формат monobank
  `{name, qty, sum, total, code, unit}`, де `sum` — ціна за **одиницю** в копійках, `total` — за
  всю кількість. Читає `item.name / quantityOrdered / price / totalPrice / codeOfGood || _id`.
  **Це лише читання** — сам масив `cartItems` зберігається в базі байт-у-байт як прийшов з фронта.
  Якщо хоч одна позиція неповна — повертає `null`, і `basketOrder` просто не відправляється
  (краще втратити красивий кошик на сторінці оплати, ніж зламати клієнту оплату);
- `buildInvoicePayload()` — `amount` рахується з `together` (сума **після** знижки, бо саме її
  платить клієнт). `basketOrder` дає суму **до** знижки, тому знижка йде окремо в
  `merchantPaymInfo.discounts`, і перед відправкою звіряється тотожність
  `basketTotal - discount === amount`; не зійшлося — `basketOrder` і `discounts` не додаються
  взагалі (лишається чистий `amount`), у консоль іде `console.warn`.
  ⚠️ `discounts[].value` — у **гривнях** (`multipleOf 0.01`), на відміну від
  `sum`/`total`/`amount` у копійках. Поле йде на фіскалізацію (checkbox/ПРРО) і **ще не
  перевірене наживо** замовленням з промокодом;
- `getMerchantPubKey(forceRefresh)` — ключ з `GET /api/merchant/pubkey` кешується в пам'яті
  процесу (ротується на боці банку). Примусовий refresh тротлиться 60 с: інакше потік вебхуків
  з навмисно невалідним підписом перетворився б на потік запитів до monobank (429);
- `verifyWebhookSignature(rawBody, xSign, pubKeyBase64)` — ECDSA/SHA256 над `req.rawBody`
  (`X-Sign` — base64 DER-підпису, ключ — base64 PEM), як у прикладі з офіційної специфікації.

#### `controllers/acquiring.js` — 3 функції

| Функція | Що робить |
|---|---|
| `createAcquiringOrder` | інкремент `NumberOfOrders` → `Order.create({..., payment: 'card_online', acquiringStatus: 'created'})` → `POST /api/merchant/invoice/create` → записує `acquiringInvoiceId` + `acquiringPageUrl` → пише промокод/номер у профіль клієнта → лист «замовлення прийнято, очікуємо оплату» → відповідь `{orderNum, pageUrl}` |
| `acquiringWebhook` | перевірка `X-Sign` (одна повторна спроба зі свіжим pubkey) → пошук замовлення за `acquiringInvoiceId`, фолбек за `reference` (= `numberOfOrder`) → відсів застарілих вебхуків за `modifiedDate` → оновлює `acquiringStatus` / `acquiringModifiedDate` / `acquiringFailureReason` |
| `getAcquiringStatus` | `authAdm`; `GET /api/merchant/invoice/status?invoiceId=…` → перезаписує ті самі поля **без** звірки `modifiedDate` (прямий запит авторитетніший за вебхук) → віддає `{orderNum, status, modifiedDate, failureReason, amount, finalAmount}` |
| `getPublicAcquiringStatus` | **без авторизації**; шукає замовлення за `acquiringPublicRef` або `acquiringInvoiceId`; якщо статус не фінальний — тягне свіжий з monobank (тротлінг 2 с); віддає `{orderNum, status, failureReason, together, pageUrl}` |
| `resendAcquiringOrder` | `authAdm`; звіряє статус → відмовляє при `success`/`hold`/`reversed` → віддає той самий `pageUrl`, якщо рахунок живий, інакше створює новий рахунок і оновлює поля; віддає `{orderNum, status, pageUrl, invoiceId, reused}` |

Свідомі рішення в контролері (неочевидні з коду):

- **Робочий `status` замовлення вебхук не чіпає.** Оплата й логістика — дві незалежні осі:
  `status` (`Нове`/`В роботі`/…) лишається за менеджером через `PUT /api/adm/put-order/:id`.
- **Order створюється ДО рахунку.** Якщо monobank не відповість — у базі лишиться замовлення з
  `acquiringStatus: 'created'` і **без** `acquiringInvoiceId`, а клієнт отримає `502`. Такі
  «осиротілі» замовлення — очікувана поведінка, не баг: номер уже витрачено, менеджер бачить
  замовлення і може зв'язатись.
- **Вебхук завжди відповідає `200`** — і коли замовлення не знайдено, і коли вебхук застарілий.
  Інакше monobank повторюватиме доставку.
- **Порядок вебхуків не гарантований** — актуальним вважається той, у кого `modifiedDate`
  більший; менший або рівний ігнорується.
- **Гість не валить запит.** `User.findOne({email})` обгорнутий `if (user)` — на відміну від
  `addOrder`, де замовлення без зареєстрованого користувача падає.
- **Лист не блокує видачу `pageUrl`** — рахунок уже створено, збій пошти лише логується.
- URL-и будуються з env: `redirectUrl = ${FRONTEND_URL}/payment/result?order=${numberOfOrder}`,
  `webHookUrl = ${PUBLIC_URL}/api/acquiring/webhook`.

#### Публічний статус і повторна оплата (гілка `feat/acquiring-status-retry`)

**Чому в `redirectUrl` не `invoiceId`.** Планувалось передавати саме його (номер замовлення
послідовний — `100201`, `100202`… — і чужий статус діставався б перебором). Але `redirectUrl`
їде **всередині** запиту `invoice/create`, а `invoiceId` приходить лише у **відповіді** на
нього; своїх параметрів monobank до `redirectUrl` не додає. Тому бек генерує власний
32-hex токен (`crypto.randomBytes(16)`) **до** створення рахунку, кладе його в
`acquiringPublicRef` і в `redirectUrl`. Невгадуваність та сама. Публічний роут приймає
**і** `ref`, **і** `invoiceId`; `numberOfOrder` не приймає свідомо.

**Що віддає публічний роут:** тільки `orderNum`, `status`, `failureReason`, `together` і
`pageUrl`. ⚠️ Ні `cartItems`, ні імені, ні телефону, ні email — роут відкритий, посилання
може відкрити будь-хто, кому воно потрапило.

**`pageUrl` для повтору віддається лише при `status === 'failure'`** і поки рахунок живий
(24 год від `acquiringInvoiceCreatedAt`). У `created`/`processing` повторювати нічого,
а `success`/`reversed`/`expired` — стани, де повтор зайвий або неможливий.

**`failure` свідомо НЕ вважається фінальним статусом** (`isFinalStatus`): клієнт може
оплатити ще раз тим самим рахунком, і статус зміниться на `success`.

**Про `expired` вебхук не приходить взагалі** (дока: вебхуки шлються «окрім статусу
expired»). Тому публічний роут при нефінальному статусі сам питає monobank, а не чекає
вебхука — інакше протермінований рахунок назавжди лишався б у `created`.

**Захист від вебхука старого рахунку.** Після `resend` у замовлення новий `invoiceId`, але
вебхук від попереднього рахунку ще може долетіти і знайти замовлення за `reference`
(= `numberOfOrder`). Такий вебхук тепер ігнорується з логом: приймаються лише ті, чий
`invoiceId` збігається з поточним.

**Guard від подвійної оплати.** `resend` спершу звіряє реальний статус у monobank і
відмовляє (`409`) при `success`, `hold` і `reversed` — щоб менеджер не видав посилання на
вже оплачене замовлення.

#### Статуси оплати

Бек зберігає `status` з monobank **як є, без власного маппінгу** — ні enum, ні переліку в коді
немає, мапити в людські підписи має UI. За докою monobank набір такий: `created`, `processing`,
`hold`, `success`, `failure`, `reversed`, `expired` (⚠️ перед побудовою UI звірити з актуальною
специфікацією — у коді цей список не зафіксований).

⚠️ **Пастка з документацією monobank:** повна схема тіла запиту `POST /api/order/create` для ПЧ
рендериться клієнтським JS (Redoc-подібна сторінка) — простий `curl`/fetch показує лише спрощений
приклад з головної сторінки, реальні обов'язкові поля (`invoice`, `available_programs`, `products`)
видно тільки в реальному браузері з розгорнутими акордеонами схеми. Для еквайрингу варто одразу
перевірити відповідний розділ `api-docs/acquiring/...` так само — через браузер, не через простий
HTTP-фетч.

### 5.3. Дашборд адмінки (`GET /api/adm/dashboard`)

Не інтеграція monobank, але живе поруч за логікою — це агрегація по тих самих
замовленнях. Гілка `feat/admin-dashboard`.

`period` = `today` | `week` | `month` (дефолт, +`month=YYYY-MM`) | `custom` (+`from`/`to`).
Один запит віддає весь дашборд; **усе рахує MongoDB** — у Node не приїжджає
жодного сирого замовлення. Пайплайни — в окремому `helpers/dashboard.js`,
бо `controllers/admin.js` уже ~1000 рядків.

Блоки відповіді: `pulse` (виторг / к-сть / середній чек / середній час обробки,
кожен з `change` у % до попереднього періоду), `alerts` (`unpaidOnline`,
`stuckOrders`, `lowStock` — **списками**, не лічильниками), `ordersInWork`,
`topCustomers`, `inactiveCustomers`, `revenueByCategory`, `paymentMethods`,
`customersNewVsReturning`, `revenueByDay`.

Рішення, які не видно з коду:

- **Скасовані замовлення не рахуються у виторг** (`paidMatch` скрізь відсікає
  `status: 'Скасовано'`). Інакше revenue і середній чек брехали б.
- **Періоди — у київському поясі.** Render працює в UTC, і без цього «сьогодні»
  починалося б о 03:00 за Києвом. `startOfKyivDay()` рахує зміщення через
  `Intl`, тож перехід на літній час враховано.
- **Попередній період зсувається на ЦІЛУ кількість діб** (1/7), а не на
  тривалість вікна. Для «сьогодні» це дає вчора до тієї ж години; зсув на
  тривалість зіставляв би ранок сьогодні з вечором учора.
- **`month` — КАЛЕНДАРНИЙ місяць, не ковзні 30 днів.** Власник мислить
  місяцями («скільки було в липні»), а межа, що повзе разом із сьогоднішньою
  датою, робить сусідні відкриття дашборду непорівнюваними. Без параметра —
  поточний місяць, із `month=YYYY-MM` — будь-який інший; некоректне значення
  дає `400`, а не тихо інший місяць.
  ⚠️ Порівняння йде з **такою самою частиною** попереднього місяця: 7 днів
  вересня проти повного серпня показували б обвал на 70%, якого немає. Для
  завершеного місяця обрізання нічого не змінює — виходить повний попередній.
  Межі рахуються в київському поясі з подвійним уточненням зсуву, бо між
  серединою місяця і його першим числом може пролягати перехід на літній час.
- **`revenueByCategory` рахує ЧИСТИЙ виторг: знижка розподіляється між
  позиціями пропорційно.** Знижка (промокод і ручна) живе на рівні замовлення —
  `together` = сума позицій − `discountValue`, — тож проста сума `cartItems`
  давала валове число, яке не сходилось із «Пульсом». На реальних даних вересня
  2026 це було 103 370 ₴ за категоріями проти 98 580 ₴ обороту: рівно 4 790 ₴
  ручних знижок по п'яти замовленнях. Тепер кожна позиція дає
  `gross × (together / itemsGross)`, і сума категорій збігається з виторгом
  копійка в копійку. Замовлення з `together = 0` (є одне легасі, #100004) дає
  нуль і в категоріях — «Пульс» рахує його нульовим, і категорії мусять теж,
  інакше збіг знову ламається.
- **`percentChange` віддає `null`, а не `0`**, коли попередній період порожній —
  «нема з чим порівнювати» і «без змін» це різні речі, і UI має показати прочерк.
- **Середній час обробки міряється по даті ДОСТАВКИ**, не створення: питання
  «як швидко ми віддаємо замовлення зараз». Замовлення без `deliveredAt`
  (доставлені до появи поля) не враховуються — тому перші тижні там буде
  «збирається».
- **Ключ клієнта — email, інакше телефон.** Окремої колекції клієнтів для
  замовлень немає, гості оформлюють без реєстрації.
- **Оптовик — статус, який заробляється ОДИН РАЗ і не втрачається.** Клієнт є
  оптовиком, якщо *хоч колись* мав >3 замовлень і >50 000 ₴ у межах будь-якого
  30-денного вікна (`aggregateWholesaleCustomers` будує вікно від кожного
  замовлення вперед на 30 днів).
  ⚠️ Раніше статус перераховувався у вікні перед останнім замовленням — і це
  давало систематично хибний результат: перед тим як зникнути, клієнт майже
  завжди зменшує темп, тож в останньому вікні порогу вже не було. На живих
  даних 2026-09-07 стара логіка знаходила **1** оптовика, нова — **4**
  (три з них зникли понад рік тому й були невидимі взагалі).
- **`inactiveCustomers` прив'язаний до ВИБРАНОГО періоду:** оптовики, у яких
  **нуль замовлень усередині періоду**. Жорсткого вікна «20–60 днів» більше
  немає — воно ховало саме тих, хто зник давно, хоча це найсильніший сигнал.
  Мовчання рахується **станом на кінець періоду** (`daysSilentAtPeriodEnd`), а
  не на сьогодні: у вибірці за липень має бути видно липневу тишу, навіть якщо
  в серпні клієнт повернувся. Саме через це не можна фільтрувати за
  `lastOrderAt < from` — такий клієнт випав би.
- **`lowStock` — це `0 < quantity < 5`**, товари з нулем свідомо не показуються
  (вони вже закінчились, це задача закупівлі, а не сигнал «встигни докупити»).
  Збірки (`ProductZbirky`) додаються до звичайних товарів — для власника це
  той самий склад.
- **`stuckOrders` — поріг 24 години** (замовлення провисіло в «Нове» довше доби).
  Спершу було три дні; на практиці це надто пізно. Разом із днями віддається
  `hoursWaiting`, бо з добовим порогом «1 день» показувалось би і для 25, і для
  47 годин.
- **`unpaidOnline` не чіпає замовлення молодші за 2 години** — клієнт цілком
  може бути на сторінці банку просто зараз.
- **Числові поля конвертуються через `$convert` з `onError: 0`.** `cartItems`
  не має схеми, а `price` у типах фронту оголошений як `number | string` —
  одне зіпсоване легасі-значення інакше поклало б увесь дашборд.

⚠️ **`deliveredAt` і `updateOrderById`.** Правка свідомо мінімальна: зачеплено
**лише** фінальний `findOneAndUpdate`. Гілки «В роботі» (лист + списання
залишків) і «Скасовано» (повернення залишків) мають власні `return` і не
змінені взагалі. `deliveredAt` вирізається з `req.body` і пишеться сервером
один раз — при першому переході в «Доставлено».

---

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

**Telegram-сповіщення:**
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (один чат і для замовлень, і для заявок),
`ADMIN_URL` (база для посилання «Відкрити в адмінці»)

**monobank / Онлайн-еквайринг:**
`ACQUIRING_BASE_URL`, `ACQUIRING_TOKEN` (значення заголовка `X-Token`),
`PUBLIC_URL` (база для `webHookUrl`), `FRONTEND_URL` (база для `redirectUrl` — сторінка
`/payment/result` на клієнтському сайті)

⚠️ `.env.example` **частково оновлений**: при роботі над еквайрингом туди додали `PUBLIC_URL`,
`FRONTEND_URL`, `ACQUIRING_BASE_URL`, `ACQUIRING_TOKEN`, але **трьох monopay-змінних там досі
немає** — `MONOPAY_BASE_URL`, `MONOPAY_STORE_ID`, `MONOPAY_SECRET`. Варто дописати при нагоді.

## 6.1. Telegram-сповіщення (`helpers/telegram.js`)

Одне повідомлення в один чат на кожне нове замовлення (усі три способи оформлення)
і на кожну заявку з форми зв'язку. Точки виклику: `addOrder` (orders.js),
`createMonopayOrder` (monopay.js), `createAcquiringOrder` (acquiring.js),
`addFeedBack` (feedback.js).

- **Окремий axios-інстанс**, як у monopay: у `controllers/orders.js` глобальному axios
  прописаний baseURL Нової Пошти, спільний клієнт зламав би або доставку, або сповіщення.
- ⚠️ **Канал best-effort і НЕ МОЖЕ нічого зламати.** `sendTelegramMessage` ніколи не кидає
  (усе в try/catch), `notifyNewOrder` / `notifyNewFeedback` додатково ловлять помилки
  *складання тексту* — саме тому виклик у контролері можна робити **без `await`**
  (не додає ~300мс до відповіді) без ризику unhandled rejection. Перевірено: з
  завідомо невірним токеном заявка створюється, відповідь 200, у логах лише
  `[telegram] send failed`.
- ⚠️ **`parse_mode: 'HTML'` вимагає екранування.** Ім'я, коментар, назва товару чи адреса
  з `<` або `&` роблять повідомлення невалідним, і Telegram відхиляє його ЦІЛКОМ.
  Усе, що прийшло ззовні, проходить через `escapeHtml`.
- Без `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` хелпер мовчки виходить, не роблячи запиту —
  локальна розробка не сипле помилками.
- Кошик обрізається на 10 позиціях (ліміт повідомлення 4096 символів), текст — на 3900.
- Способи оплати: машинні коди (`card_online`, `monopay_parts`, `card`) перекладаються,
  решта значень віддаються **як є** — `Накладений платіж`, `Рахунок для юридичних осіб
  або ФОП` і легасі вже українською, а білий список мовчки перетворив би їх на прочерк.
- Статус оплати дописується лише для `card_online`: у накладеного платежу чи рахунку
  такого стану не існує взагалі.
- Посилання: `${ADMIN_URL}/admin/orders/${numberOfOrder}` — адмінка відкриває замовлення
  саме за номером, а не за `_id`.

⚠️ **Заявка з форми зв'язку має інші поля, ніж може здатися:** `name`, `tel`,
`comment` (у запиті приходить як `text`) і власний `numberOfOrder` з того самого
лічильника, що й замовлення. **Email у заявці не зберігається взагалі.**

## 6.2. Статуси замовлення (`helpers/orderStatus.js`)

Ланцюжок статусів **різний залежно від способу оплати** — там, де гроші йдуть
через банк одразу, стану «Очікує оплати» не існує:

| Спосіб оплати | Ланцюжок |
|---|---|
| Рахунок ЮО/ФОП, Накладений платіж | Нове → Очікує оплати → Оплачено → Відправлено → Доставлено |
| `card_online`, `monopay_parts` | Нове → Оплачено → Відправлено → Доставлено |

«Скасовано» доступне з будь-якого стану, крім «Доставлено». Конвеєр лінійний:
перестрибнути або відкотитись назад не можна. Валідація стоїть **на беку**
(`isTransitionAllowed`), а не лише в UI: адмінка на Netlify може відстати від
бека на Render, а перестрибнутий статус ламає і залишки, і звітність.

⚠️ **Списання складу перенесене з «В роботі» на «Оплачено».** Старий статус
«В роботі» більше не використовується, і разом із ним зник би тригер списання —
мовчки. Повернення на залишки прив'язане до нового поля **`stockDeducted`**, а
НЕ до статусу: скасувати можуть і з «Оплачено», і з «Відправлено», а прив'язка
до статусу пливе при кожній зміні ланцюжка.

⚠️ **`applyStockChange` використовує `$inc`, а не запис абсолютного значення.**
Стара версія рахувала `item.quantity ± quantityOrdered`, де `item.quantity`
приходило з ТІЛА ЗАПИТУ. При підтвердженні це працювало (адмінка перед тим
підтягує свіжі quantity), а при скасуванні вона шле кошик як є — зі стоком на
момент ОФОРМЛЕННЯ. На тесті це давало 13 замість 10: товар з'являвся з повітря.

⚠️ **Лист клієнту при зміні статусу більше НЕ надсилається.** Він висів на
`if (status === "В роботі")` разом зі списанням і містив реквізити для оплати.
За рішенням власника лист вимкнено до Блоку 3-4, де шаблони переробляються.
Разом із блоком прибрано `sendEmail` і `MAIL_USER` з `controllers/admin.js`.

**Нові поля Order:** `ttn` (String, null — вводиться при «Відправлено», бек
вимагає його для цього статусу), `prepaymentAmount` (Number, null — 20% від
`together`, рахується один раз при створенні і лише для накладеного платежу),
`stockDeducted` (Boolean). Обидва серверні поля (`deliveredAt`, `stockDeducted`)
вирізаються з тіла запиту перед записом.

**Легасі:** статус «В роботі» у ланцюжках відсутній, але замовлення, що вже в
ньому, не замуровані — з невідомого статусу дозволено перейти в будь-який,
крім повернення в «Нове».

## 6.3. Налаштування магазину (`models/settings.js`)

Один документ на всю базу (singleton): `prepaymentPercent`, `requisites`,
`messageTemplates`. Читається лише через `getSettings()` — find-or-create, тож
розділ ніколи не відкривається порожнім і жоден виклик не падає на свіжій базі.
`GET`/`PUT /api/adm/settings` (authAdm).

⚠️ **Ключі шаблонів — СЛАГИ, а не сирі значення з бази.** `payment` там буває
кирилицею з пробілами (`Накладений платіж`), і такий рядок як ключ Map ламається
від будь-якої правки формулювання. Мапа: `card_online` → `card_online`,
`monopay_parts` → `monopay_parts`, `Накладений платіж` → `cod`, **решта
(рахунок + усе легасі) → `invoice`**. Ключ = `{слаг оплати}_{слаг статусу}`,
напр. `cod_awaiting_payment`. У «Нове» шаблону немає взагалі.

⚠️ **`calculatePrepayment` лишилась ЧИСТОЮ — відсоток приходить аргументом.**
Читання Settings усередині зробило б її асинхронною й додало запит до бази в
кожне створення замовлення. `PREPAYMENT_PERCENT = 20` лишається запобіжником.

⚠️ **`messageTemplates` — Map, а не Object.** У Mongoose поле типу Object з
довільними ключами не відстежує зміни окремих ключів, і збереження одного
шаблону тихо не записувалось би без `markModified`.

⚠️ **`renderTemplate` викидає ВЕСЬ рядок, у якому плейсхолдер порожній.**
Підстановка порожнього рядка дає «Номер ТТН: » у повідомленні клієнту — це
гірше, ніж відсутній рядок. Ціна: рядок із двома плейсхолдерами, де порожній
лише один, зникає повністю. Невідомий плейсхолдер (друкарська помилка власника)
лишається як є — через нього рядок не викидається.

`PUT` записує лише ключі з `getAllTemplateKeys()`: помилка в адмінці інакше
засмічує документ полями, які ніхто не читає. Відсоток валідується на беку
(0–100), бо бере участь у розрахунку грошей.

## 6.4. Готовий текст повідомлення (`GET /api/adm/order-message/:numberOfOrder`)

Шаблон із налаштувань + підставлені дані замовлення. `?status=` необов'язковий,
за замовчуванням береться поточний статус замовлення. Відповідь:
`{ result: { message, status, templateKey } }`, де `message: null` означає «для
цього статусу тексту не передбачено» (напр. «Нове») — це нормальний стан, а не
помилка, тож і код 200.

⚠️ **Окремий endpoint, а не поле у відповіді на зміну статусу.** Той самий текст
треба показувати ще й повторно — кнопкою в картці, без жодної зміни статусу.
Один маршрут обслуговує обидва випадки.

⚠️ **Статус приходить ПАРАМЕТРОМ, а не читається з бази.** Адмінка запитує
текст одразу після збереження нового статусу, і покладатись на те, що запис уже
видно наступному читанню, — це гонка.

Уся робота — на готових `getTemplateKey` і `renderTemplate` з Блоку 2, нічого не
переписано. ТТН потрапляє в текст тому, що зберігається ДО запиту тексту (див.
порядок модалок в адмінці).

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
  monopayOrderId, createdAt, status` — повернень (5.1 return) там ще нема, **і жодного
  acquiring-поля теж**: `acquiringStatus`, `acquiringPageUrl`, `acquiringInvoiceId`,
  `acquiringFailureReason`, `acquiringModifiedDate` — **виправлено** в
  `feat/acquiring-status-retry`: усі пʼять полів додані у whitelist. `acquiringPublicRef`
  свідомо **не** доданий — адмінці він не потрібен, а це фактично ключ доступу до статусу.
  `get-order/:id` натомість віддає документ **цілком** (`Order.findOne(...)` без проєкції).
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
- **Два різні механізми підпису — не плутати.** ПЧ: HMAC-SHA256 на **вихідних** запитах
  (підписується точний рядок тіла) + перевірка вхідного callback. Еквайринг: **жодного підпису
  на вихідних** (лише `X-Token`), ECDSA/SHA256 — лише на **вхідному** вебхуку. Обидва вхідні
  механізми читають `req.rawBody`.
- **`acquiringModifiedDate` зберігається рядком, не датою.** Порівняння йде через
  `new Date(...).getTime()` у момент обробки. Якщо колись міняти тип — переписати і відсів
  застарілих вебхуків.
- **Ідемпотентності `create` немає.** Кожен `POST /api/acquiring/create` витрачає новий
  `numberOfOrder` і створює новий рахунок. Для сценарію «повторна оплата» це означає, що
  наївний повторний виклик `create` наплодить дублі замовлень — потрібен окремий шлях
  (перевикористання `acquiringPageUrl` або новий рахунок на існуючий `numberOfOrder`).
- **`_backups/` — навмисна конвенція, не сміття.** Кожна сесія редагування коду в цьому репо
  створює `_backups/<фіча>-<таймстемп>/` зі знімком файлів до правок і комітить їх разом з кодом.

## 8. Що в процесі / TODO

- [x] Онлайн-еквайринг monobank (`invoice/create` + вебхук + status) — **зроблено й змерджено
      в `master`** (PR #133), працює в проді на тестовому токені. Деталі — розділ 5.2.
- [ ] **Бойові ключі еквайрингу** (`ACQUIRING_TOKEN` / `ACQUIRING_BASE_URL` прод) — не підставлені.
- [x] **`get-orders` віддає acquiring-поля** — зроблено в `feat/acquiring-status-retry`.
- [x] **Публічний ендпоінт статусу оплати** — `POST /api/acquiring/public-status`.
- [x] **Повторна оплата** — `POST /api/acquiring/resend/:id` (адмінка) + `pageUrl` у публічному
      статусі (клієнт).
- [x] **Перевірено наживо** 2026-09-07 на задеплоєному беку (замовлення №100206, тестовий
      токен, мерчант «Test Caption»): `create` → `basketOrder` коректно показався на сторінці
      банку → симульована відмова «Недостатньо коштів» → вебхук приніс
      `failure` + `59: На картці недостатньо коштів для завершення покупки` →
      `public-status` віддав `pageUrl` → повтор **на тому самому рахунку** → `success`,
      `pageUrl` перестав віддаватись. Пошук і за `ref`, і за `invoiceId` працює.
      Сама сторінка банку теж пропонує «Повторити платіж» — припущення ТЗ підтвердилось.
- [ ] 🔴 **`FRONTEND_URL` на Render = `http://localhost:3000`.** Тому `redirectUrl` веде на
      локальну машину, і після оплати клієнт нікуди не потрапляє. Перевірено живим
      редиректом. Змінити на `https://batteryfly.com.ua` **до** запуску.
- [ ] **Адмінські роути наживо не перевірені** — `GET /acquiring/status/:id`,
      `POST /acquiring/resend/:id` і `GET /adm/dashboard` під `authAdm`,
      потрібен логін адміна.
- [ ] **Агрегації дашборду не проганялись на реальних даних** — локально немає
      ні MongoDB, ні доступу до прод-бази. Перевірені лише чисті функції
      (періоди, `percentChange`) і монтування роуту. Перший запит після
      деплою варто відкрити при собі.
- [ ] `validity` у `invoice/create` не передається — діє дефолт monobank (24 год), і саме на
      нього спирається `isInvoiceStillValid`. Якщо колись задавати `validity` явно — синхронізувати
      з константою `INVOICE_VALIDITY_MS`.
- [ ] **`merchantPaymInfo.discounts` не перевірений наживо** — потрібне тестове замовлення з
      промокодом на пісочниці (фіскалізація checkbox/ПРРО).
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
