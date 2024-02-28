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
            type: String,
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
        salePrice: {
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
        capacity: {
            type: Object,
            ah9: {
                type: Object,
                description: {
                    type: String,
                }
            },
            ah12: {
                type: Object,
                description: {
                    type: String,
                },
            },
            ah15: {
                type: Object,
                description: {
                    type: String,
                },
            },
            ah18: {
                type: Object,
                description: {
                    type: String,
                },
            },
            ah21: {
                type: Object,
                description: {
                    type: String,
                },
            },
            ah24: {
                type: Object,
                description: {
                    type: String,
                },
            },
            ah29: {
                type: Object,
                description: {
                    type: String,
                },
            },
            required: [true, 'capacity is required']
        },
        information: {
            type: String,
            required: [true, 'Information is required']
        },
        },
    
    { versionKey: false, timestamps: true }
);

const ProductZbirky = model('products_zbirkies', productSchema);

module.exports = {
  schemas,
  ProductZbirky,
};
