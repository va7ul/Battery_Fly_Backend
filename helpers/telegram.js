// Сповіщення в Telegram про нові замовлення та заявки.
//
// ГОЛОВНЕ ПРАВИЛО: це best-effort канал. Жодна помилка звідси не має зривати
// створення замовлення — гроші й дані клієнта важливіші за повідомлення в чат.
// Тому sendTelegramMessage НІКОЛИ не кидає: усе загорнуте в try/catch, а збій
// лише логується. Саме через це виклики в контролерах можна робити без await —
// проміс не може відхилитись, тож unhandled rejection не станеться.

const axios = require('axios');

// Власний клієнт, а не глобальний axios: у controllers/orders.js глобальному
// axios прописаний baseURL Нової Пошти, і будь-яка правка там миттєво зламала б
// або доставку, або це сповіщення.
const telegramClient = axios.create({
  baseURL: 'https://api.telegram.org',
  timeout: 10000,
});

// Ліміт повідомлення в Telegram — 4096 символів. Обрізаємо з запасом: краще
// втратити хвіст довгого кошика, ніж не отримати сповіщення взагалі.
const MAX_MESSAGE_LENGTH = 3900;
const MAX_ITEMS_IN_MESSAGE = 10;

const ADMIN_ORDER_PATH = '/admin/orders';

// parse_mode: 'HTML' означає, що будь-який '<' або '&' у даних клієнта зробить
// повідомлення невалідним і Telegram відхилить його цілком. Тож усе, що прийшло
// ззовні (ім'я, коментар, назва товару, адреса), проходить через екранування.
function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Способи оплати, які лежать у базі машинними кодами. Решта значень
// ('Накладений платіж', 'Рахунок для юридичних осіб або ФОП' і легасі на кшталт
// «Картою по реквізитах фізичних осіб») уже українською — їх віддаємо як є.
// Білий список замість цього мовчки перетворив би легасі-значення на прочерк.
const PAYMENT_LABELS = {
  card_online: 'Карткою онлайн',
  monopay_parts: 'Оплата частинами',
  card: 'Карткою',
};

function getPaymentLabel(payment) {
  if (!payment) {
    return 'Не вказано';
  }

  return PAYMENT_LABELS[payment] || payment;
}

// Статус оплати існує лише для онлайн-оплати карткою. У накладеного платежу чи
// рахунку його немає взагалі, і дописувати туди «очікує оплати» означало б
// вигадувати стан, якого не існує.
function getPaymentStatusSuffix(order) {
  if (order.payment !== 'card_online') {
    return '';
  }

  return order.acquiringStatus === 'success'
    ? ' — ✅ оплачено'
    : ' — очікує оплати';
}

function formatMoney(value) {
  const amount = Number(value);

  return Number.isFinite(amount) ? Math.round(amount).toLocaleString('uk-UA') : '—';
}

// 1 позиція, 2-4 позиції, 5+ позицій (11-14 — виняток).
function pluralizeItems(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return 'позиція';
  }

  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return 'позиції';
  }

  return 'позицій';
}

function buildItemsBlock(cartItems) {
  const items = Array.isArray(cartItems) ? cartItems : [];

  if (items.length === 0) {
    return '';
  }

  const lines = items
    .slice(0, MAX_ITEMS_IN_MESSAGE)
    .map(item => `• ${escapeHtml(item.name)} × ${escapeHtml(item.quantityOrdered)}`);

  if (items.length > MAX_ITEMS_IN_MESSAGE) {
    const rest = items.length - MAX_ITEMS_IN_MESSAGE;

    lines.push(`…і ще ${rest} ${pluralizeItems(rest)}`);
  }

  return lines.join('\n');
}

function buildAdminLink(numberOfOrder) {
  const base = (process.env.ADMIN_URL || '').replace(/\/+$/, '');

  if (!base) {
    return '';
  }

  // Роут адмінки — /admin/orders/:orderId, і вона відкриває замовлення саме за
  // numberOfOrder, а не за _id.
  return `🔗 <a href="${base}${ADMIN_ORDER_PATH}/${encodeURIComponent(
    numberOfOrder
  )}">Відкрити в адмінці</a>`;
}

function buildOrderMessage(order) {
  const customer = [order.lastName, order.firstName].filter(Boolean).join(' ');
  const delivery = [order.deliveryType, order.city, order.warehouse]
    .filter(Boolean)
    .join(', ');

  const lines = [
    `🛒 <b>Нове замовлення №${escapeHtml(order.numberOfOrder)}</b>`,
    `👤 ${escapeHtml(customer)}${order.tel ? `, ${escapeHtml(order.tel)}` : ''}`,
    `💰 <b>${formatMoney(order.together)} ₴</b>`,
    `💳 ${escapeHtml(getPaymentLabel(order.payment))}${getPaymentStatusSuffix(order)}`,
  ];

  const items = buildItemsBlock(order.cartItems);

  if (items) {
    lines.push(`📦\n${items}`);
  }

  if (delivery) {
    lines.push(`🚚 ${escapeHtml(delivery)}`);
  }

  if (order.comment) {
    lines.push(`💬 ${escapeHtml(order.comment)}`);
  }

  const link = buildAdminLink(order.numberOfOrder);

  if (link) {
    lines.push(link);
  }

  return lines.join('\n');
}

// Заявка з форми зв'язку. Поля взяті з реальної моделі (models/feedback.js):
// name, tel, comment (у запиті приходить як text) і власний numberOfOrder.
// Email у заявці не зберігається взагалі, тож рядка з ним тут немає.
function buildFeedbackMessage(feedback) {
  const lines = [
    `📝 <b>Нова заявка №${escapeHtml(feedback.numberOfOrder)}</b>`,
    `<i>форма зв'язку на сайті</i>`,
  ];

  if (feedback.name) {
    lines.push(`👤 ${escapeHtml(feedback.name)}`);
  }

  if (feedback.tel) {
    lines.push(`📞 ${escapeHtml(feedback.tel)}`);
  }

  if (feedback.comment) {
    lines.push(`💬 ${escapeHtml(feedback.comment)}`);
  }

  return lines.join('\n');
}

async function sendTelegramMessage(text) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    // Без налаштувань просто мовчимо. Локальна розробка і тести не мають
    // сипати помилками через ненастроєний необов'язковий канал.
    if (!token || !chatId) {
      return false;
    }

    await telegramClient.post(`/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: String(text).slice(0, MAX_MESSAGE_LENGTH),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    return true;
  } catch (error) {
    // Тіло відповіді Telegram пояснює причину набагато краще за статус
    // ("chat not found", "can't parse entities"), тож логуємо саме його.
    const details = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('[telegram] send failed:', details);

    return false;
  }
}

// Складання тексту теж під захистом. sendTelegramMessage ніколи не кидає, але
// buildOrderMessage працює з даними, які прийшли ззовні, і виклик у контролері
// робиться БЕЗ await — синхронний виняток звідси пішов би прямо в контролер і
// зламав би саме те, що ми обіцяли не ламати.
async function notifyNewOrder(order) {
  try {
    return await sendTelegramMessage(buildOrderMessage(order));
  } catch (error) {
    console.error('[telegram] order notification failed:', error.message);

    return false;
  }
}

async function notifyNewFeedback(feedback) {
  try {
    return await sendTelegramMessage(buildFeedbackMessage(feedback));
  } catch (error) {
    console.error('[telegram] feedback notification failed:', error.message);

    return false;
  }
}

module.exports = {
  sendTelegramMessage,
  buildOrderMessage,
  buildFeedbackMessage,
  notifyNewOrder,
  notifyNewFeedback,
};
