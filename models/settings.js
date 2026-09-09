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

    // ── Відправник Нової Пошти ────────────────────────────────────────────
    //
    // Потрібно для InternetDocument.save: без цих п'яти значень ТТН не
    // створити. Тримаємо тут, а не в .env, з тієї самої причини, що й решту
    // налаштувань — власник міняє їх сам, без деплою (переїзд на інше
    // відділення, зміна контактної особи).
    //
    // ⚠️ Ref і назва зберігаються ПАРОЮ навмисно. Ref — те, що розуміє Пошта;
    // назва — те, що бачить людина в адмінці. Без назви налаштування
    // перетворюється на набір із 36 нечитних символів, у якому не видно, чи
    // взагалі туди щось записано і чи те саме.
    npSender: {
      // Контрагент-відправник: Counterparty.getCounterparties(Sender).
      counterpartyRef: { type: String, default: '' },
      counterpartyName: { type: String, default: '' },
      // Контактна особа: ContactPerson.getCounterpartyContactPersons.
      contactRef: { type: String, default: '' },
      contactName: { type: String, default: '' },
      phone: { type: String, default: '' },
      // Місто й відділення відправлення.
      cityRef: { type: String, default: '' },
      cityName: { type: String, default: '' },
      warehouseRef: { type: String, default: '' },
      warehouseName: { type: String, default: '' },
    },

    // Дефолти для модалки ТТН. Вага й габарити товарів у базі не зберігаються
    // (перевірено: структурованих полів немає, у тексті опису — лише в 20 із
    // 77 товарів і в різних форматах), тож менеджер вводить їх руками. Ці
    // значення лише підставляються у форму, щоб не набирати щоразу одне й те
    // саме для типового замовлення.
    npDefaults: {
      weight: { type: Number, default: 1 },
      volumeGeneral: { type: Number, default: 0.004 },
      description: { type: String, default: 'Акумулятори та комплектуючі' },
    },
  },
  { versionKey: false, timestamps: true }
);

const Settings = model('settings', settingsSchema);

module.exports = {
  Settings,
};
