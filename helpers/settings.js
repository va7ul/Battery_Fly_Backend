const { Settings } = require('../models/settings');
const { DEFAULT_TEMPLATES, TEMPLATE_MATRIX } = require('./messageTemplates');

// Налаштування — singleton. Документа може не бути (свіжа база, перший запуск),
// тому читання завжди йде через find-or-create: жоден виклик не має падати
// через те, що власник ще не заходив у розділ.
async function getSettings() {
  const existing = await Settings.findOne({});

  if (existing) {
    return existing;
  }

  return Settings.create({
    messageTemplates: new Map(Object.entries(DEFAULT_TEMPLATES)),
  });
}

// Повний перелік ключів, які має знати адмінка. Береться з матриці, а не з
// того, що вже лежить у базі: нова комбінація (новий спосіб оплати) інакше не
// з'явилась би в редакторі, поки хтось не запише її вручну.
function getAllTemplateKeys() {
  return Object.entries(TEMPLATE_MATRIX).flatMap(([paymentSlug, statuses]) =>
    statuses.map(statusSlug => `${paymentSlug}_${statusSlug}`)
  );
}

// Шаблони у вигляді звичайного об'єкта, з дефолтом там, де власник ще нічого
// не вписав. Map із Mongoose у JSON перетворюється неоднаково між версіями,
// тож розгортаємо явно.
function templatesToObject(settings) {
  const stored = settings.messageTemplates || new Map();
  const result = {};

  getAllTemplateKeys().forEach(key => {
    const value = stored.get ? stored.get(key) : stored[key];

    result[key] = value === undefined || value === null ? DEFAULT_TEMPLATES[key] || '' : value;
  });

  return result;
}

// Те, що віддається адмінці й використовується renderTemplate.
function toPlainSettings(settings) {
  return {
    prepaymentPercent: settings.prepaymentPercent,
    requisites: settings.requisites,
    messageTemplates: templatesToObject(settings),
    // Розгортаємо явно, а не віддаємо піддокумент як є: у JSON з Mongoose
    // приїхали б ще _id і зайві методи, і адмінка слала б їх назад у PUT.
    npSender: {
      counterpartyRef: settings.npSender?.counterpartyRef || '',
      counterpartyName: settings.npSender?.counterpartyName || '',
      contactRef: settings.npSender?.contactRef || '',
      contactName: settings.npSender?.contactName || '',
      phone: settings.npSender?.phone || '',
      cityName: settings.npSender?.cityName || '',
      warehouseName: settings.npSender?.warehouseName || '',
    },
    npDefaults: {
      weight: settings.npDefaults?.weight ?? 1,
      volumeGeneral: settings.npDefaults?.volumeGeneral ?? 0.004,
      description: settings.npDefaults?.description || '',
    },
  };
}

// Чи заповнене все, без чого InternetDocument.save не викликати.
//
// Перевіряється ПЕРЕД зверненням до Пошти: інакше менеджер отримав би її
// внутрішнє «Sender not found» замість зрозумілого «заповніть відправника».
function getMissingSenderFields(settings) {
  const sender = settings.npSender || {};
  // ⚠️ Місто й відділення перевіряються за НАЗВОЮ, а не за Ref. Ref для
  // адреси відправника ніде не зберігається — його резолвить create-ttn, рівно
  // тим самим механізмом, що й для адреси отримувача. Тримати Ref у
  // налаштуваннях означало б другий спосіб отримати те саме значення.
  const required = [
    ['counterpartyRef', 'контрагент-відправник'],
    ['contactRef', 'контактна особа'],
    ['phone', 'телефон відправника'],
    ['cityName', 'місто відправлення'],
    ['warehouseName', 'відділення відправлення'],
  ];

  return required.filter(([key]) => !sender[key]).map(([, label]) => label);
}

module.exports = {
  getSettings,
  getAllTemplateKeys,
  templatesToObject,
  toPlainSettings,
  getMissingSenderFields,
};
