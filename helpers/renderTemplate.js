// Підстановка плейсхолдерів у текст повідомлення.
//
// Використовується Блоком 3 (модалка з готовим текстом), але живе тут, бо
// значення беруться і з замовлення, і з налаштувань — місце йому поруч із
// шаблонами, а не в UI.

const PLACEHOLDERS = [
  'orderNumber',
  'clientName',
  'amount',
  'prepayment',
  'codAmount',
  'prepaymentPercent',
  'requisites',
  'ttn',
  'paymentPurpose',
];

function formatAmount(value) {
  const amount = Number(value);

  return Number.isFinite(amount) && amount > 0
    ? String(Math.round(amount))
    : '';
}

// Значення для кожного плейсхолдера. Порожній рядок означає «для цього
// замовлення такого немає» — рядок з ним буде викинутий (див. нижче).
function buildValues(order = {}, settings = {}) {
  const orderNumber = order.numberOfOrder ? String(order.numberOfOrder) : '';
  const clientName = [order.firstName, order.lastName].filter(Boolean).join(' ');
  const together = Number(order.together);
  const prepayment = Number(order.prepaymentAmount);
  const hasPrepayment = Number.isFinite(prepayment) && prepayment > 0;

  return {
    orderNumber,
    clientName,
    amount: formatAmount(together),
    prepayment: hasPrepayment ? formatAmount(prepayment) : '',
    // Решта до сплати накладеним. Рахуємо лише коли передоплата справді є:
    // інакше «решта» дорівнювала б повній сумі й вводила б в оману.
    codAmount:
      hasPrepayment && Number.isFinite(together)
        ? formatAmount(together - prepayment)
        : '',
    prepaymentPercent:
      settings.prepaymentPercent === undefined || settings.prepaymentPercent === null
        ? ''
        : String(settings.prepaymentPercent),
    requisites: settings.requisites || '',
    ttn: order.ttn || '',
    paymentPurpose: orderNumber ? `Оплата за замовлення №${orderNumber}` : '',
  };
}

// Рядок, у якому лишився плейсхолдер без значення, викидається ЦІЛКОМ.
//
// Альтернатива — підставити порожній рядок — дає «Номер ТТН: » у повідомленні
// клієнту, що виглядає як недороблене повідомлення. Ціна рішення: рядок із
// двома плейсхолдерами, де порожній лише один, зникне повністю.
function renderTemplate(templateText, order, settings) {
  if (!templateText) {
    return '';
  }

  const values = buildValues(order, settings);

  return String(templateText)
    .split('\n')
    .filter(line => {
      const used = line.match(/\{(\w+)\}/g) || [];

      return used.every(token => {
        const name = token.slice(1, -1);

        // Невідомий плейсхолдер лишаємо як є: це друкарська помилка власника,
        // і мовчки з'їдати через неї цілий рядок було б гірше.
        if (!PLACEHOLDERS.includes(name)) {
          return true;
        }

        return values[name] !== '';
      });
    })
    .map(line =>
      line.replace(/\{(\w+)\}/g, (match, name) =>
        PLACEHOLDERS.includes(name) ? values[name] : match
      )
    )
    .join('\n')
    .trim();
}

module.exports = {
  PLACEHOLDERS,
  renderTemplate,
};
