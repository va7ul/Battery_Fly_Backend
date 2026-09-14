/**
 * Разовий скрипт: проставити стартові стадії воронки наявним клієнтам.
 *
 * Навіщо. Воронка з'явилась щойно, і в усіх клієнтів лежить стадія 'new' —
 * значення за замовчуванням з Етапу 1. Без скрипта дошка відкрилась би так,
 * ніби всі оптовики, з якими магазин працює роками, — щойно здобуті ліди, і
 * колонка «Новий лід» була б єдиною непорожньою.
 *
 * Правило те саме, що й у бойовому коді (helpers/funnel.js): є замовлення —
 * «Співпрацюємо», немає — «Новий лід». Дублювати його тут не можна: розійшлося
 * б із тим, як стадію ставить контролер при переході клієнта в опт.
 *
 * ⚠️ Ідемпотентний і обережний: чіпає ЛИШЕ тих, у кого стадія досі 'new'.
 * Клієнта, якого менеджер уже пересунув у «Перемовини», повторний запуск не
 * відкине назад — навіть якщо замовлень у того ще немає.
 *
 * ⚠️ Роздрібних із сайту не чіпає взагалі: вони поза воронкою, і стадія в них
 * ні на що не впливає.
 *
 * ЗАПУСК (з кореня бека, DB_HOST у .env вказує на потрібну базу):
 *   node scripts/init-funnel-stages.js --dry-run
 *   node scripts/init-funnel-stages.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { Order } = require('../models/order');
const { Contact } = require('../models/contact');
const { normalizePhone } = require('../helpers/phone');
const { FUNNEL_QUERY, startingStage } = require('../helpers/funnel');

const { DB_HOST } = process.env;

const run = async () => {
  const dryRun = process.argv.slice(2).includes('--dry-run');

  if (!DB_HOST) {
    console.error('DB_HOST не заданий — перевірте .env');
    process.exit(1);
  }

  await mongoose.connect(DB_HOST);
  console.log(dryRun ? '── ПРОБНИЙ ЗАПУСК, нічого не пишемо ──\n' : '── бойовий запуск ──\n');

  const contacts = await Contact.find(FUNNEL_QUERY);

  console.log(`клієнтів у воронці: ${contacts.length}`);

  // Телефони всіх замовлень одним проходом: інакше на кожного клієнта пішов би
  // окремий запит, а клієнтів можуть бути сотні.
  const телефониЗамовлень = new Set();
  const прив1язані = new Set();

  const orders = await Order.find({}).select('tel contactId');

  orders.forEach(order => {
    const digits = normalizePhone(order.tel);

    if (digits) {
      телефониЗамовлень.add(digits);
    }

    if (order.contactId) {
      прив1язані.add(String(order.contactId));
    }
  });

  const має3амовлення = contact =>
    прив1язані.has(String(contact._id)) ||
    contact.phones.some(phone => phone.digits && телефониЗамовлень.has(phone.digits));

  let переведено = 0;
  let пропущено = 0;
  let безЗмін = 0;

  for (const contact of contacts) {
    // Не 'new' — значить, менеджер уже працював із цим клієнтом на дошці.
    if (contact.funnelStage !== 'new') {
      пропущено += 1;
      continue;
    }

    const стадія = startingStage(має3амовлення(contact));

    if (стадія === contact.funnelStage) {
      безЗмін += 1;
      continue;
    }

    console.log(`  ${contact.name} → ${стадія}`);

    if (!dryRun) {
      contact.funnelStage = стадія;
      await contact.save();
    }

    переведено += 1;
  }

  console.log('\n── підсумок ──');
  console.log(`переведено в «Співпрацюємо»: ${переведено}`);
  console.log(`лишились у «Новий лід»:      ${безЗмін}`);
  console.log(`не чіпали (стадія вже інша): ${пропущено}`);

  if (dryRun) {
    console.log('\nЦе був пробний запуск. Для запису — без --dry-run.');
  }

  await mongoose.disconnect();
};

run().catch(error => {
  console.error('СКРИПТ ВПАВ:', error);
  process.exit(1);
});
