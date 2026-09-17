const Joi = require('joi');
const { Schema, model } = require('mongoose');

const emailRegexp = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;


const addOrder = Joi.object({
    userData: Joi.object({
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        email: Joi.string().pattern(emailRegexp).required(),
        text: Joi.string().allow(""),
        tel: Joi.string().required(),}).required(),
    total: Joi.number(),
    promoCode: Joi.string().allow(""),
    promoCodeDiscount: Joi.number().required(),
    discountValue: Joi.number().required(),
    together: Joi.number().required(),
    cartItems: Joi.array().required(),
    deliveryType: Joi.string().required(),
    city: Joi.string().required(),
    warehouse: Joi.string().required(),
    payment: Joi.string().required(),
  });

// monobank "Покупка частинами": без payment (проставляється контролером) + payParts
const createMonopayOrder = Joi.object({
    userData: Joi.object({
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        email: Joi.string().pattern(emailRegexp).required(),
        text: Joi.string().allow(""),
        tel: Joi.string().pattern(/^\+380\d{9}$/).required(),}).required(),
    total: Joi.number(),
    promoCode: Joi.string().allow(""),
    promoCodeDiscount: Joi.number().required(),
    discountValue: Joi.number().required(),
    together: Joi.number().required(),
    cartItems: Joi.array().required(),
    deliveryType: Joi.string().required(),
    city: Joi.string().required(),
    warehouse: Joi.string().required(),
    payParts: Joi.number().integer().min(3).max(25).required(),
  });

// monobank онлайн-еквайринг: та сама форма, що addOrder, але без payment
// (контролер проставляє 'card_online'). Телефон — як в addOrder, без строгого
// патерну з monopay: карткова оплата client_phone у monobank не використовує.
const createAcquiring = Joi.object({
    userData: Joi.object({
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        email: Joi.string().pattern(emailRegexp).required(),
        text: Joi.string().allow(""),
        tel: Joi.string().required(),}).required(),
    total: Joi.number(),
    promoCode: Joi.string().allow(""),
    promoCodeDiscount: Joi.number().required(),
    discountValue: Joi.number().required(),
    together: Joi.number().required(),
    cartItems: Joi.array().required(),
    deliveryType: Joi.string().required(),
    city: Joi.string().required(),
    warehouse: Joi.string().required(),
  });

// Публічний (без авторизації) запит статусу оплати зі сторінки /payment/result.
// Приймає АБО ref (випадковий токен з redirectUrl), АБО invoiceId — обидва
// невгадувані, тож перебором чужий статус не дістати. numberOfOrder свідомо
// НЕ приймається: він послідовний (100201, 100202…) і перебирається тривіально.
const publicAcquiringStatus = Joi.object({
    ref: Joi.string().hex().length(32),
    invoiceId: Joi.string().max(200),
  }).or('ref', 'invoiceId');

const schemas = {
    addOrder,
    createMonopayOrder,
    createAcquiring,
    publicAcquiringStatus,
}

const orderSchema = new Schema(
    {   
        status: {
            type: String,
            default: 'Нове'
        },
        numberOfOrder: {
            type: String,
            unique: true,
        },
        firstName: {
            type: String,
            required: [true, 'FirstName is required']
        },
        lastName: {
            type: String,
            required: [true, 'LastName is required']
        },
        email: {
            type: String,
            required: [true, 'Email is required']
        },
        // Коментар КЛІЄНТА з оформлення («подзвоніть перед відправкою»).
        // ⚠️ Не плутати з internalNote нижче: цей текст написав покупець, він
        // його бачить у своєму кабінеті, і менеджер його не переписує.
        comment: {
            type: String,
            default: ""
        },
        // Внутрішня примітка менеджера. Клієнту НЕ видно ніколи.
        //
        // ⚠️ Одне поточне значення, а не історія: журнал замовлення зберігає
        // кожну збережену примітку окремим записом, тож історія вже є там. Тут
        // лежить те, що менеджер бачить у картці зараз, — і саме тому примітку
        // можна стерти, хоча запис у журналі про неї лишається.
        internalNote: {
            type: String,
            default: "",
            trim: true,
        },
        tel: {
            type: String,
            required: [true, 'Tel is required']
        },
        total: {
            type: Number,
            required: [true, 'Total is required']
        },
        promoCode: {
            type: String, 
        },
        promoCodeDiscount: {
            type: Number,
            required: [true, 'promoCodeDiscount is required']  
        },
        discountValue: {
            type: Number,
            required: [true, 'discountValue is required']  
        },
        together: {
            type: Number,
            required: [true, 'together is required']  
        },
        cartItems: {
            type: Array,
            required: [true, 'CartItems is required']
        },
        deliveryType: {
            type: String,
            required: [true, 'DeliveryType is required']
        },
        city: {
            type: String,
            required: [true, 'City is required']
        },
        warehouse: {
            type: String,
            required: [true, 'Warehouse is required'],
        },
        payment: {
            type: String,
            required: [true, 'Payment price is required']
        },
        monopayOrderId: {
            type: String,
            default: null,
            index: true,
        },
        monopayState: {
            type: String,
            default: null,
        },
        monopaySubState: {
            type: String,
            default: null,
        },
        payParts: {
            type: Number,
            default: null,
        },
        isTest: {
            type: Boolean,
            default: false,
        },
        monopayReturnedSum: {
            type: Number,
            default: 0,
        },
        monopayReturns: {
            type: [{
                store_return_id: String,
                sum: Number,
                date: Date,
                return_money_to_card: Boolean,
            }],
            default: [],
        },
        acquiringInvoiceId: {
            type: String,
            default: null,
            index: true,
        },
        // Випадковий 32-hex токен, який їде в redirectUrl (?ref=…) і за яким
        // клієнтська сторінка результату питає статус оплати.
        // Чому не invoiceId, як планувалось: redirectUrl передається ВСЕРЕДИНІ
        // запиту invoice/create, а invoiceId приходить лише у ВІДПОВІДІ на
        // нього — підставити його в URL фізично неможливо, а своїх параметрів
        // monobank до redirectUrl не додає. Токен дає ту саму невгадуваність.
        // Належить ЗАМОВЛЕННЮ, не інвойсу: при повторній оплаті (resend)
        // створюється новий invoiceId, а ref лишається той самий, тож старе
        // посилання на /payment/result продовжує працювати.
        acquiringPublicRef: {
            type: String,
            default: null,
            index: true,
        },
        acquiringStatus: {
            type: String,
            default: null,
        },
        acquiringPageUrl: {
            type: String,
            default: null,
        },
        acquiringFailureReason: {
            type: String,
            default: null,
        },
        acquiringModifiedDate: {
            type: String,
            default: null,
        },
        // Коли створено ПОТОЧНИЙ рахунок. Не дублює createdAt замовлення:
        // після повторної оплати (resend) рахунок новий, а замовлення те саме,
        // і 24-годинне вікно життя посилання треба рахувати від рахунку.
        acquiringInvoiceCreatedAt: {
            type: Date,
            default: null,
        },
        // Коли замовлення вперше перейшло в "Доставлено". Потрібне лише для
        // середнього часу обробки на дашборді, тому це НЕ повний трек статусів,
        // а одна дата. Пишеться виключно на сервері (controllers/admin.js →
        // updateOrderById) і лише один раз: значення з тіла запиту свідомо
        // ігнорується, бо адмінка шле назад увесь об'єкт замовлення.
        // Замовлення, доставлені ДО впровадження поля, лишаються null і в
        // середній час не потрапляють.
        deliveredAt: {
            type: Date,
            default: null,
        },
        // Клієнт CRM, до якого належить це замовлення.
        //
        // ⚠️ Поле ДОДАНЕ, нічого не замінює. Контактні дані самого замовлення
        // (firstName, lastName, tel, email) лишаються як є — їх показує кабінет
        // клієнта, і вони мають зберігати те, що людина ввела при замовленні.
        // contactId — внутрішній шар для менеджера.
        //
        // null означає «не прив'язано»: замовлення без телефону, збій при
        // створенні клієнта або старий запис до появи CRM. Полагодити можна
        // ручною прив'язкою або скриптом scripts/init-contacts.js.
        contactId: {
            type: Schema.Types.ObjectId,
            ref: 'contact',
            default: null,
            index: true,
        },
        // ─── ПОСИЛКИ ────────────────────────────────────────────────────
        //
        // Замовлення може їхати кількома коробками: частина товару зі складу,
        // частина під замовлення, щось — на іншу адресу («надішліть батарею
        // мені, а зарядку — на роботу»). Одна ТТН на замовлення цього не
        // описує взагалі.
        //
        // ⚠️ Позиція посилки посилається на РЯДОК кошика (lineIndex), а не лише
        // на codeOfGood. Той самий код трапляється в кошику двічі з різними
        // capacityKey / герметизацією / холдером — це РІЗНІ товари з різною
        // ціною, і адмінка розрізняє їх саме за цими чотирма полями. Розподіл
        // за одним кодом злив би їх в одну позицію й порахував би неправильно.
        //
        // ⚠️ Кошик на цей момент уже заморожений: редагувати його можна лише в
        // «Нове»/«Очікує оплати» (isOrderEditable), а посилки з'являються з
        // «Відправлено». Тож індекс рядка не поїде. codeOfGood зберігаємо
        // поруч як контроль: якщо вони розійдуться, це видно одразу.
        parcels: {
            type: [
                new Schema(
                    {
                        ttn: { type: String, default: null },
                        // Ref накладної — потрібен, щоб її видалити.
                        ttnRef: { type: String, default: null },
                        // Згенерована через API чи вписана менеджером руками.
                        method: {
                            type: String,
                            enum: ['auto', 'manual'],
                            default: 'auto',
                        },
                        items: [
                            {
                                _id: false,
                                lineIndex: { type: Number, required: true },
                                codeOfGood: { type: String, default: '' },
                                name: { type: String, default: '' },
                                quantity: { type: Number, required: true, min: 1 },
                            },
                        ],
                        recipient: {
                            // За замовчуванням — адреса із замовлення. Інша
                            // потрібна рідко, але коли потрібна, іншого способу
                            // її вказати немає.
                            useClientAddress: { type: Boolean, default: true },
                            name: { type: String, default: '' },
                            phone: { type: String, default: '' },
                            cityName: { type: String, default: '' },
                            warehouseName: { type: String, default: '' },
                        },
                        // Накладений платіж ЦІЄЇ посилки. null — без нього.
                        codAmount: { type: Number, default: null },
                        // Статус саме цієї посилки. Заповнює трекінг — ЕТАП 2;
                        // у Етапі 1 поля існують, але крон їх ще не читає.
                        npStatusCode: { type: String, default: null },
                        npStatusText: { type: String, default: null },
                        npStatusUpdatedAt: { type: Date, default: null },
                    },
                    { timestamps: true }
                ),
            ],
            default: [],
        },
        // Сума передоплати для накладеного платежу. Рахується при створенні
        // замовлення (20% від together) і зберігається, щоб картка й майбутні
        // повідомлення показували те саме число, навіть якщо відсоток згодом
        // зміниться в налаштуваннях. Перераховується лише при зміні суми
        // замовлення, поки гроші ще не взяті.
        //
        // ⚠️ У момент переходу в «Оплачено» сюди лягає ФАКТИЧНО внесена сума,
        // яку менеджер вводить у картці: клієнти нерідко переказують не те, що
        // їм виставили. Від цього числа рахується решта накладеним — і в
        // картці, і в тексті для клієнта, і в самій накладній. Тобто до оплати
        // поле — прогноз, після оплати — факт (див. updateOrderById).
        prepaymentAmount: {
            type: Number,
            default: null,
        },
        // Чи вже списано товар із залишків по цьому замовленню.
        //
        // Прив'язувати повернення залишків до СТАТУСУ (як було: повертаємо,
        // якщо поточний "В роботі") небезпечно — щойно ланцюжок статусів
        // змінюється, залишки тихо пливуть. Прапорець каже факт, а не здогад:
        // списали при "Оплачено" → повернемо при скасуванні, і рівно один раз.
        stockDeducted: {
            type: Boolean,
            default: false,
        },
        // Ручна знижка, яку менеджер вносить у картці замовлення.
        //
        // ⚠️ Ці два поля адмінка надсилала З САМОГО ПОЧАТКУ, а схема їх не мала —
        // тож Mongoose їх мовчки викидав. Наслідок був не косметичний: після
        // збереження знижка не поверталась у відповіді, usePromoCode рахував її
        // заново як нуль і переписував `together` назад на суму без знижки. На
        // НАСТУПНІЙ зміні статусу ця сума їхала в базу — клієнту вже назвали
        // 10 000 ₴, а замовлення тихо ставало на 12 645 ₴.
        //
        // Тип вільний (число або рядок): порожнє поле адмінка шле як ''.
        personalDiscountRate: {
            type: Schema.Types.Mixed,
            default: '',
        },
        personalDiscountValue: {
            type: Schema.Types.Mixed,
            default: '',
        },
        // Чи бачив менеджер цей запис. Живе на СЕРВЕРІ, а не в браузері:
        // попереднє рішення тримало "побачено" в localStorage, тож рефреш,
        // інший пристрій чи другий менеджер бачили різне.
        //
        // Раз true — назавжди true: нове надходження — це НОВИЙ запис із
        // default false, наявний ніхто не «розпереглядає».
        isViewed: {
            type: Boolean,
            default: false,
        },

    },
    { versionKey: false, timestamps: true }
);

const Order = model('order', orderSchema);

module.exports = {
  schemas,
  Order,
};
