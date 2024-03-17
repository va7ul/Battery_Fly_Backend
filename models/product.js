const Joi = require('joi');
const { Schema, model } = require('mongoose');

const schemas = {

}

const productSchema = new Schema(
    {
        codeOfGood: {
            type: String,
            unique: true,
        },
        name: {
            type: String,
            required: [true, 'Name is required']
        },
        description: {
            type: String,
            required: [true, 'Description is required']
        },
        image: {
            type: Array,
            required: [true, 'Image is required']
        },
        price: {
            type: Number,
            required: [true, 'Price is required']
        },
        quantity: {
            type: Number,
            required: [true, 'Quantity is required']
        },
        sale: {
            type: Boolean,
            required: [true, 'Sale is required'],
            default: false
        },
        discount: {
            type: Number,
            required: [true, 'Sale price is required']
        },
        popular: {
            type: Boolean,
            required: [true, 'Popular is required'],
            default: false
        },
        category: {
            type: String,
            required: [true, 'Category is required']
        },
        type: {
            type: String,
            required: [true, 'Type is required']
        },
        information: {
            type: String,
            required: [true, 'Information is required']
        },

    },
    { versionKey: false, timestamps: true }
);

const Product = model('product', productSchema);

module.exports = {
  schemas,
  Product,
};
