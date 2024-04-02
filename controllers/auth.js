const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('node:path');
const fs = require('node:fs/promises');
const Jimp = require('jimp');
const crypto = require('node:crypto');
const { User } = require('../models/user');
const { HttpError, ctrlWrapper, sendEmail } = require('../helpers');
const { SECRET_KEY, BASE_URL } = process.env;

const register = async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  const user = await User.findOne({ email });
 
  if (user) {
    throw HttpError(409, 'Email in use');
  }

  const passwordHash = await bcrypt.hash(password, 10);


  const verificationToken = crypto.randomUUID();


  
  const newUser = await User.create({
    ...req.body,
    password: passwordHash,
    verificationToken,
    favorite: [],
    delivery: {},
    orders: {},
    
  });
  
  const userData = await User.findOne({ email });
  
  const payload = { id: userData._id };
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '1y' });
  
  await User.findByIdAndUpdate(userData._id, { token });
  
  const verifyEmail = {
    to: email,
    subject: 'Verify email',
    html: `<a target="_blank" href="${BASE_URL}/users/verify/${verificationToken}">Click to verify your email</a>`,
    text: `Click to verify your email ${BASE_URL}/users/verify/${verificationToken}`,
  };
  
  await sendEmail(verifyEmail);


 
  res.status(201).json({
    token, 
    user: {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      patronymic: user.patronymic,
      tel: user.tel,
      orders: user.orders,
      delivery: user.delivery,
      favorite: user.favorite,
      validEmail: user.validEmail,
    },
  });
};

const verifyEmail = async (req, res) => {
  const { verificationToken } = req.params;
  const user = await User.findOne({ verificationToken });
  if (!user) {
    throw HttpError(404, 'User not found');
  }

  await User.findByIdAndUpdate(user._id, {
    verify: true,
    verificationToken: '',
  });

  res.status(200).json({
    message: 'Verification successful',
  });
};

const resendVerifyEmail = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    throw HttpError(404, 'Email not found');
  }

  if (user.verify) {
    throw HttpError(400, 'Verification has already been passed');
  }

  const verifyEmail = {
    to: 'vas7ul@gmail.com',
    subject: 'Verify email',
    html: `<a target="_blank" href="${BASE_URL}/users/verify/${user.verificationToken}">Click to verify your email</a>`,
    text: `Click to verify your email ${BASE_URL}/users/verify/${user.verificationToken}`,
  };

  await sendEmail(verifyEmail);

  res.status(200).json({
    message: 'Verification email sent',
  });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    throw HttpError(401, 'Email or password is wrong');
  }

  const passwordCompare = await bcrypt.compare(password, user.password);
  if (!passwordCompare) {
    throw HttpError(401, 'Email or password is wrong');
  }

  // if (!user.verify) {
  //   throw HttpError(401, 'Email not verified');
  // }

  const payload = { id: user._id };
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '1y' });
  await User.findByIdAndUpdate(user._id, { token });

  res.status(200).json({
    token,
    user: {
      email,
      firstName: user.firstName,
      lastName: user.lastName,
      patronymic: user.patronymic,
      tel: user.tel,
      orders: user.orders,
      delivery: user.delivery,
      favorite: user.favorite,
      validEmail: user.validEmail,
    },
  });
};

const logout = async (req, res) => {
  const { _id } = req.user;
  await User.findByIdAndUpdate(_id, { token: '' });

  res.status(204).end();
};

const getCurrent = async (req, res) => {

  const { email, firstName, lastName, patronymic, tel, orders, delivery, favorite, token } = req.user;
  
  res.status(200).json({
    user: {
      email,
      firstName,
      lastName,
      patronymic,
      tel,
      orders,
      delivery,
      favorite,
      validEmail,
      
    },
  });
  

 
};

module.exports = {
  register: ctrlWrapper(register),
  verifyEmail: ctrlWrapper(verifyEmail),
  resendVerifyEmail: ctrlWrapper(resendVerifyEmail),
  login: ctrlWrapper(login),
  logout: ctrlWrapper(logout),
  getCurrent: ctrlWrapper(getCurrent),
};
