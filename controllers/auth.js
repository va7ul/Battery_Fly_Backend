const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('node:path');
const fs = require('node:fs/promises');
const Jimp = require('jimp');
const crypto = require('node:crypto');
const { User } = require('../models/user');
const { HttpError, ctrlWrapper, sendEmail } = require('../helpers');
const { SECRET_KEY, BASE_URL,MAIL_USER } = process.env;

const register = async (req, res) => {
  const { email, password } = req.body;
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

  if (!newUser) {
    throw HttpError(500, 'Error creating user');
    
  }
  
  const payload = { id: newUser._id };
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '1y' });
  
  newUser.token = token

  await newUser.save()
  
  const verifyEmail = {
    from: MAIL_USER,
    to: email,
    subject: 'Verify email',
    html: `<a target="_blank" href="https://battery-fly-backend.onrender.com/api/user/verify/${verificationToken}">Click to verify your email</a>`,
    text: `Click to verify your email https://battery-fly-backend.onrender.com/api/user/verify/${verificationToken}`,
  };

  await sendEmail(verifyEmail);


 
  res.status(201).json({
    token,
    user: {
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      patronymic: newUser.patronymic,
      tel: newUser.tel,
    },
    orders: newUser.orders,
    delivery: newUser.delivery,
    favorite: newUser.favorite,
    validEmail: newUser.validEmail,
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
    },
    orders: user.orders,
    delivery: user.delivery,
    favorite: user.favorite,
    validEmail: user.validEmail,
  });
};

const logout = async (req, res) => {
  const { _id } = req.user;
  await User.findByIdAndUpdate(_id, { token: '' });

  res.status(204).end();
};

const getCurrent = async (req, res) => {

  const { email, firstName, lastName, patronymic, tel, orders, delivery, favorite, token, validEmail } = req.user;
  
  res.status(200).json({
    token,
    user: {
      email,
      firstName,
      lastName,
      patronymic,
      tel,
    },
      orders,
      delivery,
      favorite,
      validEmail,
  });
  

 
};

module.exports = {
  register: ctrlWrapper(register),
  login: ctrlWrapper(login),
  logout: ctrlWrapper(logout),
  getCurrent: ctrlWrapper(getCurrent),
};
