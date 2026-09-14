const { Schema, model } = require('mongoose');

const { normalizePhone } = require('../helpers/phone');
const { FUNNEL_STAGES } = require('../helpers/funnel');

// Клієнт CRM.
//
// ⚠️ Це НЕ те саме, що `User`. `User` — акаунт на сайті, він є лише в тих, хто
// реєструвався. Contact охоплює всіх, хто колись замовляв (переважно гості без
// акаунта), плюс доданих менеджером руками. Одна людина може мати і те, і те, а
// може — лише Contact.
//
// ⚠️ Дані клієнта в самому замовленні (firstName, tel, email) Contact НЕ
// замінює й не змінює: їх показує кабінет клієнта, і вони мають лишатись
// такими, якими людина їх ввела при замовленні. Contact — окремий, внутрішній
// шар для менеджера.
const phoneSchema = new Schema(
  {
    // Як записав менеджер або як прийшло із замовлення — показуємо саме це.
    number: { type: String, required: true },
    // ⚠️ Те саме, зведене до 380XXXXXXXXX, — і шукати треба ТІЛЬКИ за ним.
    // Один номер трапляється в базі як «+380671234567», «0671234567» і
    // «+38 (067) 123-45-67»; рядкове порівняння їх не зведе, і замовлення
    // прив'язалось би до нового клієнта замість наявного.
    digits: { type: String, required: true, index: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

const contactSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    phones: {
      type: [phoneSchema],
      default: [],
    },
    email: { type: String, default: '', trim: true },

    // ТИП — як клієнт з'явився. Не плутати з видом нижче.
    type: {
      type: String,
      enum: ['site', 'manual'],
      default: 'site',
      index: true,
    },
    // ВИД — як з ним працюють. Оптовику інші ціни й інша розмова.
    kind: {
      type: String,
      enum: ['retail', 'wholesale'],
      default: 'retail',
      index: true,
    },

    company: { type: String, default: '', trim: true },
    note: { type: String, default: '' },

    // Стадія воронки продажів. Значення — з helpers/funnel.js.
    //
    // ⚠️ Поле є в УСІХ клієнтів, але сенс має лише в учасників воронки —
    // потенційних (ще без замовлень) і сплячих оптовиків. У того, хто вже
    // купує, тут лежить стадія, якої ніхто не побачить: на дошку він не
    // потрапляє. Заводити поле лише частині документів було б гірше — запити
    // довелось би писати з оглядкою на його відсутність.
    //
    // ⚠️ Стадії 'negotiation' більше немає. Клієнти з нею (якщо такі лишились
    // від попередньої версії) показуються на першій стадії — див. getFunnel.
    funnelStage: {
      type: String,
      enum: FUNNEL_STAGES,
      default: 'new',
      index: true,
    },
    // Коли повернутись до розмови. Джерело нагадувань: усе, у чого ця дата
    // настала або минула, потрапляє в блок «Сьогодні звʼязатися» й у лічильник
    // біля «Клієнтів».
    //
    // Заповнюється трьома шляхами: «Відмова» (повернутись пізніше), вхід у
    // Реанімацію (сьогодні) і вручну разом з активністю.
    nextContactDate: { type: Date, default: null, index: true },
    // Коли оптовик потрапив у Реанімацію.
    //
    // ⚠️ Склад Реанімації рахується НА ЛЬОТУ з дат замовлень — це поле не
    // визначає, хто в ній. Воно існує лише як сторож одноразовості: без нього
    // кожне відкриття дошки перезаписувало б `nextContactDate` на сьогодні й
    // затирало дату, яку менеджер виставив руками.
    reactivationSince: { type: Date, default: null },
    // Причина відмови, як її записав менеджер.
    lostReason: { type: String, default: null },
  },
  { versionKey: false, timestamps: true }
);

// Пошук у списку — за іменем, компанією й номером, як його бачить менеджер.
contactSchema.index({ name: 'text', company: 'text' });

// Головний телефон: перший позначений, інакше просто перший.
//
// Список клієнтів показує один номер, і він має бути передбачуваним — інакше
// той самий клієнт у списку й у картці виглядав би по-різному.
contactSchema.methods.primaryPhone = function primaryPhone() {
  const marked = this.phones.find(phone => phone.isPrimary);

  return marked || this.phones[0] || null;
};

// Нормалізацію робимо в моделі, а не на кожному виклику: інакше рано чи пізно
// хтось запише телефон повз неї, і клієнт перестане знаходитись.
contactSchema.pre('validate', function normalizePhones(next) {
  if (Array.isArray(this.phones)) {
    this.phones.forEach(phone => {
      phone.digits = normalizePhone(phone.number);
    });

    // Рівно один головний. Порожній масив лишаємо порожнім.
    if (this.phones.length > 0 && !this.phones.some(phone => phone.isPrimary)) {
      this.phones[0].isPrimary = true;
    }
  }

  next();
});

const Contact = model('contact', contactSchema);

module.exports = { Contact };
