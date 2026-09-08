const Joi = require('joi');
const { Schema, model } = require('mongoose');

const add3dPrintOrder = Joi.object({
    userName: Joi.string().required(),
    tel: Joi.string().required(),
    text: Joi.string().allow(""),
    accuracy: Joi.string().required(),
    plactic: Joi.string().required(),
    color: Joi.string().required(),

  });

const schemas = {
    add3dPrintOrder
}

const Print3dSchema = new Schema({
    "table1": {
        type: Object,
         100: {
        type: Object,
        required: [true, '100 is required'],
        unique: true,
        "1": {
            type: Number,
            require: [true, '1 is requred']
        },
        "50": {
            type: Number,
            require: [true, '50 is requred']
        },
        "100": {
            type: Number,
            require: [true, '100 is requred']
        },
        "250": {
            type: Number,
            require: [true, '250 is requred']
        },

    },
    200: {
        type: Object,
        required: [true, '100 is required'],
        unique: true,
        "1": {
            type: Number,
            require: [true, '1 is requred']
        },
        "50": {
            type: Number,
            require: [true, '50 is requred']
        },
        "100": {
            type: Number,
            require: [true, '100 is requred']
        },
        "250": {
            type: Number,
            require: [true, '250 is requred']
        },
    },
    300: {
        type: Object,
        required: [true, '100 is required'],
        unique: true,
        "1": {
            type: Number,
            require: [true, '1 is requred']
        },
        "50": {
            type: Number,
            require: [true, '50 is requred']
        },
        "100": {
            type: Number,
            require: [true, '100 is requred']
        },
        "250": {
            type: Number,
            require: [true, '250 is requred']
        }
    },
    name: {
        type: String,
        required: [true, 'name is required']
    },
    },
    "table2": {
        type: Object,
         100: {
        type: Object,
        required: [true, '100 is required'],
        unique: true,
        "1": {
            type: Number,
            require: [true, '1 is requred']
        },
        "50": {
            type: Number,
            require: [true, '50 is requred']
        },
        "100": {
            type: Number,
            require: [true, '100 is requred']
        },
        "250": {
            type: Number,
            require: [true, '250 is requred']
        },

    },
    200: {
        type: Object,
        required: [true, '100 is required'],
        unique: true,
        "1": {
            type: Number,
            require: [true, '1 is requred']
        },
        "50": {
            type: Number,
            require: [true, '50 is requred']
        },
        "100": {
            type: Number,
            require: [true, '100 is requred']
        },
        "250": {
            type: Number,
            require: [true, '250 is requred']
        },
    },
    300: {
        type: Object,
        required: [true, '100 is required'],
        unique: true,
        "1": {
            type: Number,
            require: [true, '1 is requred']
        },
        "50": {
            type: Number,
            require: [true, '50 is requred']
        },
        "100": {
            type: Number,
            require: [true, '100 is requred']
        },
        "250": {
            type: Number,
            require: [true, '250 is requred']
        }
    },
    name: {
        type: String,
        required: [true, 'name is required']
    },
    },
    "name": {
        type: String,
    },
    "description": {
        type: String,
    },
    "image": {
        type: Array,
    },
    "information": {
        type: String,
    },
    "accuracy": {
        type: Array,
    },
    "plactic": {
        type: Array,
    },
    "color": {
        type: Array,
    },
    

},
    { versionKey: false, timestamps: true }
);

// userName: Dima
// tel: +380503357040
// text: 
// accuracy: 100 мікрон
// plactic: PLA
// color: Чорний


const Print3dOrderSchema = new Schema({
    
    "numberOfOrder": {
        type: "Number",
        required: true
    },
    "userName": {
        type: String,
        required: true
    },
    "tel": {
        type: String,
        required: true
    },
    "text": {
        type: String,
        default: ""
    },
    "accuracy": {
        type: String,
        required: true
    },
    "plactic": {
        type: String,
        required: true
    },
    "color": {
        type: String,
        required: true
    },
},
    { versionKey: false, timestamps: true }
);

const Print3d = model('3dprint', Print3dSchema)
const Print3dOrder = model('3dprintOrder', Print3dOrderSchema)

module.exports = {
    Print3d,
    Print3dOrder,
    schemas
}