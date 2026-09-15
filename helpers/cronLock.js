const { CronLock } = require('../models/cronLock');

// Скільки часу замок вважається живим.
//
// Прохід трекінгу — це секунди навіть на сотнях ТТН. П'ятнадцять хвилин узяті з
// величезним запасом: менше означало б ризик, що повільний прохід перехоплять
// посеред роботи, більше — що після падіння процесу задача мовчатиме півдня.
const СТАЛИЙ_ПІСЛЯ_МС = 15 * 60 * 1000;

// Спроба взяти замок. true — можна працювати, false — інший прохід уже йде.
//
// ⚠️ Одним атомарним findOneAndUpdate, а не «прочитати й записати». Два
// примірники процесу читають стан в ту саму мілісекунду, обидва бачать «вільно»
// і обидва починають — саме те, від чого замок мав захистити. Умова відбору й
// запис мусять бути однією операцією бази.
async function acquireLock(name) {
  // Документ має існувати, щоб наступний запит міг відбирати за умовою.
  // Дублікат ключа тут очікуваний: його щойно створив інший примірник.
  try {
    await CronLock.updateOne(
      { _id: name },
      { $setOnInsert: { running: false } },
      { upsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }
  }

  const прострочений = new Date(Date.now() - СТАЛИЙ_ПІСЛЯ_МС);

  const взято = await CronLock.findOneAndUpdate(
    {
      _id: name,
      $or: [{ running: false }, { startedAt: { $lt: прострочений } }],
    },
    { $set: { running: true, startedAt: new Date() } }
  );

  return Boolean(взято);
}

// Зняття замка. Викликається ЗАВЖДИ, зокрема після падіння проходу — інакше
// задача замовкне на 15 хвилин без причини.
async function releaseLock(name, lastResult = '') {
  await CronLock.updateOne(
    { _id: name },
    {
      $set: {
        running: false,
        finishedAt: new Date(),
        lastResult: String(lastResult).slice(0, 300),
      },
    }
  );
}

module.exports = { acquireLock, releaseLock, СТАЛИЙ_ПІСЛЯ_МС };
