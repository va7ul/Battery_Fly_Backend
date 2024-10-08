const Joi = require('joi');
const { Schema, model } = require('mongoose');

const emailRegexp = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;

const registerSchema = Joi.object({
  firstName: Joi.string(),
  lastName: Joi.string(),
  email: Joi.string().pattern(emailRegexp).required(),
  password: Joi.string().min(6).required(),
});

const varifyEmailSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
  password: Joi.string().min(6).required(),
});

const changeInfoSchema = Joi.object({
  firstName:Joi.string(),
  lastName:Joi.string(),
  patronymic: Joi.string().allow(""),
  tel: Joi.string().allow("")
});

const changePassSchema = Joi.object({
  newPassword: Joi.string().required(),
  password: Joi.string().required(),
  
});

const changeDeliverySchema = Joi.object({
  delivery: Joi.object({
    city: Joi.string().required(),
    warehouse: Joi.string().required(),
  }),
  
  
});


const schemas = {
  registerSchema,
  varifyEmailSchema,
  loginSchema,
  changeInfoSchema,
  changePassSchema,
  changeDeliverySchema
};

const userSchema = new Schema(
  {
    firstName: {
      type: String,
      required: [true, 'Name is required'],
    },
    lastName: {
      type: String,
      default: "",
      // required: [true, 'Surname is required'],
    },
    patronymic: {
      type: String,
      default: "",
    },
    tel: {
      type: String,
      default: ""
    },
    email: {
      type: String,
      match: emailRegexp,
      index: true,
      unique: true,
      required: [true, 'Email is required'],
    },
    delivery: {
      type: Object,
      default: {},
    },
    favorites: {
      type: Array,
      default: [],
    },
    password: {
      type: String,
      minlength: 6,
      required: [true, 'Set password for user'],
    },
    token: {
      type: String,
      default: '',
    },
    verifiedEmail: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      required: [true, 'Verify token is required'],
    },
    promoCodes: {
      type: Array
    },
    orders: {
      type: Array,
      default: []
    }
  },
  { versionKey: false, timestamps: true }
);

const User = model('User', userSchema);

module.exports = {
  schemas,
  User,
};

