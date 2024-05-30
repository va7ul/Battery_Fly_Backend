const bcrypt = require('bcrypt');
const generator = require('generate-password');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { User } = require('../models/user');
const { HttpError, ctrlWrapper, sendEmail } = require('../helpers');
const { SECRET_KEY, BASE_URL, MAIL_USER } = process.env;

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
    favorites: [],
    delivery: {},
    orders: [],
  });

  if (!newUser) {
    throw HttpError(500, 'Error creating user');
  }

  const payload = { id: newUser._id };
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '1y' });

  newUser.token = token;

  await newUser.save();

  const verifyEmail = {
    from: MAIL_USER,
    to: email,
    subject: 'Verify email',
    html: `<a target="_blank" href="https://battery-fly-backend.onrender.com/api/user/verify/${verificationToken}">Click to verify your email</a>`,
    text: `Click to verify your email https://battery-fly-backend.onrender.com/api/user/verify/${verificationToken}`,
  };

  await sendEmail(verifyEmail);

  res.status(201).json({
    message: "Signup successfully"
  });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user.verifiedEmail) {
    throw HttpError(401, 'Email not verified');
  }
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
      firstName: user.firstName,
      lastName: user.lastName,
      patronymic: user.patronymic,
      tel: user.tel,
      email,
    },
    orders: user.orders,
    delivery: user.delivery,
    favorites: user.favorites,
    verifiedEmail: user.verifiedEmail,
  });
};

const logout = async (req, res) => {
  const { _id } = req.user;
  await User.findByIdAndUpdate(_id, { token: '' });

  res.status(204).end();
};

const getCurrent = async (req, res) => {
  const {
    email,
    firstName,
    lastName,
    patronymic,
    tel,
    orders,
    delivery,
    favorites,
    token,
    verifiedEmail,
  } = req.user;

  res.status(200).json({
    token,
    user: {
      firstName,
      lastName,
      patronymic,
      tel,
      email,
    },
    orders,
    delivery,
    favorites,
    verifiedEmail,
  });
};

const forgotPassword = async (req, res) => {
  console.log("resetPassword")
  
  const {email} = req.body
  const user = await User.findOne({email})
  
  if (!user) {
      throw HttpError(400, 'Bad request');
  }

  const password = generator.generate({
	length: 10,
	numbers: true
  });
  console.log(password)

  const passwordHash = await bcrypt.hash(password, 10);
  user.password = passwordHash;
  const result = await user.save();

  if (!result) {
        throw HttpError(500, 'Internal server error, write order in DB');
  };
  
  const verifyEmail = {
    from: MAIL_USER,
    to: email,
    subject: 'Reset password',
    html: `<p>Ваш новий пароль: ${password}</p></br>
    Заходьте на сайт з новим паролем. Цей пароль постійний, але Ви можете його змінити в особистому кабінеті`,
   
  };
    await sendEmail(verifyEmail);

    res.status(200).json({
      message: "Password reset successfully"
  });

};



module.exports = {
  register: ctrlWrapper(register),
  login: ctrlWrapper(login),
  logout: ctrlWrapper(logout),
  getCurrent: ctrlWrapper(getCurrent),
  forgotPassword: ctrlWrapper(forgotPassword),

};
