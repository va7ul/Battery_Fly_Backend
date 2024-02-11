const Joi = require('joi');
const { Schema, model } = require('mongoose');

const emailRegexp = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
const subscriptionList = ['starter', 'pro', 'business'];

const registerSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
  password: Joi.string().min(6).required(),
  subscription: Joi.string().valid(...subscriptionList),
});

const varifyEmailSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
  password: Joi.string().min(6).required(),
});

const updatedSubscriptionSchema = Joi.object({
  subscription: Joi.string().valid(...subscriptionList),
});

const updateAvatar = Joi.object({
  avatarURL: Joi.string().required(),
});

const schemas = {
  registerSchema,
  varifyEmailSchema,
  loginSchema,
  updatedSubscriptionSchema,
  updateAvatar,
};

const userSchema = new Schema(
  {
    email: {
      type: String,
      match: emailRegexp,
      index: true,
      unique: true,
      required: [true, 'Email is required'],
    },
    password: {
      type: String,
      minlength: 6,
      required: [true, 'Set password for user'],
    },
    subscription: {
      type: String,
      enum: subscriptionList,
      default: 'starter',
    },
    token: {
      type: String,
      default: '',
    },
    avatarURL: {
      type: String,
      required: true,
    },
    verify: {
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

const User = model('user', userSchema);

module.exports = {
  schemas,
  User,
};
