const {Price3d} = require('../models/price3d')
const { HttpError, ctrlWrapper } = require('../helpers');

const get3dPrices = async (req, res) => {
    console.log("get3dPrices")
    const prices = await Price3d.find({})
    console.log(prices)
    
    if (!prices) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        prices
    });
};

module.exports = {
    get3dPrices: ctrlWrapper(get3dPrices),
   }