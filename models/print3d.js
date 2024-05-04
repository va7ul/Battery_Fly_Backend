const { Schema, model } = require('mongoose');

const schemas = {
    
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

const Print3d = model('3dprint', Print3dSchema)

module.exports = {
    Print3d,
    schemas
}