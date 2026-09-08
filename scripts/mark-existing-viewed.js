/**
 * Разовий скрипт: позначити ІСНУЮЧІ записи переглянутими.
 *
 * Навіщо. Поле isViewed з'явилось разом із лічильниками непереглянутого. Без
 * цього скрипта вся історія — кожне замовлення й кожна заявка за весь час —
 * порахувалась би як «нове», і лічильник у шапці показав би тисячі.
 *
 * ⚠️ ЧОМУ ПОТРІБЕН cutoff, а не «оновити все».
 * Скрипт запускається РУКАМИ, а бек на Render уже працює й приймає замовлення.
 * Між деплоєм і запуском скрипта може прийти справжнє нове замовлення — і
 * «оновити все» тихо поховало б його: воно стало б переглянутим, ніколи не
 * потрапило б у лічильник, і менеджер його просто не побачив би. Тому чіпаємо
 * лише те, що створене ДО вказаного моменту.
 *
 * Фільтр подвійний:
 *   isViewed: { $exists: false }  — поля немає, тобто запис із «докласовної» ери;
 *   createdAt: { $lt: cutoff }    — і створений до межі.
 * Запис, створений після деплою, має isViewed: false (дефолт схеми) — під
 * $exists: false він не підпадає навіть при неправильному cutoff. Дві умови
 * замість однієї саме тому: одна з них страхує помилку в іншій.
 *
 * ЗАПУСК (з кореня бека, DB_HOST у .env має вказувати на потрібну базу):
 *   node scripts/mark-existing-viewed.js --before "2026-09-08T18:30:00Z"
 *   node scripts/mark-existing-viewed.js --before "..." --dry-run
 *
 * --before обов'язковий: без нього скрипт нічого не робить. Мовчазний дефолт
 * «зараз» — це рівно та помилка, від якої весь цей cutoff і захищає.
 *
 * Ідемпотентний: другий запуск оновить 0 записів (поле вже існує).
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { Order } = require('../models/order');
const { Print3dOrder } = require('../models/print3d');
const { FeedBack } = require('../models/feedback');

const { DB_HOST } = process.env;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const beforeIndex = args.indexOf('--before');
  const before = beforeIndex === -1 ? null : args[beforeIndex + 1];

  return { before, dryRun: args.includes('--dry-run') };
};

const usage = () => {
  console.error(
    [
      'Потрібен --before з моментом деплою в ISO-форматі.',
      '',
      '  node scripts/mark-existing-viewed.js --before "2026-09-08T18:30:00Z"',
      '  node scripts/mark-existing-viewed.js --before "2026-09-08T18:30:00Z" --dry-run',
      '',
      'Записи, створені ПІСЛЯ цього моменту, лишаться непереглянутими.',
    ].join('\n')
  );
};

const run = async () => {
  const { before, dryRun } = parseArgs();

  if (!before) {
    usage();
    process.exit(1);
  }

  const cutoff = new Date(before);

  if (Number.isNaN(cutoff.getTime())) {
    console.error(`Не розпізнав дату: ${before}`);
    usage();
    process.exit(1);
  }

  if (!DB_HOST) {
    console.error('DB_HOST не заданий — перевірте .env');
    process.exit(1);
  }

  await mongoose.connect(DB_HOST);

  const filter = {
    isViewed: { $exists: false },
    createdAt: { $lt: cutoff },
  };

  const targets = [
    ['Замовлення', Order],
    ['3D-друк', Print3dOrder],
    ['Заявки', FeedBack],
  ];

  console.log(`База: ${mongoose.connection.name}`);
  console.log(`Межа: усе, створене до ${cutoff.toISOString()}`);
  console.log(dryRun ? 'Режим: суха прогонка, нічого не пишемо\n' : 'Режим: запис\n');

  for (const [label, Model] of targets) {
    const total = await Model.countDocuments({});
    const affected = await Model.countDocuments(filter);
    // Скільки лишиться в лічильнику після скрипта — головна цифра для звірки.
    const staysUnviewed = await Model.countDocuments({
      isViewed: { $ne: true },
      $or: [{ isViewed: { $exists: true } }, { createdAt: { $gte: cutoff } }],
    });

    if (!dryRun && affected > 0) {
      await Model.updateMany(filter, { $set: { isViewed: true } });
    }

    console.log(
      `${label}: усього ${total}, ${dryRun ? 'позначили б' : 'позначено'} ${affected}, ` +
        `лишається непереглянутих ${staysUnviewed}`
    );
  }

  await mongoose.disconnect();
  console.log('\nГотово.');
};

run().catch(error => {
  console.error('Скрипт впав:', error);
  process.exit(1);
});
