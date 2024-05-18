const path = require('path');
const fs = require('fs').promises;
const { MAIL_USER } = process.env;
const {NumberOfOrders} = require('../models/numberOfOrders');


const { Print3d, Print3dOrder } = require('../models/print3d')
const { HttpError, ctrlWrapper, sendEmail } = require('../helpers');

const get3dPrint = async (req, res) => {
    console.log("get3dPrint")
    const print3d = await Print3d.findOne({})
    
    if (!print3d) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        print3d
    });
};

const add3dPrintOrder = async (req, res) => {
    console.log("add3dPrintOrder")
    const number = await NumberOfOrders.findOne({})
    const numberOfOrder = number.numberOrder +=1;

    const result = await number.save();
    
    if (!result) {
                throw HttpError(500, 'Internal server error, write orderNumber in DB');
            }
    const { path } = req.file;
    
    const { userName, tel, text, accuracy, plactic, color } = req.body;

    const finalyOrder = {
        userName,
        tel,
        text,
        accuracy,
        plactic,
        color,
        numberOfOrder
    }
 
    const order = Print3dOrder.create({...finalyOrder})

    if (!order) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }

    const orderEmail = {
    from: MAIL_USER,
    to: MAIL_USER,
    subject: 'New 3dPrint Order',
        html: `<p>Прийшло нове замовлення на 3д Друк:</br>
    Номер замовлення: ${numberOfOrder}</br>
    Ім'я: ${userName}</br>
    Номер телефону: ${tel}</br>
    Коментар: ${text}</br>
    Точність: ${accuracy}</br>
    Колір: ${color}</br>
     </p></br>`,
    attachments: [{path}]   
  };

    await sendEmail(orderEmail);
    
    
    await fs.unlink(path, function (err) {
    if(err && err.code == 'ENOENT') {
        // file doens't exist
        console.info("File doesn't exist, won't remove it.");
    } else if (err) {
        // other errors, e.g. maybe we don't have enough permission
        console.error("Error occurred while trying to remove file");
    } else {
        console.log(`removed`);
    }
    });

    res.status(200).json({
      message: "Message send successfully"
  });
        
};

module.exports = {
    get3dPrint: ctrlWrapper(get3dPrint),
    add3dPrintOrder: ctrlWrapper(add3dPrintOrder),

   }