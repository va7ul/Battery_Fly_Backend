// Агрегації для GET /api/adm/dashboard.
//
// Принцип: усе рахує MongoDB. У Node не приїжджає жодного сирого замовлення —
// лише готові числа й короткі списки. Інакше на кожне відкриття дашборду
// довелось би тягнути всю колекцію Order.
//
// Колекція невелика (тисячі документів), тож пайплайни свідомо прості й
// читабельні, без індексів під кожен блок.

const TIME_ZONE = 'Europe/Kyiv';
const DAY_MS = 24 * 60 * 60 * 1000;

// Замовлення, які не рахуються у виторг. Скасоване замовлення — це не продаж,
// і показувати його в revenue/середньому чеку означало б брехати власнику.
const CANCELLED_STATUS = 'Скасовано';

// ─── Періоди ───────────────────────────────────────────────────────────────

// Зміщення київського часу відносно UTC на конкретний момент (з урахуванням
// переходу на літній час). Render працює в UTC, а "сьогодні" для магазину —
// це київська доба, не UTC-доба.
function kyivOffsetMs(date) {
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const kyiv = new Date(date.toLocaleString('en-US', { timeZone: TIME_ZONE }));

  return kyiv.getTime() - utc.getTime();
}

// Початок київської доби для переданого моменту, повернутий як UTC-Date.
function startOfKyivDay(date) {
  const offset = kyivOffsetMs(date);
  const shifted = new Date(date.getTime() + offset);
  shifted.setUTCHours(0, 0, 0, 0);

  return new Date(shifted.getTime() - offset);
}

// Повертає {from, to} поточного періоду і {from, to} попереднього такої ж
// тривалості — саме з ним порівнюються картки пульсу.
function resolvePeriod(period, fromRaw, toRaw) {
  const now = new Date();
  let from;
  let to = now;
  let shiftDays;

  switch (period) {
    case 'today':
      from = startOfKyivDay(now);
      shiftDays = 1;
      break;
    case 'week':
      from = new Date(startOfKyivDay(now).getTime() - 6 * DAY_MS);
      shiftDays = 7;
      break;
    case 'custom': {
      const parsedFrom = new Date(fromRaw);
      const parsedTo = new Date(toRaw);

      if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime())) {
        return null;
      }

      from = startOfKyivDay(parsedFrom);
      // to включно: беремо початок наступної доби після вказаної.
      to = new Date(startOfKyivDay(parsedTo).getTime() + DAY_MS);
      shiftDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
      break;
    }
    case 'month':
    default:
      from = new Date(startOfKyivDay(now).getTime() - 29 * DAY_MS);
      shiftDays = 30;
      break;
  }

  // Попередній період зсуваємо на ЦІЛУ кількість діб, а не на тривалість
  // вікна. Для "сьогодні" це дає вчора до тієї ж години — те порівняння, якого
  // очікує людина. Зсув на тривалість (16 год) натомість зіставляв би ранок
  // сьогодні з вечором учора, і числа стрибали б залежно від часу відкриття.
  const shiftMs = shiftDays * DAY_MS;

  return {
    from,
    to,
    previous: {
      from: new Date(from.getTime() - shiftMs),
      to: new Date(to.getTime() - shiftMs),
    },
  };
}

// ─── Дрібні утиліти ────────────────────────────────────────────────────────

// Відсоток зміни до попереднього періоду. null (а не 0) означає "нема з чим
// порівнювати" — фронт має показати прочерк, а не «+0%», бо це різні речі.
function percentChange(current, previous) {
  if (!previous) {
    return current ? null : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
}

// Ключ клієнта: email, а якщо його немає — телефон. Окремої колекції клієнтів
// для замовлень немає (гості оформлюють без реєстрації), тож групуємо по тому,
// що реально є в замовленні.
const CUSTOMER_KEY = {
  $toLower: {
    $trim: { chars: ' ', input: { $ifNull: ['$email', { $ifNull: ['$tel', ''] }] } },
  },
};

// Сума позиції кошика. cartItems не має схеми — ні Joi, ні Mongoose не
// описують форму товару, — тому будь-яке поле може бути відсутнім або
// рядком (price у типах фронту прямо оголошений як number | string).
// Звідси $convert з onError/onNull: одне зіпсоване легасі-значення інакше
// поклало б увесь дашборд, а не одну позицію.
const toNumber = value => ({ $convert: { input: value, to: 'double', onError: 0, onNull: 0 } });

const ITEM_SUM = {
  $let: {
    vars: {
      total: toNumber('$cartItems.totalPrice'),
      fallback: {
        $multiply: [toNumber('$cartItems.price'), toNumber({ $ifNull: ['$cartItems.quantityOrdered', 1] })],
      },
    },
    in: { $cond: [{ $gt: ['$$total', 0] }, '$$total', '$$fallback'] },
  },
};

const paidMatch = (from, to) => ({
  createdAt: { $gte: from, $lt: to },
  status: { $ne: CANCELLED_STATUS },
});

// ─── Пульс ─────────────────────────────────────────────────────────────────

async function aggregateTotals(Order, from, to) {
  const [row] = await Order.aggregate([
    { $match: paidMatch(from, to) },
    {
      $group: {
        _id: null,
        revenue: { $sum: toNumber('$together') },
        ordersCount: { $sum: 1 },
      },
    },
  ]);

  const revenue = row ? row.revenue : 0;
  const ordersCount = row ? row.ordersCount : 0;

  return {
    revenue,
    ordersCount,
    avgCheck: ordersCount ? Math.round(revenue / ordersCount) : 0,
  };
}

// Середній час обробки. Період міряємо по ДАТІ ДОСТАВКИ, а не створення:
// показник відповідає на питання «як швидко ми віддаємо замовлення зараз».
// Замовлення без deliveredAt (доставлені до появи поля) не враховуються.
async function aggregateProcessingTime(Order, from, to) {
  const [row] = await Order.aggregate([
    { $match: { deliveredAt: { $ne: null, $gte: from, $lt: to } } },
    {
      $group: {
        _id: null,
        avgMs: { $avg: { $subtract: ['$deliveredAt', '$createdAt'] } },
        count: { $sum: 1 },
      },
    },
  ]);

  if (!row || !row.count) {
    return { hours: null, count: 0 };
  }

  return { hours: Math.round((row.avgMs / (60 * 60 * 1000)) * 10) / 10, count: row.count };
}

// ─── Тривоги ───────────────────────────────────────────────────────────────

const STUCK_AFTER_DAYS = 3;
// Онлайн-оплату не позначаємо проблемною одразу: клієнт може бути на сторінці
// банку просто зараз.
const UNPAID_AFTER_HOURS = 2;

async function aggregateStuckOrders(Order) {
  const threshold = new Date(Date.now() - STUCK_AFTER_DAYS * DAY_MS);

  return Order.aggregate([
    { $match: { status: 'Нове', createdAt: { $lt: threshold } } },
    { $sort: { createdAt: 1 } },
    { $limit: 20 },
    {
      $project: {
        _id: 1,
        numberOfOrder: 1,
        customer: { $concat: [{ $ifNull: ['$lastName', ''] }, ' ', { $ifNull: ['$firstName', ''] }] },
        together: 1,
        createdAt: 1,
        daysWaiting: {
          $floor: { $divide: [{ $subtract: ['$$NOW', '$createdAt'] }, DAY_MS] },
        },
      },
    },
  ]);
}

// Неоплачені онлайн-замовлення: рахунок створено, але success так і не настав.
async function aggregateUnpaidOnline(Order) {
  const threshold = new Date(Date.now() - UNPAID_AFTER_HOURS * 60 * 60 * 1000);

  return Order.aggregate([
    {
      $match: {
        payment: 'card_online',
        status: { $ne: CANCELLED_STATUS },
        createdAt: { $lt: threshold },
        acquiringStatus: { $nin: ['success', null] },
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: 20 },
    {
      $project: {
        _id: 1,
        numberOfOrder: 1,
        customer: { $concat: [{ $ifNull: ['$lastName', ''] }, ' ', { $ifNull: ['$firstName', ''] }] },
        together: 1,
        acquiringStatus: 1,
        acquiringFailureReason: 1,
        createdAt: 1,
      },
    },
  ]);
}

// Товари, що закінчуються. quantity === 0 свідомо не показуємо: вони вже
// закінчились, це інша задача (закупівля), а не сигнал «встигни докупити».
// Збірки лежать в окремій колекції, але для власника це той самий склад.
async function aggregateLowStock(Product, ProductZbirky) {
  const match = { quantity: { $gt: 0, $lt: 5 } };
  const project = { _id: 1, codeOfGood: 1, name: 1, quantity: 1, category: 1 };

  const [products, assemblies] = await Promise.all([
    Product.find(match, project).sort({ quantity: 1 }).limit(20).lean(),
    ProductZbirky.find(match, project).sort({ quantity: 1 }).limit(20).lean(),
  ]);

  return [...products, ...assemblies]
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 20);
}

// ─── Замовлення в роботі ───────────────────────────────────────────────────

async function aggregateOrdersInWork(Order, limit = 15) {
  return Order.aggregate([
    { $match: { status: { $in: ['Нове', 'В роботі'] } } },
    { $sort: { createdAt: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        numberOfOrder: 1,
        customer: { $concat: [{ $ifNull: ['$lastName', ''] }, ' ', { $ifNull: ['$firstName', ''] }] },
        together: 1,
        payment: 1,
        status: 1,
        createdAt: 1,
        acquiringStatus: 1,
        // Причина відмови потрібна вже тут: без неї бейдж у списку показував
        // би «Оплата не пройшла: причина невідома» при відомій причині.
        acquiringFailureReason: 1,
        monopayState: 1,
        monopaySubState: 1,
      },
    },
  ]);
}

// ─── Клієнти ───────────────────────────────────────────────────────────────

const WHOLESALE_MIN_ORDERS = 3;
const WHOLESALE_MIN_SUM = 50000;
const WHOLESALE_WINDOW_DAYS = 30;

// Ключі клієнтів, які за визначенням є оптовиками ЗАРАЗ: більше 3 замовлень і
// понад 50 000 ₴ за останні 30 днів (обидві умови одночасно).
async function aggregateWholesaleKeys(Order) {
  const from = new Date(Date.now() - WHOLESALE_WINDOW_DAYS * DAY_MS);

  const rows = await Order.aggregate([
    { $match: paidMatch(from, new Date()) },
    {
      $group: {
        _id: CUSTOMER_KEY,
        ordersCount: { $sum: 1 },
        totalSum: { $sum: toNumber('$together') },
      },
    },
    { $match: { ordersCount: { $gt: WHOLESALE_MIN_ORDERS }, totalSum: { $gt: WHOLESALE_MIN_SUM } } },
    { $project: { _id: 1 } },
  ]);

  return new Set(rows.map(row => row._id).filter(Boolean));
}

async function aggregateTopCustomers(Order, from, to, wholesaleKeys, limit = 8) {
  const rows = await Order.aggregate([
    { $match: paidMatch(from, to) },
    {
      $group: {
        _id: CUSTOMER_KEY,
        totalSum: { $sum: toNumber('$together') },
        ordersCount: { $sum: 1 },
        firstName: { $last: '$firstName' },
        lastName: { $last: '$lastName' },
        email: { $last: '$email' },
        tel: { $last: '$tel' },
      },
    },
    { $match: { _id: { $ne: '' } } },
    { $sort: { totalSum: -1 } },
    { $limit: limit },
  ]);

  return rows.map(row => ({
    key: row._id,
    name: `${row.lastName || ''} ${row.firstName || ''}`.trim(),
    email: row.email,
    tel: row.tel,
    totalSum: row.totalSum,
    ordersCount: row.ordersCount,
    isWholesale: wholesaleKeys.has(row._id),
  }));
}

const INACTIVE_MIN_DAYS = 20;
const INACTIVE_MAX_DAYS = 60;

// Оптовики, які давно не купували.
//
// ⚠️ Тут оптовість рахується НЕ за останні 30 днів (як для бейджа в топі), а за
// 30 днів ДО останнього замовлення клієнта. Інакше список був би структурно
// порожній: людина, яка не купувала 40 днів, за визначенням не може мати
// 3+ замовлень за останні 30. Тобто питання тут — «чи був він оптовиком, поки
// був активний», і це єдине прочитання, яке дає осмислений результат.
async function aggregateInactiveWholesale(Order, limit = 10) {
  const now = Date.now();
  const oldestAllowed = new Date(now - INACTIVE_MAX_DAYS * DAY_MS);
  const newestAllowed = new Date(now - INACTIVE_MIN_DAYS * DAY_MS);

  const rows = await Order.aggregate([
    { $match: { status: { $ne: CANCELLED_STATUS } } },
    {
      $group: {
        _id: CUSTOMER_KEY,
        lastOrderAt: { $max: '$createdAt' },
        firstName: { $last: '$firstName' },
        lastName: { $last: '$lastName' },
        email: { $last: '$email' },
        tel: { $last: '$tel' },
        orders: { $push: { createdAt: '$createdAt', together: toNumber('$together') } },
      },
    },
    {
      $match: {
        _id: { $ne: '' },
        lastOrderAt: { $gte: oldestAllowed, $lt: newestAllowed },
      },
    },
    {
      $addFields: {
        windowOrders: {
          $filter: {
            input: '$orders',
            as: 'order',
            cond: {
              $gte: [
                '$$order.createdAt',
                { $subtract: ['$lastOrderAt', WHOLESALE_WINDOW_DAYS * DAY_MS] },
              ],
            },
          },
        },
      },
    },
    {
      $addFields: {
        windowCount: { $size: '$windowOrders' },
        windowSum: { $sum: '$windowOrders.together' },
      },
    },
    {
      $match: {
        windowCount: { $gt: WHOLESALE_MIN_ORDERS },
        windowSum: { $gt: WHOLESALE_MIN_SUM },
      },
    },
    { $sort: { lastOrderAt: 1 } },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        tel: 1,
        lastOrderAt: 1,
        windowSum: 1,
        windowCount: 1,
        daysSinceLastOrder: {
          $floor: { $divide: [{ $subtract: ['$$NOW', '$lastOrderAt'] }, DAY_MS] },
        },
      },
    },
  ]);

  return rows.map(row => ({
    key: row._id,
    name: `${row.lastName || ''} ${row.firstName || ''}`.trim(),
    email: row.email,
    tel: row.tel,
    daysSinceLastOrder: row.daysSinceLastOrder,
    totalSum: row.windowSum,
    ordersCount: row.windowCount,
  }));
}

// Нові (перше в житті замовлення потрапило в цей період) проти повторних.
async function aggregateNewVsReturning(Order, from, to) {
  const rows = await Order.aggregate([
    { $match: { status: { $ne: CANCELLED_STATUS } } },
    {
      $group: {
        _id: CUSTOMER_KEY,
        firstOrderAt: { $min: '$createdAt' },
        inPeriod: {
          $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', from] }, { $lt: ['$createdAt', to] }] }, 1, 0] },
        },
      },
    },
    { $match: { _id: { $ne: '' }, inPeriod: { $gt: 0 } } },
    {
      $group: {
        _id: null,
        newCustomers: { $sum: { $cond: [{ $gte: ['$firstOrderAt', from] }, 1, 0] } },
        returningCustomers: { $sum: { $cond: [{ $lt: ['$firstOrderAt', from] }, 1, 0] } },
      },
    },
  ]);

  const row = rows[0] || {};

  return {
    newCustomers: row.newCustomers || 0,
    returningCustomers: row.returningCustomers || 0,
  };
}

// ─── Аналітика ─────────────────────────────────────────────────────────────

// Виторг за категоріями. cartItems зберігає ВЕСЬ документ товару, тож category
// лежить прямо в позиції — джойн до Product не потрібен.
async function aggregateRevenueByCategory(Order, from, to) {
  const rows = await Order.aggregate([
    { $match: paidMatch(from, to) },
    { $unwind: '$cartItems' },
    {
      $group: {
        _id: { $ifNull: ['$cartItems.category', 'Інше'] },
        revenue: { $sum: ITEM_SUM },
        itemsCount: { $sum: { $ifNull: ['$cartItems.quantityOrdered', 1] } },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 12 },
  ]);

  return rows.map(row => ({
    category: row._id || 'Інше',
    revenue: Math.round(row.revenue),
    itemsCount: row.itemsCount,
  }));
}

async function aggregatePaymentMethods(Order, from, to) {
  const rows = await Order.aggregate([
    { $match: paidMatch(from, to) },
    {
      $group: {
        _id: { $ifNull: ['$payment', 'Не вказано'] },
        ordersCount: { $sum: 1 },
        revenue: { $sum: toNumber('$together') },
      },
    },
    { $sort: { ordersCount: -1 } },
  ]);

  return rows.map(row => ({
    payment: row._id,
    ordersCount: row.ordersCount,
    revenue: row.revenue,
  }));
}

// Виторг по днях — для лінії тренду. Дата групується в київському поясі,
// інакше вечірні замовлення падали б у наступну добу.
async function aggregateRevenueByDay(Order, from, to) {
  const rows = await Order.aggregate([
    { $match: paidMatch(from, to) },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TIME_ZONE } },
        revenue: { $sum: toNumber('$together') },
        ordersCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map(row => ({ date: row._id, revenue: row.revenue, ordersCount: row.ordersCount }));
}

module.exports = {
  TIME_ZONE,
  resolvePeriod,
  percentChange,
  aggregateTotals,
  aggregateProcessingTime,
  aggregateStuckOrders,
  aggregateUnpaidOnline,
  aggregateLowStock,
  aggregateOrdersInWork,
  aggregateWholesaleKeys,
  aggregateTopCustomers,
  aggregateInactiveWholesale,
  aggregateNewVsReturning,
  aggregateRevenueByCategory,
  aggregatePaymentMethods,
  aggregateRevenueByDay,
};
