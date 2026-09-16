/**
 * Разовий скрипт: перенести наявні ТТН у масив посилок.
 *
 * Навіщо. До появи posilok замовлення мало рівно один номер — order.ttn. Після
 * переробки керування ведеться через parcels[], і замовлення зі старим номером
 * виглядало б як «жодної посилки», хоча коробка давно їде. Скрипт робить з
 * кожної такої ТТН одну посилку з УСІМА товарами замовлення й клієнтською
 * адресою — саме те, чим вона й була.
 *
 * ⚠️ method: 'manual' для всіх перенесених, навіть якщо ТТН колись згенерували
 * через API. Прапорець каже не «звідки взявся номер колись», а «чи можемо ми
 * відтворити цю накладну» — а для старих накладних у нас немає ні габаритів, ні
 * опису, з якими їх створювали.
 *
 * ⚠️ Ідемпотентний: замовлення, у якого posilki вже є, не чіпає взагалі.
 * Повторний запуск нічого не подвоїть.
 *
 * ⚠️ Старі поля ttn/ttnRef/npStatus* НЕ стирає. На них досі спираються крон
 * трекінгу та шаблони повідомлень; вони лишаються дзеркалом першої посилки й
 * прибираються пізніше, разом із наступними етапами.
 *
 * ЗАПУСК (з кореня бека, DB_HOST у .env вказує на потрібну базу):
 *   node scripts/migrate-ttn-to-parcels.js --dry-run
 *   node scripts/migrate-ttn-to-parcels.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { Order } = require('../models/order');

const { DB_HOST } = process.env;

const run = async () => {
  const dryRun = process.argv.slice(2).includes('--dry-run');

  if (!DB_HOST) {
    console.error('DB_HOST не заданий — перевірте .env');
    process.exit(1);
  }

  await mongoose.connect(DB_HOST);
  console.log(dryRun ? '── ПРОБНИЙ ЗАПУСК, нічого не пишемо ──\n' : '── бойовий запуск ──\n');

  const orders = await Order.find({});

  console.log(`замовлень у базі: ${orders.length}`);

  let перенесено = 0;
  let вжеМали = 0;
  let безТтн = 0;

  for (const order of orders) {
    if (Array.isArray(order.parcels) && order.parcels.length > 0) {
      вжеМали += 1;
      continue;
    }

    if (!order.ttn) {
      безТтн += 1;
      continue;
    }

    const items = (order.cartItems || []).map((item, lineIndex) => ({
      lineIndex,
      codeOfGood: item.codeOfGood || '',
      name: item.name || '',
      quantity: Math.max(1, Math.trunc(Number(item.quantityOrdered) || 1)),
    }));

    const посилка = {
      ttn: order.ttn,
      ttnRef: order.ttnRef || null,
      method: 'manual',
      items,
      recipient: { useClientAddress: true },
      // Наложку старих накладних відновити нізвідки: у замовленні лежить лише
      // передоплата, а що саме пішло в накладну — знає тільки Пошта.
      codAmount: null,
      npStatusCode: order.npStatusCode || null,
      npStatusText: order.npStatusText || null,
      npStatusUpdatedAt: order.npStatusUpdatedAt || null,
    };

    console.log(`  №${order.numberOfOrder}: ТТН ${order.ttn} → посилка з ${items.length} позиц.`);

    if (!dryRun) {
      order.parcels = [посилка];
      await order.save();
    }

    перенесено += 1;
  }

  console.log('\n── підсумок ──');
  console.log(`перенесено в посилки:        ${перенесено}`);
  console.log(`вже мали посилки (пропуск):  ${вжеМали}`);
  console.log(`без ТТН (нічого переносити): ${безТтн}`);

  if (dryRun) {
    console.log('\nЦе був пробний запуск. Для запису — без --dry-run.');
  }

  await mongoose.disconnect();
};

run().catch(error => {
  console.error('СКРИПТ ВПАВ:', error);
  process.exit(1);
});
