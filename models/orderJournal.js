const { Schema, model } = require('mongoose');

// Внутрішній журнал замовлення: що з ним робили й що з ним сталося.
//
// ⚠️ НЕ плутати з `order.comment` — то коментар КЛІЄНТА з оформлення
// («подзвоніть перед відправкою»), його пише покупець і бачить він сам. Журнал
// клієнту не видно ніколи: це записи менеджера для менеджера.
//
// ⚠️ Окрема модель, а не поле в CRM-Activity. Спільна в них лише форма, не суть:
// активність — це «що людина зробила з людиною», запис журналу — «що сталося з
// документом». Звести їх в одну колекцію означало б зробити `contactId`
// необов'язковим (а це справжній інваріант CRM) і злити типи в перелік, де
// половина значень невалідна в кожному з контекстів — ніщо не завадило б
// «зустрічі» на замовленні чи «ТТН» у клієнта.
//
// Спільним лишилось те, що справді спільне: дисципліна безпечного запису —
// див. безпечнийЗапис у helpers/activities.js.
const orderJournalSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'order',
      required: true,
      index: true,
    },
    type: {
      type: String,
      // note — рука менеджера; решта пишеться сама.
      enum: ['note', 'status', 'ttn', 'system'],
      required: true,
    },
    text: { type: String, default: '', trim: true },
    date: { type: Date, default: Date.now },
    // Логін менеджера. Рядком, а не посиланням: адмінів одиниці, а зв'язок
    // змусив би населяти його при кожному читанні журналу заради одного слова.
    createdBy: { type: String, default: '' },
    isAuto: { type: Boolean, default: false },
  },
  { versionKey: false, timestamps: true }
);

// Журнал завжди читається за замовленням і від найсвіжішого.
orderJournalSchema.index({ orderId: 1, date: -1 });

const OrderJournal = model('orderJournal', orderJournalSchema);

module.exports = { OrderJournal };
