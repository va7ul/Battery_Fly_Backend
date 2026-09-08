// Ключі шаблонів повідомлень і дефолтні тексти.
//
// Ключ — «{слаг оплати}_{слаг статусу}». Слаги, а не сирі значення з бази:
// payment там буває кирилицею з пробілами ('Накладений платіж'), а такий рядок
// як ключ Map ламається від будь-якої правки формулювання. Слаг — стабільний.

const { ORDER_STATUS, CARD_ONLINE, MONOPAY_PARTS, CASH_ON_DELIVERY } = require('./orderStatus');

const PAYMENT_SLUG = {
  CARD_ONLINE: 'card_online',
  MONOPAY_PARTS: 'monopay_parts',
  COD: 'cod',
  INVOICE: 'invoice',
};

const STATUS_SLUG = {
  [ORDER_STATUS.AWAITING_PAYMENT]: 'awaiting_payment',
  [ORDER_STATUS.PAID]: 'paid',
  [ORDER_STATUS.SHIPPED]: 'shipped',
  [ORDER_STATUS.DELIVERED]: 'delivered',
  [ORDER_STATUS.CANCELLED]: 'cancelled',
};

// Рахунок для юр. осіб і будь-яке легасі-значення ('Картою по реквізитах
// фізичних осіб' тощо) лягають в 'invoice': вони поводяться однаково —
// клієнту треба виставити рахунок і дочекатись оплати. Білий список залишив
// би легасі-замовлення взагалі без шаблону.
function getPaymentSlug(payment) {
  if (payment === CARD_ONLINE) {
    return PAYMENT_SLUG.CARD_ONLINE;
  }

  if (payment === MONOPAY_PARTS) {
    return PAYMENT_SLUG.MONOPAY_PARTS;
  }

  if (payment === CASH_ON_DELIVERY) {
    return PAYMENT_SLUG.COD;
  }

  return PAYMENT_SLUG.INVOICE;
}

function getStatusSlug(status) {
  return STATUS_SLUG[status] || null;
}

// Ключ шаблону для конкретного замовлення в конкретному статусі. null означає
// «для цього статусу повідомлення не передбачене» — так, «Нове» не має тексту
// взагалі: замовлення щойно створене, менеджеру ще нічого сказати клієнту.
function getTemplateKey(payment, status) {
  const statusSlug = getStatusSlug(status);

  return statusSlug ? `${getPaymentSlug(payment)}_${statusSlug}` : null;
}

// Статуси, для яких потрібні шаблони, окремо для кожного способу оплати.
// В онлайну й розстрочки немає «Очікує оплати» — його немає і в ланцюжку
// статусів (див. helpers/orderStatus.js).
const TEMPLATE_MATRIX = {
  [PAYMENT_SLUG.INVOICE]: ['awaiting_payment', 'paid', 'shipped', 'delivered', 'cancelled'],
  [PAYMENT_SLUG.COD]: ['awaiting_payment', 'paid', 'shipped', 'delivered', 'cancelled'],
  [PAYMENT_SLUG.CARD_ONLINE]: ['paid', 'shipped', 'delivered', 'cancelled'],
  [PAYMENT_SLUG.MONOPAY_PARTS]: ['paid', 'shipped', 'delivered', 'cancelled'],
};

// Підписи для адмінки — щоб редактор не показував слаги.
const PAYMENT_LABELS = {
  [PAYMENT_SLUG.INVOICE]: 'Рахунок для юр. осіб чи ФОП',
  [PAYMENT_SLUG.COD]: 'Накладений платіж',
  [PAYMENT_SLUG.CARD_ONLINE]: 'Картою онлайн',
  [PAYMENT_SLUG.MONOPAY_PARTS]: 'Оплата частинами',
};

const STATUS_LABELS = {
  awaiting_payment: ORDER_STATUS.AWAITING_PAYMENT,
  paid: ORDER_STATUS.PAID,
  shipped: ORDER_STATUS.SHIPPED,
  delivered: ORDER_STATUS.DELIVERED,
  cancelled: ORDER_STATUS.CANCELLED,
};

const SHIPPED_TEXT =
  'Замовлення №{orderNumber} відправлено! Номер ТТН: {ttn}. Очікуйте на отримання.';

const DELIVERED_TEXT =
  'Дякуємо за покупку! Замовлення №{orderNumber} доставлено. Будемо раді бачити вас знову 🙂';

const CANCELLED_TEXT =
  'Замовлення №{orderNumber} скасовано. Якщо це помилка — напишіть нам, і ми все виправимо.';

const PAID_TEXT =
  'Дякуємо! Оплату за замовлення №{orderNumber} отримано. Готуємо до відправлення.';

// Дефолтні тексти. Власник підправляє їх в адмінці — це лише стартова точка,
// щоб розділ не відкривався порожнім.
const DEFAULT_TEMPLATES = {
  invoice_awaiting_payment:
    'Вітаємо, {clientName}! Дякуємо за замовлення №{orderNumber}.\n' +
    'Сума до оплати: {amount} ₴.\n' +
    'Реквізити для оплати:\n' +
    '{requisites}\n' +
    'Призначення платежу: {paymentPurpose}\n' +
    'Після оплати надішліть, будь ласка, підтвердження.',
  invoice_paid: PAID_TEXT,
  invoice_shipped: SHIPPED_TEXT,
  invoice_delivered: DELIVERED_TEXT,
  invoice_cancelled: CANCELLED_TEXT,

  cod_awaiting_payment:
    'Вітаємо, {clientName}! Дякуємо за замовлення №{orderNumber}.\n' +
    'Для відправлення потрібна передоплата {prepayment} ₴ ({prepaymentPercent}% від суми).\n' +
    'Решта {codAmount} ₴ — накладеним платежем при отриманні.\n' +
    'Реквізити:\n' +
    '{requisites}\n' +
    'Призначення платежу: {paymentPurpose}',
  cod_paid: PAID_TEXT,
  cod_shipped: SHIPPED_TEXT,
  cod_delivered: DELIVERED_TEXT,
  cod_cancelled: CANCELLED_TEXT,

  // Онлайн і розстрочка вже оплачені — реквізитів у тексті немає.
  card_online_paid: PAID_TEXT,
  card_online_shipped: SHIPPED_TEXT,
  card_online_delivered: DELIVERED_TEXT,
  card_online_cancelled: CANCELLED_TEXT,

  monopay_parts_paid: PAID_TEXT,
  monopay_parts_shipped: SHIPPED_TEXT,
  monopay_parts_delivered: DELIVERED_TEXT,
  monopay_parts_cancelled: CANCELLED_TEXT,
};

module.exports = {
  PAYMENT_SLUG,
  STATUS_SLUG,
  TEMPLATE_MATRIX,
  PAYMENT_LABELS,
  STATUS_LABELS,
  DEFAULT_TEMPLATES,
  getPaymentSlug,
  getStatusSlug,
  getTemplateKey,
};
