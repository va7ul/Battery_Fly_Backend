const Joi = require('joi');
const { Schema, model } = require('mongoose');

const addQuickOrder = Joi.object({
    
        codeOfGood: Joi.string().required(),
        name: Joi.string().required(),
        tel: Joi.string().required(),
        userName: Joi.string().required(),
        
  });

const schemasOrder = {
addQuickOrder
}

const quickOrderSchema = new Schema(
    {
        numberOfOrder: {
            type: Number,
            required:[true, 'numberOfOrder is required']
        },
        codeOfGood: {
            type: String,
            required: [true, 'codeOfGood is required']
        },
        name: {
            type: String,
            required: [true, 'Name is required']
        },
        tel: {
            type: String,
            required: [true, 'Tel is required']
        },
        userName: {
            type: String,
            required: [true, 'UserName is required']
        },
    },
    { versionKey: false, timestamps: true }
);

const QuickOrder = model('quickOrder', quickOrderSchema);

module.exports = {
  schemasOrder,
  QuickOrder,
};
