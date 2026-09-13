/**
 * Разовий скрипт: завести клієнтів CRM з наявних замовлень.
 *
 * Навіщо. Contact з'явився щойно, тож авто-прив'язка працює лише для НОВИХ
 * замовлень. Уся історія — люди, які замовляли роками, — лишилась би поза CRM,
 * і розділ «Клієнти» відкрився б майже порожнім. Скрипт проходить замовлення,
 * групує їх за нормалізованим телефоном і заводить по одному клієнту на номер,
 * проставляючи order.contactId.
 *
 * ⚠️ Ідемпотентний: клієнта шукає за тим самим нормалізованим номером, що й
 * бойовий код, і повторний запуск нікого не дублює. Замовлення, у яких
 * contactId уже стоїть, не чіпає — тобто ручні прив'язки він не переб'є.
 *
 * ⚠️ Ім'я бере з НАЙСВІЖІШОГО замовлення цього номера: люди переїжджають і
 * міняють прізвища, і актуальніше написання корисніше за найперше.
 *
 * ЗАПУСК (з кореня бека, DB_HOST у .env вказує на потрібну базу):
 *   node scripts/init-contacts.js --dry-run
 *   node scripts/init-contacts.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { Order } = require('../models/order');
const { Contact } = require('../models/contact');
const { normalizePhone } = require('../helpers/phone');

const { DB_HOST } = process.env;

const run = async () => {
  const dryRun = process.argv.slice(2).includes('--dry-run');

  if (!DB_HOST) {
    console.error('DB_HOST не заданий — перевірте .env');
    process.exit(1);
  }

  await mongoose.connect(DB_HOST);
  console.log(dryRun ? '── ПРОБНИЙ ЗАПУСК, нічого не пишемо ──\n' : '── бойовий запуск ──\n');

  // Від найстаріших до найновіших: так «найсвіжіше ім'я» просто перезаписує
  // попереднє, без окремого порівняння дат.
  const orders = await Order.find({}).sort({ createdAt: 1 });

  console.log(`замовлень у базі: ${orders.length}`);

  // Групуємо за номером у пам'яті: замовлень тут тисячі, не мільйони, а один
  // прохід читається краще за агрегацію з нормалізацією на боці бази.
  const заНомером = new Map();
  let безТелефону = 0;

  orders.forEach(order => {
    const digits = normalizePhone(order.tel);

    if (!digits) {
      безТелефону += 1;
      return;
    }

    заНомером.set(digits, {
      digits,
      number: order.tel,
      name: [order.lastName, order.firstName].filter(Boolean).join(' ').trim(),
      email: order.email || '',
      orders: [...(заНомером.get(digits)?.orders || []), order],
    });
  });

  console.log(`унікальних телефонів: ${заНомером.size}`);
  if (безТелефону) console.log(`замовлень без телефону (пропущено): ${безТелефону}`);
  console.log();

  let створено = 0;
  let знайдено = 0;
  let прив1язано = 0;
  let пропущено = 0;

  for (const запис of заНомером.values()) {
    let contact = await Contact.findOne({ 'phones.digits': запис.digits });

    if (contact) {
      знайдено += 1;
    } else {
      створено += 1;

      if (!dryRun) {
        contact = await Contact.create({
          name: запис.name || `Клієнт ${запис.digits}`,
          phones: [{ number: запис.number, digits: запис.digits, isPrimary: true }],
          email: запис.email,
          type: 'site',
          kind: 'retail',
        });
      }
    }

    for (const order of запис.orders) {
      if (order.contactId) {
        // Уже прив'язане — можливо, руками. Не чіпаємо.
        пропущено += 1;
        continue;
      }

      прив1язано += 1;

      if (!dryRun) {
        order.contactId = contact._id;
        await order.save();
      }
    }
  }

  console.log(`клієнтів створено:        ${створено}`);
  console.log(`клієнтів уже існувало:    ${знайдено}`);
  console.log(`замовлень прив'язано:     ${прив1язано}`);
  console.log(`замовлень пропущено:      ${пропущено} (уже мали клієнта)`);

  if (dryRun) {
    console.log('\nПробний запуск — у базі нічого не змінилось.');
  }

  await mongoose.disconnect();
};

run().catch(error => {
  console.error('Скрипт впав:', error);
  process.exit(1);
});
