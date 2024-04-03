const { User } = require('../models/user');
const { HttpError, ctrlWrapper } = require('../helpers');
const { SECRET_KEY, BASE_URL } = process.env;


const getFavorite = async (req, res) => {
    console.log("getFavorite")
    if (!req.user) {
      throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        favorite: req.user.favorite
  });

};

const addFavorite = async (req, res) => {
    console.log("addFavorite")

    const {_id} = req.user;

    const result = await User.findOne({ _id })
    
    if (result.favorite.includes(req.params.id)) {
        throw HttpError(401, 'Already favorited');
    }

    result.favorite.push(req.params.id)
    await result.save();
    
    if (!result) {
      throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        favorite: result.favorite
  });

};

const verifyEmail = async (req, res) => {
  console.log("verifyEmail")

  const { verifyToken } = req.params;


  const user = await User.findOne({ verifyToken: verifyToken });
  if (!user) {
    throw HttpError(401, 'Bad request');
  }
  user.validEmail = true;

  await user.save();

  res.status(200).json({
    message: "Mail verified successfully"
  });

};




module.exports = {
    getFavorite: ctrlWrapper(getFavorite),
    addFavorite: ctrlWrapper(addFavorite),
    verifyEmail: ctrlWrapper(verifyEmail),
    

};