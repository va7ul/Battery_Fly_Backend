const { ctrlWrapper, HttpError } = require('../helpers');
const { FeedBack } = require('../models/feedback');
const {NumberOfOrders} = require('../models/numberOfOrders');


const addFeedBack = async (req, res) => {
    console.log("addFeedBack")

    const number = await NumberOfOrders.findOne({})
    const numberOfOrder = number.numberOrder +=1;

    const result = await number.save();
    
    if (!result) {
                throw HttpError(500, 'Internal server error, write orderNumber in DB');
            }


    const {name, tel, text} = req.body;

    const finalyFeedBack = {
        name,
        tel,
        comment: text,
        numberOfApplication: numberOfOrder
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