const Joi = require('joi');
const { Schema, model } = require('mongoose');

const emailRegexp = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;


const loginSchema = Joi.object({
  login: Joi.string().pattern(emailRegexp).required(),
  password: Joi.string().min(6).required(),
});

const schemas = {

    loginSchema,
    
};

const adminSchema = new Schema({
    login: {
        type: String,
        required: [true, 'login is required'],
    },
    password: {
        type: String,
        minlength: 6,
        required: [true, 'Set password for user'],
    },
    token: {
        type: String,
        default: '',
    }

});

const Admin = model('admin', adminSchema);

module.exports = {
  schemas,
  Admin,
};