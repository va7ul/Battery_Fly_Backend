const crypto = require('crypto');
const axios = require('axios');

const monopayClient = axios.create({ baseURL: process.env.MONOPAY_BASE_URL });

function signBody(bodyString) {
  return crypto
    .createHmac('sha256', process.env.MONOPAY_SECRET)
    .update(bodyString, 'utf8')
    .digest('base64');
}

function verifyCallbackSignature(rawBody, signatureHeader) {
  if (!rawBody || !signatureHeader) {
    return false;
  }

  try {
    const expected = Buffer.from(signBody(rawBody.toString('utf8')));
    const received = Buffer.from(signatureHeader);

    if (expected.length !== received.length) {
      return false;
    }

    return crypto.timingSafeEqual(expected, received);
  } catch (error) {
    return false;
  }
}

async function monopayPost(path, payloadObject) {
  const bodyString = JSON.stringify(payloadObject);
  const signature = signBody(bodyString);

  return monopayClient.post(path, bodyString, {
    headers: {
      'Content-Type': 'application/json',
      'store-id': process.env.MONOPAY_STORE_ID,
      signature,
    },
  });
}

function todayAsInvoiceDate() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Реальна схема POST /api/order/create (звірено з живою специфікацією
// https://monobank.ua/api-docs/chast/servisy/zaiavky-na-pch/post--api--order--create,
// відрізняється від огляду на головній сторінці документації): total_sum — у гривнях
// (>= 2), і потрібні ще invoice, available_programs, products.
// products будується як один синтетичний рядок на всю суму замовлення, бо реальна
// форма cartItems (назви/ціни товарів) не звірена з фронтендом під monobank-схему
// { name, count, sum } (sum = ціна за одиницю).
function buildCreatePayload({ storeOrderId, clientPhone, totalSum, payParts, resultCallback }) {
  return {
    store_order_id: storeOrderId,
    client_phone: clientPhone,
    total_sum: totalSum,
    invoice: {
      number: String(storeOrderId),
      date: todayAsInvoiceDate(),
      source: 'INTERNET',
    },
    available_programs: [
      // "type" описаний у документації як "не використовується", але сендбокс
      // все одно відхиляє запит без нього (400 "Не вказано обов'язковий параметр
      // type") — значення взяте з референс-прикладу в документації.
      { type: 'payment_installments', available_parts_count: [payParts] },
    ],
    products: [
      { name: `Замовлення №${storeOrderId}`, count: 1, sum: totalSum },
    ],
    result_callback: resultCallback,
  };
}

function buildOrderIdPayload(orderId) {
  return { order_id: orderId };
}

module.exports = {
  monopayClient,
  signBody,
  verifyCallbackSignature,
  monopayPost,
  buildCreatePayload,
  buildOrderIdPayload,
};
