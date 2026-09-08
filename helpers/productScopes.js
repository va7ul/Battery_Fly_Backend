// Області впорядкування товарів.
//
// «Категорія» тут — не поле в базі, а СПИСОК, який бачить менеджер в адмінці і
// клієнт на сайті. Це не одне й те саме: акумулятори віддаються запитом за
// `type` ('18650'), а прилади й збірки — за `category`. Плюс дві різні
// колекції. Тому порядок прив'язаний до області, а не до поля.
//
// Один перелік на всіх: за ним і ендпоінт reorder перевіряє, що йому не
// підсунули чужі id, і разовий скрипт проставляє початковий порядок. Розійдись
// вони — порядок у базі перестав би відповідати тому, що на екрані.

const { Product } = require('../models/product');
const { ProductZbirky } = require('../models/products_zbirky');

const PRODUCT_SCOPES = {
  'battery-18650': { model: Product, filter: { type: '18650' } },
  'battery-21700': { model: Product, filter: { type: '21700' } },
  'battery-32650': { model: Product, filter: { type: '32650' } },
  'battery-li-po': { model: Product, filter: { type: 'li-po' } },
  'battery-lifepo4': { model: Product, filter: { type: 'lifepo4' } },
  devices: { model: Product, filter: { category: 'devices' } },
  materials: { model: Product, filter: { category: 'materials' } },
  assembly: { model: ProductZbirky, filter: { category: 'assembly' } },
  fpv: { model: ProductZbirky, filter: { category: 'fpv' } },
  transport: { model: ProductZbirky, filter: { category: 'transport' } },
  toys: { model: ProductZbirky, filter: { category: 'toys' } },
};

// Порядок сортування для будь-якого списку товарів.
//
// `_id` другим ключем обов'язковий: поки в товарів однаковий order (а до
// разового скрипта він у всіх null), сортування за одним полем не визначене —
// база може віддати їх щоразу в іншому порядку, і сітка на сайті стрибала б
// між перезавантаженнями.
const ORDER_SORT = { order: 1, _id: 1 };

// До якої області належить товар. Потрібно при створенні: новий товар стає
// останнім саме у своєму списку.
function findScopeFor(product) {
  const entry = Object.entries(PRODUCT_SCOPES).find(([, scope]) =>
    Object.entries(scope.filter).every(
      ([field, value]) => product[field] === value
    )
  );

  return entry ? entry[0] : null;
}

// Наступний order у кінці області. null, якщо товар не належить жодній —
// тоді поле лишається порожнім, і такий товар просто стане в кінці списку.
async function getNextOrder(product) {
  const scopeKey = findScopeFor(product);

  if (!scopeKey) {
    return null;
  }

  const { model, filter } = PRODUCT_SCOPES[scopeKey];
  const last = await model
    .findOne(filter, { order: 1 })
    .sort({ order: -1 })
    .lean();

  const lastOrder = last && Number.isFinite(last.order) ? last.order : null;

  return lastOrder === null ? 0 : lastOrder + 1;
}

// Товари без order — у КІНЕЦЬ списку.
//
// ⚠️ Самим лише `.sort({ order: 1 })` цього не досягти: у MongoDB відсутнє поле
// й null сортуються ПЕРЕД числами, тож товар, доданий повз адмінку (або до
// разового скрипта), стрибав би на перше місце вітрини. Тому база дає базовий
// порядок (order asc, потім _id asc), а тут стабільним поділом переносимо
// невпорядковані в хвіст: усередині кожної групи порядок від бази зберігається,
// бо Array.prototype.sort і filter стабільні.
//
// Після разового скрипта поділ ні на що не впливає — order є у всіх.
function sortByOrder(products) {
  const ordered = products.filter(item => Number.isFinite(item.order));
  const rest = products.filter(item => !Number.isFinite(item.order));

  return [...ordered, ...rest];
}

module.exports = {
  PRODUCT_SCOPES,
  ORDER_SORT,
  findScopeFor,
  getNextOrder,
  sortByOrder,
};
