const { Activity } = require('../models/activity');

// Запис у хронологію клієнта.
//
// ⚠️ Помилка тут НЕ має валити те, що сталося. Журнал — довідка для менеджера;
// клієнт, який щойно оформив замовлення, не повинен побачити помилку через те,
// що в нас не записався рядок історії. Те саме рішення, що й у
// attachContactToOrder, і з тієї самої причини.
async function addActivity({ contactId, type, text, date, createdBy, isAuto = false, nextContactDate }) {
  if (!contactId) {
    return null;
  }

  try {
    return await Activity.create({
      contactId,
      type,
      text,
      date: date || new Date(),
      createdBy: createdBy || '',
      isAuto,
      ...(nextContactDate ? { nextContactDate } : {}),
    });
  } catch (error) {
    console.error('[activities] не вдалося записати подію:', error.message);

    return null;
  }
}

// Автоподії. Тексти зібрані тут, а не розсипані по контролерах: інакше та сама
// подія записувалась би трьома різними формулюваннями, і хронологія читалась би
// як склейка з різних систем.
const АВТО = {
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

module.exports = { addActivity, logAuto, logOrderCreated, АВТО };
