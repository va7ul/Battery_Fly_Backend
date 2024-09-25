const { ctrlWrapper, HttpError, sendEmail } = require('../helpers');
const { NOVA_POST, MAIL_USER } = process.env;

const axios = require('axios');
const {PromoCode} = require('../models/promoCode')
const { Order } = require('../models/order');
const {NumberOfOrders} = require('../models/numberOfOrders');
const { User } = require('../models/user');
const { QuickOrder } = require('../models/quickOrder');
axios.defaults.baseURL = "https://api.novaposhta.ua/v2.0/json/"

const getDeliveryCity = async (req, res) => {

    const reqData = {
        "apiKey": NOVA_POST,
        "modelName": "Address",
        "calledMethod": "getCities",
        "methodProperties": {

            "Page": "1",
            "FindByString": req.body.query,
            "Limit": "20"
        }
    };

    axios.post('searchSettlements', reqData )
        .then(function (response) {
          
      const result = response.data.data.map(item => item.Description)
      res.status(200).json({
          cities: result
      });
  })
  .catch(function () {
    res.status(500).json({
          message: 'Bad request'
      });
  })
};

const getWarehouses = async (req, res) => {

    const reqData = {
        "apiKey": NOVA_POST,
        "modelName": "Address",
        "calledMethod": "getWarehouses",
        "methodProperties": {
            "FindByString": "",
            "CityName": req.body.query,
            // "Page": "1",
            // "Limit": "50",
            "Language": "UA"
        }
    };

    axios.post('getWarehouses', reqData )
        .then(function (response) {
          
      const result = response.data.data.map(item => item.Description)
      res.status(200).json({
          werehouses: result
      });
  })
  .catch(function () {
    res.status(500).json({
          message: 'Bad request'
      });
  })
};

const addOrder = async (req, res) => {
    console.log("addOrder")

    const number = await NumberOfOrders.findOne({})
    const numberOfOrder = number.numberOrder +=1;

    const result = await number.save();
    
    if (!result) {
                throw HttpError(500, 'Internal server error, write orderNumber in DB');
            }

    const {userData:{firstName, lastName, email, text, tel}, total, cartItems, deliveryType, city, warehouse, payment, promoCode, promoCodeDiscount, discountValue, together} = req.body;

    const finalyOrder = {
        numberOfOrder,
        firstName, 
        lastName, 
        email, 
        comment: text, 
        tel, 
        total, 
        promoCode,
        promoCodeDiscount,
        discountValue,
        together,
        cartItems, 
        deliveryType, 
        city, 
        warehouse, 
        payment
    }
    const order = await Order.create({ ...finalyOrder })

    if (promoCode) {

        const promo = await PromoCode.findOne({ name: promoCode })
        
        if (promo) {
            const user = await User.findOne({ email });
            user.promoCodes.push(promoCode);
            await user.save();
        }
        
        
    }
    
    if (!order) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }

    const user = await User.findOne({ email })
  
  if (user) {
    user.orders.push(numberOfOrder)
    await user.save();
  }
  
    
  
    const today = new Date(Date.now());
    const day = (`0${today.getDate()}`).slice(-2)  
    const month = (`0${today.getMonth() + 1}`).slice(-2) 
    const todayDate = (day + '.' + month + '.' + today.getFullYear());
    const emailText = {
    from: MAIL_USER,
    to: email,
    subject: `Ваше замовлення №${numberOfOrder} оформлено`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0 Transitional//UK">
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body style="width: 600px">
    <b>Ваше замовлення успішно оформлене!</b>
    <p>
      Дякуємо за ваше замовлення в BatteryFly! Ми раді повідомити, що ваше
      замовлення №${numberOfOrder} було успішно прийнято.
    </p>
    <p>
      Незабаром ми зв’яжемось з вами для уточнення деталей та подальших кроків.
    </p>
    <p>
      Якщо у вас виникли запитання, зв'яжіться з нашою підтримкою: <br />тел.
      <a href="tel:+380509686485">+38(050)968-64-85</a>, e-mail
      <a href="mailto:batteryfly@meta.ua">batteryfly@meta.ua</a>
    </p>
    <p>Дякуємо, що обрали BatteryFly! Чекаємо на вашу відповідь.</p>
    <hr />
    <p>З повагою, <br />Команда BatteryFly</p>
  </body>
</html>
`,
    
    };
    
    await sendEmail(emailText);


    res.status(200).json({
        orderNum: numberOfOrder
      });
}

const getOrders = async (req, res) => {
    console.log("getOrders")

    if (req.admin) {
        const orders = await Order.find({}).sort({numberOfOrder:-1});
        
        const result = orders.map(order => {
        return {
            numberOfOrder: order.numberOfOrder,
            date: order.createdAt,
            together: order.together,
            status: order.status
        }
        })
        
        res.status(200).json({
        result
      });
        
    }


    const orders = await Order.find({ email: req.user.email }).sort({
      numberOfOrder: -1,
    });

    console.log(orders)

    const result = orders.map(order => {
        return {
            numberOfOrder: order.numberOfOrder,
            date: order.createdAt,
            together: order.together,
            status: order.status
        }
    })
    

    
    res.status(200).json({
        result
      });
}

const getOrderById = async (req, res) => {
    console.log(req.user.email)
    console.log(req.params.id)
    const order = await Order.findOne({numberOfOrder: req.params.id});

    if(req.user.email !== order.email){
        throw HttpError(400, 'Bad request');
    }

    res.status(200).json({
        result: order
      });
}

const getPromoCode = async (req, res) => {

    const promoCode = await PromoCode.findOne({ name: req.params.name });
    
    const user = req.user;

    if(!promoCode){
        throw HttpError(400, 'Bad request');
    }

    const usesPromo = user.promoCodes.find(item => item === req.params.name)

    if (promoCode.valid && !usesPromo) {
        res.status(200).json({
        promoCode
        });
    }
    if (promoCode.valid && usesPromo) {
        throw HttpError(409, 'promoCode already in use');
    }

    if (!promoCode.valid) {
        throw HttpError(409, 'promoCode not valid');
    }
}

const addQuickOrder = async (req, res) => {
    console.log("addQuickOrder")

    const number = await NumberOfOrders.findOne({})
    const numberOfOrder = number.numberOrder +=1;

    const result = await number.save();
    
    if (!result) {
                throw HttpError(500, 'Internal server error, write orderNumber in DB');
            }

    const {name,userName,email, tel, codeOfGood} = req.body;

    const finalyOrder = {
        numberOfOrder,
        userName,
        email,
        tel,
        codeOfGood,
        name
    };
    const quickOrder = await QuickOrder.create({ ...finalyOrder })
        

    if (!quickOrder) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }
    
    res.status(200).json({
        message: "Quick order is accepted"
      });
}

module.exports = {
    getDeliveryCity: ctrlWrapper(getDeliveryCity),
    getWarehouses: ctrlWrapper(getWarehouses),
    addOrder: ctrlWrapper(addOrder),
    getOrders: ctrlWrapper(getOrders),
    getOrderById: ctrlWrapper(getOrderById),
    getPromoCode: ctrlWrapper(getPromoCode),
    addQuickOrder: ctrlWrapper(addQuickOrder),
};