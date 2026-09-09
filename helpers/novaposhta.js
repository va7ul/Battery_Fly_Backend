const axios = require('axios');

const { NOVA_POST } = process.env;

// ⚠️ ВЛАСНИЙ інстанс axios, а не глобальний.
//
// У controllers/orders.js стоїть `axios.defaults.baseURL = <НП>` — глобально, на
// весь процес. Через це helpers/acquiring.js уже змушений тримати окремий
// клієнт. Тут те саме: свій інстанс не залежить від того, чи хтось колись
// прибере той рядок, і не ламає нікого, якщо ми змінимо адресу.
const npClient = axios.create({
  baseURL: 'https://api.novaposhta.ua/v2.0/json/',
  timeout: 20000,
});

// Помилка від самої Нової Пошти — на відміну від мережевої.
//
// Несе errors[] і errorCodes[] як є: менеджеру в адмінці треба показати, ЩО
// саме не сподобалось Пошті («Sender not found», «Weight is too large»), а не
// абстрактне «сталася помилка».
class NovaPoshtaError extends Error {
  constructor(errors, codes) {
    const list = Array.isArray(errors) ? errors.filter(Boolean) : [];
    super(list.length > 0 ? list.join('; ') : 'Нова Пошта відхилила запит');
    this.name = 'NovaPoshtaError';
    this.errors = list;
    this.errorCodes = Array.isArray(codes) ? codes : [];
  }
}

// Один виклик API Нової Пошти.
//
// ⚠️ НП відповідає HTTP 200 НАВІТЬ КОЛИ ЗАПИТ ПРОВАЛИВСЯ — ознака невдачі лежить
// у тілі, в полі success. Тому axios тут ніколи не кине виняток на діловій
// помилці, і будь-який `.catch()` навколо нього для таких випадків не
// спрацьовує взагалі. Перевірка success — не перестраховка, а єдиний спосіб
// узнати про помилку. (Перевірено живим запитом: невідомий ключ → HTTP 200,
// success:false, errors:["User is undefined"].)
//
// ⚠️ Шлях у URL Пошта ІГНОРУЄ — маршрутизація йде виключно за modelName +
// calledMethod у тілі. Старий код постив на `/searchSettlements`, маючи в тілі
// getCities, тож насправді роками працював getCities. Тут шлях порожній, щоб
// назва методу була видна в одному місці.
async function npPost(modelName, calledMethod, methodProperties = {}) {
  const { data } = await npClient.post('', {
    apiKey: NOVA_POST,
    modelName,
    calledMethod,
    methodProperties,
  });

  if (!data || data.success !== true) {
    const error = new NovaPoshtaError(data && data.errors, data && data.errorCodes);
    console.error(
      `[novaposhta] ${modelName}.${calledMethod} відхилено:`,
      error.errors,
      error.errorCodes
    );
    throw error;
  }

  return Array.isArray(data.data) ? data.data : [];
}

// Порівняння назв міст і відділень.
//
// У замовленні лежить рівно той рядок, який колись показала Пошта, тож звичайно
// збігається символ у символ. Але між замовленням і формуванням ТТН минають
// дні, а Пошта інколи правит пробіли й регістр у своїх же назвах — тому
// порівнюємо нормалізовано, а не через ===.
const normalize = value =>
  String(value || '')
    // Нерозривний пробіл і типографський апостроф у назвах Пошти трапляються, а
    // на вигляд не відрізняються від звичайних — око такий різнобій не зловить.
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2019\u02BC\u0060]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Ref міста за назвою з замовлення.
//
// Однойменні міста Пошта розрізняє в самій назві («Іванівка (Арбузинський
// р-н)»), тож точний збіг однозначний — перевірено на живих даних. Пошук іде
// за тим самим методом, яким наповнювався випадайка на checkout, інакше
// довідники могли б розійтись.
async function resolveCityRef(cityName) {
  const query = String(cityName || '').trim();

  if (!query) {
    throw new NovaPoshtaError(['Місто в замовленні порожнє']);
  }

  const cities = await npPost('Address', 'getCities', {
    FindByString: query,
    Limit: '50',
    Page: '1',
  });

  const exact = cities.find(item => normalize(item.Description) === normalize(query));

  if (!exact) {
    throw new NovaPoshtaError([
      `Місто «${query}» не знайдено в довіднику Нової Пошти. Перевірте адресу в замовленні.`,
    ]);
  }

  return { ref: exact.Ref, name: exact.Description };
}

// Відділення за назвою в межах міста.
//
// Повертає не лише Ref: категорія вирішує ServiceType, а ліміти дають змогу
// пояснити менеджеру відмову Пошти ще до її отримання.
async function resolveWarehouse(cityName, warehouseName) {
  const query = String(warehouseName || '').trim();

  if (!query) {
    throw new NovaPoshtaError(['Відділення в замовленні порожнє']);
  }

  const warehouses = await npPost('Address', 'getWarehouses', {
    CityName: String(cityName || '').trim(),
    Language: 'UA',
  });

  const exact = warehouses.find(item => normalize(item.Description) === normalize(query));

  if (!exact) {
    throw new NovaPoshtaError([
      `Відділення «${query}» не знайдено в місті «${cityName}». Перевірте адресу в замовленні.`,
    ]);
  }

  return {
    ref: exact.Ref,
    name: exact.Description,
    cityRef: exact.CityRef,
    category: exact.CategoryOfWarehouse,
    // У відділень ліміт лежить у PlaceMaxWeightAllowed, у поштоматів — у
    // TotalMaxWeightAllowed, а «нуль» означає «не обмежено цим полем».
    maxWeight:
      Number(exact.PlaceMaxWeightAllowed) || Number(exact.TotalMaxWeightAllowed) || null,
    limitsOnDimensions: exact.ReceivingLimitationsOnDimensions || null,
  };
}

module.exports = {
  npPost,
  resolveCityRef,
  resolveWarehouse,
  NovaPoshtaError,
};
