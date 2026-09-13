const { Contact } = require('../models/contact');
const { normalizePhone } = require('./phone');

// Знайти клієнта CRM за телефоном або завести нового.
//
// Викликається з УСІХ трьох місць, де народжується замовлення:
// controllers/orders.js, controllers/monopay.js, controllers/acquiring.js.
// Тримати логіку тут, а не копіювати втричі, — єдиний спосіб не отримати три
// різні поведінки після першої ж правки.
//
// ⚠️ Свідомо НЕ хук Mongoose. Приховане створення записів на кожне збереження
// замовлення — саме та автомагія, від якої в цьому проєкті вже відмовились;
// явний виклик видно там, де він стається.
//
// ⚠️ Пошук ТІЛЬКИ за нормалізованими цифрами (`phones.digits`). Той самий
// номер лежить у базі в кількох виглядах, і порівняння рядків завело б
// дублікат клієнта на кожен новий формат.
async function findOrCreateContactForOrder({ tel, firstName, lastName, email }) {
  const digits = normalizePhone(tel);

  // Без телефону прив'язувати нема за чим: ім'я не унікальне, а склеїти двох
  // різних «Іванів Петренків» в одного клієнта гірше, ніж не прив'язати.
  if (!digits) {
    return null;
  }

  const existing = await Contact.findOne({ 'phones.digits': digits });

  if (existing) {
    return existing;
  }

  const name = [lastName, firstName].filter(Boolean).join(' ').trim();

  return Contact.create({
    // Ім'я порожнім не лишаємо: у списку клієнт із порожнім рядком виглядає
    // як зіпсований запис, а не як «замовлення без імені».
    name: name || `Клієнт ${digits}`,
    phones: [{ number: tel, digits, isPrimary: true }],
    email: email || '',
    type: 'site',
    kind: 'retail',
  });
}

// Прив'язка замовлення до клієнта, стійка до збоїв.
//
// ⚠️ Помилка тут НЕ має валити створення замовлення. CRM — внутрішній
// інструмент; клієнт, який щойно натиснув «Замовити», не повинен побачити
// помилку через те, що в нас не записався запис для менеджера. Незв'язане
// замовлення полагодить ручна прив'язка або повторний запуск скрипта.
async function attachContactToOrder(orderData) {
  try {
    const contact = await findOrCreateContactForOrder(orderData);

    return contact ? contact._id : null;
  } catch (error) {
    console.error('[contacts] не вдалося прив’язати клієнта:', error.message);

    return null;
  }
}

module.exports = {
  findOrCreateContactForOrder,
  attachContactToOrder,
};
