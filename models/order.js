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
    discountValue: Joi.number().required(),
    together: Joi.number().required(),
    cartItems: Joi.array().required(),
    deliveryType: Joi.string().required(),
    city: Joi.string().required(),
    warehouse: Joi.string().required(),
    payment: Joi.string().required(),
  });

const schemas = {
    addOrder
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
            required: [true, 'promoCode is required']  
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

    },
    { versionKey: false, timestamps: true }
);

const Order = model('order', orderSchema);

module.exports = {
  schemas,
  Order,
};
