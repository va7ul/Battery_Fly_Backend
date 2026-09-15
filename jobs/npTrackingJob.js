const { Order } = require('../models/order');
const { ORDER_STATUS, isTransitionAllowed } = require('../helpers/orderStatus');
const { getTrackingBatch, mapStatusToAction } = require('../helpers/npTracking');
const { logJournal, АВТО } = require('../helpers/activities');
const { notifyDeliveryProblem } = require('../helpers/telegram');
const { acquireLock, releaseLock } = require('../helpers/cronLock');

const ЗАМОК = 'np-tracking';

// Один прохід трекінгу Нової Пошти.
//
// ⚠️ Головне правило цього файлу: ЖОДЕН збій не має зупинити прохід. Пошта може
// не відповісти, окреме замовлення — не зберегтись, Telegram — промовчати. Усе
// це стосується ОДНІЄЇ посилки, а не решти трьохсот, і прохід мусить дійти до
// кінця. Тому try/catch стоїть навколо кожного замовлення окремо, а не навколо
// циклу.
//
// ⚠️ Статус міняємо тут, а не через updateOrderById. Той — express-контролер, і
// підробляти йому req/res із крона означало б залежати від того, що він колись
// не почне читати щось іще з запиту. Натомість повторюємо РІВНО те, що він
// робить на переході «Відправлено → Доставлено», і нічого більше:
//   • питаємо isTransitionAllowed — ті самі правила, той самий хелпер;
//   • проставляємо deliveredAt, якщо його ще немає;
//   • пишемо в журнал.
// Складу цей перехід не чіпає (списання живе на «Оплачено», повернення — на
// «Скасовано»), листів у ньому немає взагалі — перевірено: sendEmail
// викликається лише з верифікації пошти й 3D-друку. Модалка з подякою — річ
// адмінки, бек її не ініціює.

async function позначитиДоставленим(order) {
  if (!isTransitionAllowed(order.status, ORDER_STATUS.DELIVERED, order.payment)) {
    // Не помилка: менеджер міг сам перевести замовлення далі або скасувати його.
    return false;
  }

  const попередній = order.status;

  order.status = ORDER_STATUS.DELIVERED;

  // Той самий запобіжник, що і в контролері: дата пишеться ОДИН раз, інакше
  // «час обробки» на дашборді поплив би від будь-якого повторного проходу.
  if (!order.deliveredAt) {
    order.deliveredAt = new Date();
  }

  await order.save();

  await logJournal(
    order._id,
    'status',
    `${АВТО.status(попередній, ORDER_STATUS.DELIVERED)} (автоматично за статусом Нової Пошти)`
  );

  return true;
}

async function обробитиЗамовлення(order, tracking) {
  const код = String(tracking.StatusCode || '');
  const текст = String(tracking.Status || '').trim();

  // ⚠️ Нічого не змінилось — мовчимо. Без цієї перевірки журнал щогодини
  // отримував би той самий рядок «Відправлення у місті Львів», і за добу картка
  // замовлення перетворилась би на стрічку з двадцяти однакових записів, у якій
  // справжню подію вже не знайти.
  if (код && код === String(order.npStatusCode || '')) {
    return { змінено: false };
  }

  order.npStatusCode = код;
  order.npStatusText = текст;
  order.npStatusUpdatedAt = new Date();
  await order.save();

  const { action, hint } = mapStatusToAction(код);

  await logJournal(
    order._id,
    'np_status',
    `Нова Пошта: ${текст || 'без опису'}${hint ? ` (${hint})` : ''}`
  );

  const наслідки = { змінено: true, доставлено: false, повернення: false };

  if (action === 'delivered') {
    наслідки.доставлено = await позначитиДоставленим(order);
  }

  // ⚠️ Статус замовлення при поверненні НЕ чіпаємо. Що робити з відмовою —
  // рішення менеджера: одне повернення оформлюють, інше передомовляють. Автомат
  // лише голосно про це каже.
  if (action === 'return') {
    наслідки.повернення = true;
    await notifyDeliveryProblem(order, hint ? `${текст} — ${hint}` : текст);
  }

  // Видалена чи неіснуюча накладна — теж сигнал: далі трекінг по ній не дасть
  // нічого, і менеджеру треба глянути на номер.
  if (action === 'error') {
    await notifyDeliveryProblem(order, hint ? `${текст} — ${hint}` : текст);
  }

  return наслідки;
}

// Прохід цілком. Повертає підсумок — його ж пише в замок і в лог.
async function runNpTracking() {
  const взято = await acquireLock(ЗАМОК);

  if (!взято) {
    console.info('[np-tracking] пропуск: інший прохід уже йде');

    return { skipped: true };
  }

  const підсумок = {
    перевірено: 0,
    змінено: 0,
    доставлено: 0,
    повернень: 0,
    невдалихПачок: 0,
    помилок: 0,
  };

  try {
    // ⚠️ Тільки активні відправлення. Доставлені й скасовані питати немає сенсу:
    // їхній шлях закінчився, а кожна зайва сотня ТТН — це зайва пачка щогодини.
    const orders = await Order.find({
      status: ORDER_STATUS.SHIPPED,
      ttn: { $nin: [null, ''] },
    });

    підсумок.перевірено = orders.length;

    if (orders.length === 0) {
      return підсумок;
    }

    const { statuses, failedBatches } = await getTrackingBatch(orders.map(o => o.ttn));

    підсумок.невдалихПачок = failedBatches;

    const заНомером = new Map(statuses.map(s => [String(s.Number), s]));

    for (const order of orders) {
      const tracking = заНомером.get(String(order.ttn));

      if (!tracking) {
        continue;
      }

      try {
        const наслідки = await обробитиЗамовлення(order, tracking);

        if (наслідки.змінено) підсумок.змінено += 1;
        if (наслідки.доставлено) підсумок.доставлено += 1;
        if (наслідки.повернення) підсумок.повернень += 1;
      } catch (error) {
        підсумок.помилок += 1;
        console.error(
          `[np-tracking] замовлення №${order.numberOfOrder} не оброблено:`,
          error.message
        );
      }
    }

    return підсумок;
  } catch (error) {
    підсумок.помилок += 1;
    console.error('[np-tracking] прохід перервано:', error.message);

    return підсумок;
  } finally {
    // ⚠️ finally, а не після return: замок мусить зніматись і тоді, коли прохід
    // упав. Інакше задача мовчала б до закінчення строку давності замка.
    const рядок = `перевірено ${підсумок.перевірено}, змінено ${підсумок.змінено}, доставлено ${підсумок.доставлено}, повернень ${підсумок.повернень}, помилок ${підсумок.помилок}`;

    console.info(`[np-tracking] ${рядок}`);
    await releaseLock(ЗАМОК, рядок);
  }
}

module.exports = { runNpTracking, позначитиДоставленим, обробитиЗамовлення, ЗАМОК };
