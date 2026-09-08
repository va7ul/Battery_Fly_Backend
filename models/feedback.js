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
         numberOfOrder: {
            type: Number,
            required:[true, 'numberOfOrder is required']
        },
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
        // Чи бачив менеджер цей запис. Живе на СЕРВЕРІ, а не в браузері:
        // попереднє рішення тримало "побачено" в localStorage, тож рефреш,
        // інший пристрій чи другий менеджер бачили різне.
        //
        // Раз true — назавжди true: нове надходження — це НОВИЙ запис із
        // default false, наявний ніхто не «розпереглядає».
        isViewed: {
            type: Boolean,
            default: false,
        },
    },
    { versionKey: false, timestamps: true }
);

const FeedBack = model('feedback', feedBackSchema);

module.exports = {
  schemas,
  FeedBack,
};