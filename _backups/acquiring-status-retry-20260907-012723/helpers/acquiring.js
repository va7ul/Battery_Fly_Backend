const crypto = require('crypto');
const axios = require('axios');

// Окремий інстанс: глобальний axios.defaults.baseURL зайнятий Новою Поштою
// (controllers/orders.js), чіпати його не можна.
const acquiringClient = axios.create({ baseURL: process.env.ACQUIRING_BASE_URL });

// ISO 4217, гривня.
const CCY_UAH = 980;

// На відміну від "Покупки частинами" (helpers/monopay.js) еквайринг НЕ вимагає
// HMAC-підпису вихідних запитів: автентифікація — це заголовок X-Token, тому тіло
// можна віддавати axios обʼєктом, без ручного JSON.stringify.
function authHeaders() {
  return { 'X-Token': process.env.ACQUIRING_TOKEN };
}

async function acquiringPost(path, payload) {
  return acquiringClient.post(path, payload, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
  });
}

async function acquiringGet(path, params) {
  return acquiringClient.get(path, {
    headers: authHeaders(),
    params,
  });
}

// Гривні -> копійки. NaN для нечислових значень, щоб виклик міг це відсіяти.
function toMinor(amount) {
  const value = Number(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

// Проєкція cartItems у формат monobank basketOrder. Сам масив cartItems
// у базі зберігається як прийшов з фронтенду, байт-у-байт — тут лише читання.
// Поля позиції звірені з controllers/admin.js (лист "прийнято в роботу" і
// списання залишків): { _id, name, codeOfGood, quantity, quantityOrdered, price, totalPrice }.
// За специфікацією monobank обовʼязкові name, qty, sum, code; sum — ціна за
// ОДИНИЦЮ товару в копійках, total — за всю кількість.
// Якщо хоч одна позиція неповна — повертаємо null і basketOrder просто не
// відправляється: рахунок опційний за цим полем, і краще втратити красивий
// кошик на сторінці оплати, ніж зламати клієнту оплату.
function buildBasketOrder(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return null;
  }

  const basket = [];

  for (const item of cartItems) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const name = item.name;
    const qty = Number(item.quantityOrdered);
    const sum = toMinor(item.price);
    const code = item.codeOfGood || item._id;

    if (!name || !code || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(sum) || sum <= 0) {
      return null;
    }

    const itemTotal = toMinor(item.totalPrice);

    basket.push({
      name: String(name),
      qty,
      sum,
      total: Number.isFinite(itemTotal) && itemTotal > 0 ? itemTotal : sum * qty,
      code: String(code),
      unit: 'шт.',
    });
  }

  return basket;
}

// Тіло POST /api/merchant/invoice/create.
// amount — у копійках, рахується з together (сума ПІСЛЯ знижки), бо саме її
// платить клієнт. basketOrder дає суму ДО знижки, тому знижка передається
// окремим обʼєктом merchantPaymInfo.discounts, і перед відправкою ми звіряємо
// тотожність basketTotal - discount === amount. Не зійшлося — basketOrder і
// discounts не додаємо взагалі, лишається чистий amount.
function buildInvoicePayload({ numberOfOrder, together, discountValue, cartItems, redirectUrl, webHookUrl }) {
  const amount = toMinor(together);

  const merchantPaymInfo = {
    reference: String(numberOfOrder),
    destination: `Замовлення №${numberOfOrder}`,
  };

  const basketOrder = buildBasketOrder(cartItems);

  if (basketOrder) {
    const discount = Number(discountValue);
    const discountUah = Number.isFinite(discount) && discount > 0 ? discount : 0;
    const basketTotal = basketOrder.reduce((acc, item) => acc + item.total, 0);

    if (basketTotal - toMinor(discountUah) === amount) {
      merchantPaymInfo.basketOrder = basketOrder;

      if (discountUah > 0) {
        // value тут — у гривнях (специфікація: number, minimum 0.01,
        // multipleOf 0.01), на відміну від sum/total/amount у копійках.
        // Поле використовується лише для фіскалізації через checkbox/ПРРО,
        // тож варте окремої перевірки на пісочниці замовленням з промокодом.
        merchantPaymInfo.discounts = [{
          type: 'DISCOUNT',
          mode: 'VALUE',
          value: Math.round(discountUah * 100) / 100,
        }];
      }
    } else {
      console.warn(`acquiring: basketOrder не узгоджений з amount для замовлення ${numberOfOrder} (basketTotal=${basketTotal}, discount=${toMinor(discountUah)}, amount=${amount}) — відправляємо рахунок без basketOrder`);
    }
  }

  return {
    amount,
    ccy: CCY_UAH,
    merchantPaymInfo,
    redirectUrl,
    webHookUrl,
  };
}

// Публічний ключ для перевірки підпису вебхуків. Ключ ротується, тому тримаємо
// його в памʼяті процесу з можливістю примусово перечитати.
let cachedPubKey = null;
let pubKeyFetchedAt = 0;

// Примусовий refresh тротлиться: інакше потік вебхуків з навмисно невалідним
// підписом перетворювався б на потік запитів до monobank (429).
const PUBKEY_REFRESH_INTERVAL_MS = 60 * 1000;

async function getMerchantPubKey(forceRefresh = false) {
  const now = Date.now();
  const refreshAllowed = forceRefresh && now - pubKeyFetchedAt >= PUBKEY_REFRESH_INTERVAL_MS;

  if (cachedPubKey && !refreshAllowed) {
    return cachedPubKey;
  }

  const response = await acquiringGet('/api/merchant/pubkey');
  const key = response.data && response.data.key;

  if (!key) {
    throw new Error('monobank pubkey response has no "key" field');
  }

  cachedPubKey = key;
  pubKeyFetchedAt = now;

  return cachedPubKey;
}

// ECDSA/SHA256 над сирими байтами тіла запиту (req.rawBody), як у прикладі
// NodeJs з офіційної специфікації еквайрингу: X-Sign — base64 DER-підпису,
// публічний ключ — base64 PEM з GET /api/merchant/pubkey.
function verifyWebhookSignature(rawBody, xSignHeader, pubKeyBase64) {
  if (!rawBody || !xSignHeader || !pubKeyBase64) {
    return false;
  }

  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(rawBody);
    verify.end();

    return verify.verify(Buffer.from(pubKeyBase64, 'base64'), Buffer.from(xSignHeader, 'base64'));
  } catch (error) {
    return false;
  }
}

module.exports = {
  acquiringClient,
  acquiringPost,
  acquiringGet,
  toMinor,
  buildBasketOrder,
  buildInvoicePayload,
  getMerchantPubKey,
  verifyWebhookSignature,
};
