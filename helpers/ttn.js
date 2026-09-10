const { npPost, resolveCityRef, resolveWarehouse, NovaPoshtaError } = require('./novaposhta');
const { CASH_ON_DELIVERY } = require('./orderStatus');

// Телефон для Пошти — 12 цифр, що починаються з 380.
//
// У замовленні він лежить у вигляді «+380671234567», але через кабінет і старі
// записи трапляються пробіли, дужки й дефіси. Пошта такий рядок відхиляє
// глухим «Phone is not valid», тож зводимо до цифр тут.
function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('380')) {
    return digits;
  }

  if (digits.length === 10 && digits.startsWith('0')) {
    return `38${digits}`;
  }

  if (digits.length === 9) {
    return `380${digits}`;
  }

  return digits;
}

// Дата відправлення у форматі Пошти — дд.мм.рррр.
function todayForNp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');

  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
}

// Отримувач як контрагент Нової Пошти.
//
// ⚠️ Ref отримувача НЕ можна вивести з імені: на відміну від міста й
// відділення, це запис у довіднику, якого може ще не існувати. Тому Пошта
// сама створює (або знаходить) приватну особу за іменем і телефоном, і
// повертає пару Ref — контрагента й контактної особи. Повторний виклик із
// тими самими даними дублікату не робить.
async function ensureRecipient({ firstName, lastName, phone }) {
  const created = await npPost('Counterparty', 'save', {
    FirstName: String(firstName || '').trim(),
    LastName: String(lastName || '').trim(),
    Phone: normalizePhone(phone),
    CounterpartyType: 'PrivatePerson',
    CounterpartyProperty: 'Recipient',
  });

  const party = created[0];

  if (!party || !party.Ref) {
    throw new NovaPoshtaError(['Нова Пошта не повернула отримувача']);
  }

  const contact = party.ContactPerson && party.ContactPerson.data && party.ContactPerson.data[0];

  if (!contact || !contact.Ref) {
    throw new NovaPoshtaError(['Нова Пошта не повернула контактну особу отримувача']);
  }

  return { ref: party.Ref, contactRef: contact.Ref };
}

// Тип послуги за категорією відділення.
//
// ⚠️ Жорстко зашитий WarehouseWarehouse зламав би більшість замовлень: у
// списку, який бачить клієнт на checkout, поштомати становлять переважну
// частину адрес (у Львові 2809 із 2967). Поле на checkout так і зветься —
// «Відділення/поштомат».
function serviceTypeFor(warehouse) {
  return warehouse.category === 'Postomat' ? 'WarehousePostomat' : 'WarehouseWarehouse';
}

// Скільки грошей Пошта має зібрати з отримувача.
//
// Тільки для накладеного платежу: решта способів оплати вже оплачені, і
// зворотна доставка грошей там означала б, що з клієнта візьмуть удруге.
function redeliverySum(order) {
  if (order.payment !== CASH_ON_DELIVERY) {
    return null;
  }

  const prepayment = Number(order.prepaymentAmount) || 0;
  const rest = Number(order.together) - prepayment;

  return rest > 0 ? rest : null;
}

// methodProperties для InternetDocument.save.
//
// Зібрано в окремій функції, щоб payload було видно одним шматком: саме його
// доводиться звіряти з відповіддю Пошти, коли вона щось відхиляє.
function buildTtnPayload({
  order,
  sender,
  senderCity,
  senderWarehouse,
  recipient,
  city,
  warehouse,
  manual,
}) {
  const payload = {
    // Платить отримувач — рішення власника. Готівкою на відділенні.
    PayerType: 'Recipient',
    PaymentMethod: 'Cash',
    DateTime: todayForNp(),
    CargoType: 'Parcel',
    ServiceType: serviceTypeFor(warehouse),

    Weight: String(manual.weight),
    VolumeGeneral: String(manual.volumeGeneral),
    SeatsAmount: String(manual.seatsAmount),
    Description: manual.description,
    Cost: String(manual.cost),

    CitySender: senderCity.ref,
    Sender: sender.counterpartyRef,
    SenderAddress: senderWarehouse.ref,
    ContactSender: sender.contactRef,
    SendersPhone: normalizePhone(sender.phone),

    CityRecipient: city.ref,
    Recipient: recipient.ref,
    RecipientAddress: warehouse.ref,
    ContactRecipient: recipient.contactRef,
    RecipientsPhone: normalizePhone(order.tel),
  };

  if (manual.codAmount) {
    // CargoType 'Money' — грошовий переказ назад відправнику. Комісію за
    // переказ платить отримувач.
    payload.BackwardDeliveryData = [
      {
        PayerType: 'Recipient',
        CargoType: 'Money',
        RedeliveryString: String(manual.codAmount),
      },
    ];
  }

  return payload;
}

module.exports = {
  normalizePhone,
  todayForNp,
  ensureRecipient,
  serviceTypeFor,
  redeliverySum,
  buildTtnPayload,
  resolveCityRef,
  resolveWarehouse,
};
