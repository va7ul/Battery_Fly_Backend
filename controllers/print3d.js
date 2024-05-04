const {Print3d} = require('../models/print3d')
const { HttpError, ctrlWrapper } = require('../helpers');

const get3dPrint = async (req, res) => {
    console.log("get3dPrint")
    const print3d = await Print3d.find({})
    
    if (!print3d) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        print3d
    });
};

module.exports = {
    get3dPrint: ctrlWrapper(get3dPrint),
   }