const { ctrlWrapper, HttpError } = require('../helpers');
const { FeedBack } = require('../models/feedback');

const addFeedBack = async (req, res) => {
    console.log("addFeedBack")

    const {name, tel, text} = req.body;

    const finalyFeedBack = {
        name,
        tel,
        comment: text
    };
    const feedBack = await FeedBack.create({ ...finalyFeedBack })
        

    if (!feedBack) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }
    
    res.status(200).json({
        message: "Feed Back is accepted"
      });
}

module.exports = {
    addFeedBack: ctrlWrapper(addFeedBack),

};