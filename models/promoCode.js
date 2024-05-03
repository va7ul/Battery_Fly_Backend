const { Schema, model } = require('mongoose');

const schemas = {
    
}

const PromoCodeSchema = new Schema({
    
    name: {
        type: String,
        required: [true, 'name is required']
    },
    discount: {
        type: Number,
        required: [true, 'discount is required']
    },
    valid: {
        type: Boolean,
        required: [true, 'valid is required']
    },
    
},
    { versionKey: false, timestamps: true }
);

const PromoCode = model('promo_code', PromoCodeSchema)

module.exports = {
    PromoCode,
    schemas
}