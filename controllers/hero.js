const {Hero} = require('../models/hero')
const { HttpError, ctrlWrapper } = require('../helpers');

const getImage = async (req, res) => {
    console.log("getImage")
    const image = await Hero.find({})
    
    if (!image) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        image
    });
};

module.exports = {
    getImage: ctrlWrapper(getImage),
   }