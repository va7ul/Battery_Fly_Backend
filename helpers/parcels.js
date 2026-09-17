// Посилки замовлення: розподіл товарів і синхронізація застарілих полів.
//
// Живе окремо, бо тим самим користуються ендпоінти посилок, стара ручка
// create-ttn (яку лишили робочою заради сумісності) і разовий скрипт міграції.

// Скільки одиниць кожного РЯДКА кошика вже лежить у посилках.
//
// ⚠️ Рахуємо за індексом рядка, а не за codeOfGood. Той самий код трапляється
// в кошику двічі — з різною ємністю, герметизацією чи холдером, — і це різні
// товари з різною ціною. Підсумок за кодом злив би їх в один і дозволив би
// відправити «чотири», коли в кожному рядку по дві.
function розподілено(order) {
  const мапа = new Map();

  (order.parcels || []).forEach(parcel => {
    (parcel.items || []).forEach(item => {
      const ключ = Number(item.lineIndex);
      мапа.set(ключ, (мапа.get(ключ) || 0) + Number(item.quantity || 0));
    });
  });

  return мапа;
}

// Повнота відправлення: скільки з кожного рядка розподілено й чи все.
//
// Повертає рядки в тому ж порядку, що й кошик, — адмінка показує їх поруч із
// позиціями замовлення, і розбіжність у порядку читалася б як помилка.
function getFulfillment(order) {
  const уже = розподілено(order);

  const lines = (order.cartItems || []).map((item, lineIndex) => {
    const ordered = Number(item.quantityOrdered) || 0;
    const packed = уже.get(lineIndex) || 0;

    return {
      lineIndex,
      codeOfGood: item.codeOfGood || '',
      name: item.name || '',
      capacityKey: item.capacityKey || null,
      ordered,
      packed,
      // Від'ємного тут бути не може — валідація не пропустить, — але якщо
      // кошик колись відредагують після створення посилок, краще показати
      // нуль, ніж від'ємне число.
      remaining: Math.max(0, ordered - packed),
    };
  });

  const totalOrdered = lines.reduce((sum, line) => sum + line.ordered, 0);
  const totalPacked = lines.reduce((sum, line) => sum + line.packed, 0);

  return {
    lines,
    totalOrdered,
    totalPacked,
    // ⚠️ «Усе відправлено» = кожен рядок закритий, а не збіг підсумків: двох
    // зайвих одиниць одного товару й двох нестачі іншого дали б однакову суму
    // при неповному відправленні.
    allItemsShipped: lines.every(line => line.packed >= line.ordered),
  };
}

// Перевірка того, що менеджер поклав у посилку.
//
// Кидає текст помилки (рядком) — контролер обгортає його у свій HttpError,
// щоб цей файл не залежав від express.
function перевіритиПозиції(order, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Оберіть хоча б один товар для посилки');
  }

  const { lines } = getFulfillment(order);
  const заІндексом = new Map(lines.map(line => [line.lineIndex, line]));
  const зібрано = [];

  items.forEach(item => {
    const lineIndex = Number(item.lineIndex);
    const quantity = Math.trunc(Number(item.quantity));
    const line = заІндексом.get(lineIndex);

    if (!line) {
      throw new Error(`Позиції №${lineIndex + 1} немає в замовленні`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Кількість для «${line.name}» має бути більшою за нуль`);
    }

    if (quantity > line.remaining) {
      throw new Error(
        `Для «${line.name}» лишилось нерозподіленими ${line.remaining} шт, а обрано ${quantity}`
      );
    }

    // ⚠️ Код звіряємо з тим, що лежить у кошику. Якщо адмінка надіслала
    // застарілий індекс (кошик відредагували після створення посилок), товар
    // мовчки поїхав би не той.
    if (item.codeOfGood && line.codeOfGood && String(item.codeOfGood) !== String(line.codeOfGood)) {
      throw new Error(
        `Позиція №${lineIndex + 1} у замовленні змінилась — оновіть сторінку й спробуйте ще раз`
      );
    }

    зібрано.push({
      lineIndex,
      codeOfGood: line.codeOfGood,
      name: line.name,
      quantity,
    });
  });

  // Два рядки на ту саму позицію в одній посилці — не помилка сама по собі,
  // але сума мусить влізти в залишок.
  const заРядком = new Map();

  зібрано.forEach(item => {
    заРядком.set(item.lineIndex, (заРядком.get(item.lineIndex) || 0) + item.quantity);
  });

  заРядком.forEach((сума, lineIndex) => {
    const line = заІндексом.get(lineIndex);

    if (сума > line.remaining) {
      throw new Error(
        `Для «${line.name}» лишилось ${line.remaining} шт, а в посилці набралось ${сума}`
      );
    }
  });

  return зібрано;
}

// Коди, за яких посилка вважається отриманою.
//
// ⚠️ Дзеркало таблиці в helpers/npTracking.js: там ці ж коди дають дію
// 'delivered'. Тримати їх у двох місцях довелось, бо npTracking відповідає на
// питання «що робити з кодом», а тут — «чи закінчився шлях цієї посилки», і
// плутати ці питання в одній функції означало б тягти сюди Telegram і журнал.
const ОТРИМАНО = ['9', '10', '11'];

const isParcelDelivered = parcel =>
  ОТРИМАНО.includes(String((parcel && parcel.npStatusCode) || ''));

// Чи всі посилки замовлення отримані.
//
// ⚠️ КОЖНА має бути отримана, не «більшість» і не «перша». Замовлення з двох
// коробок, де приїхала одна, — це замовлення в дорозі: клієнт ще чекає, і
// назвати його доставленим означало б збрехати і йому, і статистиці.
//
// ⚠️ Замовлення без посилок → false. Йому нема що доставляти, і крон його не
// чіпає взагалі.
//
// ⚠️ Наслідок, про який варто знати: мертва посилка (код 2/3) НЕ рахується
// отриманою, тож замовлення з нею не закриється саме. Це навмисно — мертва
// накладна означає, що щось пішло не так, і вирішити це має людина: скинути
// посилку й створити нову.
function allParcelsDelivered(order) {
  const parcels = (order && order.parcels) || [];

  return parcels.length > 0 && parcels.every(isParcelDelivered);
}

// Скільки посилок уже отримано — для показу в адмінці.
function deliveredCount(order) {
  return ((order && order.parcels) || []).filter(isParcelDelivered).length;
}

module.exports = {
  allParcelsDelivered,
  isParcelDelivered,
  deliveredCount,
  getFulfillment,
  перевіритиПозиції,
  розподілено,
};
