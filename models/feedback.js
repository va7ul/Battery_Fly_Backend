const Joi = require('joi');
const { Schema, model } = require('mongoose');

const addFeedBack = Joi.object({
    
        name: Joi.string().required(),
        tel: Joi.string().required(),
        text: Joi.string().allow(""),
        
  });

const schemas = {
addFeedBack
}

const feedBackSchema = new Schema(
    {
        
        name: {
            type: String,
            required: [true, 'Name is required']
        },
        tel: {
            type: String,
            required: [true, 'Tel is required']
        },
        comment: {
            type: String,
        },
    },
    { versionKey: false, timestamps: true }
);

const FeedBack = model('feedback', feedBackSchema);

module.exports = {
  schemas,
  FeedBack,
};