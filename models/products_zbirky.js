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
        capacity: {
            type: Object,
            ah9: {
                type: Object,
                description: {
                    type: String,
                },
                price: {
                    type: Number
                },
                holder: {
                    type: Number
                },
            },
            ah12: {
                type: Object,
                description: {
                    type: String,
                },
                price: {
                    type: Number
                },
                holder: {
                    type: Number
                },
            },
            ah15: {
                type: Object,
                description: {
                    type: String,
                },
                price: {
                    type: Number
                },
                holder: {
                    type: Number
                },
            },
            ah18: {
                type: Object,
                description: {
                    type: String,
                },
                price: {
                    type: Number
                },
                holder: {
                    type: Number
                },
            },
            ah21: {
                type: Object,
                description: {
                    type: String,
                },
                price: {
                    type: Number
                },
                holder: {
                    type: Number
                },
            },
            ah24: {
                type: Object,
                description: {
                    type: String,
                },
                price: {
                    type: Number
                },
                holder: {
                    type: Number
                },
            },
            ah29: {
                type: Object,
                description: {
                    type: String,
                },
                price: {
                    type: Number
                },
                holder: {
                    type: Number
                },
            },
            required: [true, 'capacity is required']
        },
        holder: {
            type: Boolean,
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
