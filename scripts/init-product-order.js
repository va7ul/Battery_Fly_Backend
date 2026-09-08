/**
 * Разовий скрипт: зафіксувати ПОТОЧНИЙ порядок товарів.
 *
 * Навіщо. До появи поля `order` жоден ендпоінт категорії не мав `.sort()` —
 * товари віддавались у натуральному порядку MongoDB. Щойно ендпоінти починають
 * сортувати за `order`, а він у всіх порожній, порядок на вітрині може
 * поїхати. Скрипт читає товари ТИМ САМИМ запитом без сортування — тобто бачить
 * рівно те, що бачить сайт — і проставляє 0,1,2… у цьому ж порядку. Візуально
 * після нього не змінюється нічого, але з'являється база для перетягування.
 *
 * ⚠️ Запускати ОДИН раз, одразу після деплою. Повторний запуск переписав би
 * ручний порядок назад на натуральний — тому є запобіжник: за замовчуванням
 * скрипт чіпає лише товари, у яких `order` ще порожній, і пропускає списки, де
 * порядок уже проставлений. `--force` знімає запобіжник (треба лише якщо
 * перший запуск обірвався посередині).
 *
 * ЗАПУСК (з кореня бека, DB_HOST у .env вказує на потрібну базу):
 *   node scripts/init-product-order.js --dry-run
 *   node scripts/init-product-order.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { PRODUCT_SCOPES } = require('../helpers/productScopes');

const { DB_HOST } = process.env;

const run = async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  if (!DB_HOST) {
    console.error('DB_HOST не заданий — перевірте .env');
    process.exit(1);
  }

  await mongoose.connect(DB_HOST);

  console.log(`База: ${mongoose.connection.name}`);
  console.log(dryRun ? 'Режим: суха прогонка, нічого не пишемо\n' : 'Режим: запис\n');

  let touched = 0;

  for (const [scopeKey, { model, filter }] of Object.entries(PRODUCT_SCOPES)) {
    // БЕЗ .sort() — саме так товари читає сайт сьогодні.
    const products = await model.find(filter, { _id: 1, name: 1, order: 1 }).lean();

    if (products.length === 0) {
      console.log(`${scopeKey}: порожньо`);
      continue;
    }

    const alreadyOrdered = products.filter(item => Number.isFinite(item.order));

    if (alreadyOrdered.length > 0 && !force) {
      console.log(
        `${scopeKey}: пропущено — порядок уже заданий у ${alreadyOrdered.length} з ${products.length}. ` +
          'Перезаписати можна лише з --force'
      );
      continue;
    }

    if (!dryRun) {
      await model.bulkWrite(
        products.map((item, index) => ({
          updateOne: { filter: { _id: item._id }, update: { $set: { order: index } } },
        }))
      );
    }

    touched += products.length;
    console.log(
      `${scopeKey}: ${dryRun ? 'проставили б' : 'проставлено'} ${products.length} ` +
        `(перший — «${products[0].name}», останній — «${products[products.length - 1].name}»)`
    );
  }

  await mongoose.disconnect();
  console.log(`\nГотово. Товарів ${dryRun ? 'під зміну' : 'оновлено'}: ${touched}.`);
};

run().catch(error => {
  console.error('Скрипт впав:', error);
  process.exit(1);
});
