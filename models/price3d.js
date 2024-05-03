const { Schema, model } = require('mongoose');

const schemas = {
    
}

const Price3dSchema = new Schema({
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
    { versionKey: false, timestamps: true }
);

const Price3d = model('3dprices', Price3dSchema)

module.exports = {
    Price3d,
    schemas
}