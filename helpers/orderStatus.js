// Статуси замовлення та правила переходів між ними.
//
// Ланцюжок залежить від СПОСОБУ ОПЛАТИ: там, де гроші приходять онлайн, стану
// «Очікує оплати» не існує взагалі — банк або списав, або ні. Тримати один
// спільний ланцюжок означало б показувати менеджеру крок, якого в цьому
// сценарії не буває.

const ORDER_STATUS = {
  NEW: 'Нове',
  AWAITING_PAYMENT: 'Очікує оплати',
  PAID: 'Оплачено',
  SHIPPED: 'Відправлено',
  DELIVERED: 'Доставлено',
  CANCELLED: 'Скасовано',
};

// Способи оплати, де гроші проходять через банк одразу.
const CARD_ONLINE = 'card_online';
const MONOPAY_PARTS = 'monopay_parts';
const CASH_ON_DELIVERY = 'Накладений платіж';

const ONLINE_FLOW = [
  ORDER_STATUS.NEW,
  ORDER_STATUS.PAID,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.DELIVERED,
];

const INVOICE_FLOW = [
  ORDER_STATUS.NEW,
  ORDER_STATUS.AWAITING_PAYMENT,
  ORDER_STATUS.PAID,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.DELIVERED,
];

// Відсоток передоплати для накладеного платежу. У Блоці 2 переїде в
// налаштування — поки константа, і саме тому винесена сюди, а не зашита
// в контролер.
const PREPAYMENT_PERCENT = 20;

function getStatusFlow(payment) {
  return payment === CARD_ONLINE || payment === MONOPAY_PARTS
    ? ONLINE_FLOW
    : INVOICE_FLOW;
}

// Чи дозволений перехід. Конвеєр лінійний: перестрибувати не можна, назад —
// теж. «Скасувати» доступне з будь-якого стану, крім доставленого: після
// вручення скасовувати вже нічого.
function isTransitionAllowed(from, to, payment) {
  if (from === to) {
    // Збереження картки без зміни статусу (правка знижки, коментаря тощо).
    return true;
  }

  if (from === ORDER_STATUS.DELIVERED || from === ORDER_STATUS.CANCELLED) {
    return false;
  }

  if (to === ORDER_STATUS.CANCELLED) {
    return true;
  }

  const flow = getStatusFlow(payment);
  const fromIndex = flow.indexOf(from);
  const toIndex = flow.indexOf(to);

  if (toIndex === -1) {
    return false;
  }

  // Легасі-статус («В роботі» зі старої системи) у ланцюжку відсутній. Такі
  // замовлення не можна замикати намертво — дозволяємо перейти в будь-який
  // статус нового ланцюжка, крім повернення в «Нове».
  if (fromIndex === -1) {
    return toIndex > 0;
  }

  return toIndex === fromIndex + 1;
}

// Передоплата рахується лише для накладеного платежу: у решті випадків клієнт
// платить усю суму одразу, і поле лишається null, а не нулем — нуль читався б
// як «передоплата є, але нульова».
function calculatePrepayment(payment, together) {
  if (payment !== CASH_ON_DELIVERY) {
    return null;
  }

  const amount = Number(together);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round((amount * PREPAYMENT_PERCENT) / 100);
}

module.exports = {
  ORDER_STATUS,
  CARD_ONLINE,
  MONOPAY_PARTS,
  CASH_ON_DELIVERY,
  PREPAYMENT_PERCENT,
  getStatusFlow,
  isTransitionAllowed,
  calculatePrepayment,
};
