const { Schema, model } = require('mongoose');

// Налаштування магазину — ОДИН документ на всю базу (singleton).
//
// Колекція, а не .env: усе це редагує власник із адмінки, без деплою. Відсоток
// передоплати змінюється разом з умовами роботи, реквізити — при зміні банку,
// а тексти повідомлень власник підправляє постійно.
const settingsSchema = new Schema(
  {
    // Відсоток передоплати для накладеного платежу. Був константою в
    // helpers/orderStatus.js — тепер живе тут.
    prepaymentPercent: {
      type: Number,
      default: 20,
      min: 0,
      max: 100,
    },
    // Реквізити для оплати одним текстовим блоком: IBAN, отримувач, ЄДРПОУ.
    // Формат довільний — власник вставляє те, що дає банк, і воно потрапляє в
    // повідомлення через плейсхолдер {requisites}.
    requisites: {
      type: String,
      default: '',
    },
    // Тексти повідомлень: ключ «{payment}_{status}» → текст із плейсхолдерами.
    //
    // Map, а не звичайний об'єкт: у Mongoose поле типу Object з довільними
    // ключами не відстежує зміни окремих ключів, і збереження одного шаблону
    // тихо не записувалось би без markModified.
    messageTemplates: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
  },
  { versionKey: false, timestamps: true }
);

const Settings = model('settings', settingsSchema);

module.exports = {
  Settings,
};
