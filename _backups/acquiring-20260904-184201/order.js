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

const schemas = {
    addOrder,
    createMonopayOrder,
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

    },
    { versionKey: false, timestamps: true }
);

const Order = model('order', orderSchema);

module.exports = {
  schemas,
  Order,
};
