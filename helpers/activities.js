const { Activity } = require('../models/activity');
const { OrderJournal } = require('../models/orderJournal');

// Дисципліна будь-якого запису в журнал: він НЕ валить те, що сталося.
//
// ⚠️ Журнал — довідка для менеджера. Клієнт, який щойно оформив замовлення, не
// повинен побачити помилку через те, що в нас не записався рядок історії; так
// само не має зірватись створення ТТН через збій запису про нього. Те саме
// рішення, що й в attachContactToOrder, і з тієї самої причини.
//
// Живе однією функцією на дві колекції — хронологію клієнта й журнал
// замовлення. Самі колекції різні (див. models/orderJournal.js), спільна тут
// саме поведінка при збої, і ось її дублювати не можна.
async function безпечнийЗапис(Model, мітка, data) {
  try {
    return await Model.create(data);
  } catch (error) {
    console.error(`[${мітка}] не вдалося записати подію:`, error.message);

    return null;
  }
}

// Запис у хронологію клієнта.
async function addActivity({ contactId, type, text, date, createdBy, isAuto = false, nextContactDate }) {
  if (!contactId) {
    return null;
  }

  return безпечнийЗапис(Activity, 'activities', {
    contactId,
    type,
    text,
    date: date || new Date(),
    createdBy: createdBy || '',
    isAuto,
    ...(nextContactDate ? { nextContactDate } : {}),
  });
}

// Запис у журнал замовлення.
//
// ⚠️ Не плутати з order.comment: то коментар клієнта з оформлення, а це
// внутрішній слід менеджера й системи.
async function addJournalEntry({ orderId, type, text, date, createdBy, isAuto = false }) {
  if (!orderId) {
    return null;
  }

  return безпечнийЗапис(OrderJournal, 'journal', {
    orderId,
    type,
    text,
    date: date || new Date(),
    createdBy: createdBy || '',
    isAuto,
  });
}

// Автоподії. Тексти зібрані тут, а не розсипані по контролерах: інакше та сама
// подія записувалась би трьома різними формулюваннями, і хронологія читалась би
// як склейка з різних систем.
const АВТО = {
  // Журнал замовлення
  status: (from, to) => `Статус змінено: ${from} → ${to}`,
  ttn: номер => `Створено ТТН: ${номер}`,
  // Хронологія клієнта
  order: order =>
    `Створено замовлення №${order.numberOfOrder} на ${Math.round(Number(order.together) || 0)} ₴`,
  stage: (from, to) => `Стадія воронки: ${from} → ${to}`,
  reactivation: днів => `Потрапив у Реанімацію — мовчить ${днів} дн.`,
};

const logAuto = (contactId, text) =>
  addActivity({ contactId, type: 'system', text, isAuto: true });

// Замовлення у хронології клієнта.
//
// ⚠️ Викликається ПІСЛЯ Order.create, а не разом із прив'язкою клієнта. Прив'язка
// стається до створення, і запис на тому місці означав би рядок «створено
// замовлення» про замовлення, яке могло не створитись.
const logOrderCreated = order =>
  order && order.contactId ? logAuto(order.contactId, АВТО.order(order)) : null;

// Автозапис у журнал замовлення.
const logJournal = (orderId, type, text) =>
  addJournalEntry({ orderId, type, text, isAuto: true });

module.exports = {
  addActivity,
  addJournalEntry,
  logAuto,
  logJournal,
  logOrderCreated,
  АВТО,
};
