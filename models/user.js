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

const addFavoriteSchema = Joi.object({
  favorite: Joi.string()
})


const schemas = {
  registerSchema,
  varifyEmailSchema,
  loginSchema,
  addFavoriteSchema,
  
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
    orders: {
      type: Array,
      default: [{}],
    },
    delivery: {
      type: Array,
      default: [{}],
    },
    favorite: {
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
  },
  { versionKey: false, timestamps: true }
);

const User = model('User', userSchema);

module.exports = {
  schemas,
  User,
};

