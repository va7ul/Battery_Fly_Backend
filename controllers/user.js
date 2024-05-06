const bcrypt = require('bcrypt');
const { User } = require('../models/user');
const { HttpError, ctrlWrapper, sendEmail } = require('../helpers');
const { MAIL_USER } = process.env;


const getFavorite = async (req, res) => {
    console.log("getFavorite")
    if (!req.user) {
      throw HttpError(400, 'Bad request');
    }
    res.status(200).json({
        favorite: req.user.favorite
  });

};

const addFavorite = async (req, res) => {
    console.log("addFavorite")

    const {_id} = req.user;

    const result = await User.findOne({ _id })
    
    if (result.favorites.includes(req.params.id)) {
        throw HttpError(400, 'Already in favorite');
    }

    result.favorites.push(req.params.id)
    await result.save();
    
    if (!result) {
      throw HttpError(400, 'Bad request');
    }
    res.status(200).json({
        favorites: result.favorites
  });

};

const deleteFavorite = async (req, res) => {
    console.log("deleteFavorite")

    const {_id} = req.user;

    const result = await User.findOne({ _id })
    
    if (!result.favorites.includes(req.params.id)) {
        throw HttpError(400, 'This product is not in favorites');
    }

    const newFavorite = result.favorites.filter(item => item !== req.params.id)
  
    result.favorites = newFavorite;

    await result.save();
    
    if (!result) {
      throw HttpError(400, 'Bad request');
    }
    res.status(200).json({
      favorites: result.favorites
  });

};

const verifyEmail = async (req, res) => {
  console.log("verifyEmail")

  const { verifyToken } = req.params;

  const user = await User.findOne({ verificationToken: verifyToken });

  if (!user) {
    throw HttpError(400, 'Bad request');
  }
  user.verifiedEmail = true;

  await user.save();

  res.status(200).json({
    message: "Mail verified successfully"
  });

};

const resendVerifyEmail = async (req, res) => {
  const { email } = req.user;
  
  const user = await User.findOne({ email });
  if (!user) {
    throw HttpError(400, 'Email not found');
  }

  if (user.verifiedEmail) {
    throw HttpError(400, 'Verification has already been passed');
  }

  const verifyEmail = {
    from: MAIL_USER,
    to: email,
    subject: 'Verify email',
    html: `<a target="_blank" href="https://battery-fly-backend.onrender.com/api/user/verify/${user.verificationToken}">Click to verify your email</a>`,
    text: `Click to verify your email https://battery-fly-backend.onrender.com/api/user/verify/${user.verificationToken}`,
  };

  await sendEmail(verifyEmail);

  res.status(200).json({
    message: 'Verification email sent',
  });
};

const changeUserInfo = async (req, res) => {
  console.log("changeUserInfo")
  
    if (!req.user) {
      throw HttpError(400, 'Bad request');
  }

  const { firstName, lastName, patronymic, tel } = req.body;

  const updateUser = await User.findOneAndUpdate({email: req.user.email}, {firstName, lastName, patronymic, tel}, {new:true})
  
  if (!updateUser) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }
  
  const result = {
    firstName: updateUser.firstName,
    lastName: updateUser.lastName,
    patronymic: updateUser.patronymic,
    tel: updateUser.tel
  }

    res.status(200).json({
        result
  });

};

const changePassword = async (req, res) => {
  console.log("changePassword")
  
    if (!req.user) {
      throw HttpError(400, 'Bad request');
  }

  const { password, newPassword } = req.body;
  const user = await User.findOne({email: req.user.email})
  
  if (!user) {
      throw HttpError(400, 'Bad request');
  }
  
  const passwordCompare = await bcrypt.compare(password, user.password);
  if (!passwordCompare) {
    throw HttpError(401, 'Email or password is wrong');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  user.password = passwordHash;
  const result = await user.save();

  if (!result) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }

    res.status(200).json({
      message: "Password change successfully"
  });

};


module.exports = {
  getFavorite: ctrlWrapper(getFavorite),
  addFavorite: ctrlWrapper(addFavorite),
  verifyEmail: ctrlWrapper(verifyEmail),
  resendVerifyEmail: ctrlWrapper(resendVerifyEmail),
  deleteFavorite: ctrlWrapper(deleteFavorite),
  changeUserInfo: ctrlWrapper(changeUserInfo),
  changePassword: ctrlWrapper(changePassword),



    
    

};