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
  };
}

module.exports = {
  getSettings,
  getAllTemplateKeys,
  templatesToObject,
  toPlainSettings,
};
