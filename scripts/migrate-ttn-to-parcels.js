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
 * ⚠️ Читає старі поля ЧЕРЕЗ СИРУ КОЛЕКЦІЮ, а не через модель. У схемі Order їх
 * більше немає — mongoose просто не віддав би їх, і скрипт тихо відрапортував
 * би «нічого переносити» над замовленнями, які насправді чекають на перенесення.
 * Саме такий мовчазний нуль і був би найгіршим: ці замовлення лишились би без
 * посилок, тобто поза трекінгом і поза керуванням, і ніхто б не помітив.
 *
 * ⚠️ Старих полів НЕ стирає. Вони лишаються в документах мертвим вантажем — код
 * їх не читає, місця вони не просять, а видалення тисяч документів заради
 * охайності — ризик без причини.
 *
 * ЗАПУСК (з кореня бека, DB_HOST у .env вказує на потрібну базу):
 *   node scripts/migrate-ttn-to-parcels.js --dry-run
 *   node scripts/migrate-ttn-to-parcels.js
 */

require('dotenv').config();
const mongoose = require('mongoose');


const { DB_HOST } = process.env;

const run = async () => {
  const dryRun = process.argv.slice(2).includes('--dry-run');

  if (!DB_HOST) {
    console.error('DB_HOST не заданий — перевірте .env');
    process.exit(1);
  }

  await mongoose.connect(DB_HOST);
  console.log(dryRun ? '── ПРОБНИЙ ЗАПУСК, нічого не пишемо ──\n' : '── бойовий запуск ──\n');

  // ⚠️ Сира колекція: старих полів у схемі вже немає, і через модель вони
  // просто не приїхали б.
  const колекція = mongoose.connection.db.collection('orders');
  const orders = await колекція.find({}).toArray();

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
      // Пишемо теж напряму: модель про старі поля не знає, а нам треба лише
      // додати масив посилок, не чіпаючи решти документа.
      await колекція.updateOne(
        { _id: order._id },
        { $set: { parcels: [{ ...посилка, _id: new mongoose.Types.ObjectId(), createdAt: new Date(), updatedAt: new Date() }] } }
      );
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
