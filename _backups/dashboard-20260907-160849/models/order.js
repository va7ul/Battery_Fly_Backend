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
        comment: {
            type: String,
            default: ""
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

    },
    { versionKey: false, timestamps: true }
);

const Order = model('order', orderSchema);

module.exports = {
  schemas,
  Order,
};
