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
    if (!user) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }
    console.log(user)
    user.orders.push(numberOfOrder)
  await user.save();
  
    const today = new Date(Date.now());
    const todayDate = (day + '.' + month + '.' + today.getFullYear());
    const month = (`0${today.getMonth() + 1}`).slice(-2) 
    const day = (`0${today.getDate()}`).slice(-2)  
    const emailText = {
    from: MAIL_USER,
    to: email,
    subject: `Ваше замовлення №${numberOfOrder} прийнято в роботу`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0 Transitional//UK">
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body style="width: 600px">
    <table
      style="
        border: 1px solid rgb(160, 152, 152);
        margin-bottom: 30px;
        max-width: 600px;
        width: 600px;
      "
    >
      <caption
        style="
          border: 1px solid rgb(160, 152, 152);
          border-bottom: 0;
          text-align: left;
          padding: 2px 7px;
          background-color: #9a969638;
        "
      >
        <b>Деталі замовлення</b>
      </caption>
      <tr>
        <td style="border-right: 1px solid rgb(160, 152, 152); padding: 5px">
          <p style="margin: 0"><b>Номер замовлення: </b>${numberOfOrder}</p>
          <p style="margin: 0"><b>Дата замовлення: </b>${todayDate}</p>
          <p style="margin: 0">
            <b>Спосіб оплати: </b>${payment}
          </p>
          <p style="margin: 0"><b>Спосіб доставки: </b>${deliveryType}</p>
        </td>
        <td style="padding: 5px">
          <p style="margin: 0"><b>Е-mail: </b>${email}</p>
          <p style="margin: 0"><b>Телефон: </b>${tel}</p>
          <p style="margin: 0"><b>Статус замовлення: </b>В роботі</p>
        </td>
      </tr>
    </table>

    <table
      style="
        border: 1px solid rgb(160, 152, 152);
        margin-bottom: 30px;
        max-width: 600px;
        width: 600px;
      "
    >
      <caption
        style="
          border: 1px solid rgb(160, 152, 152);
          border-bottom: 0;
          text-align: left;
          padding: 2px 7px;
          background-color: #9a969638;
        "
      >
        <b>Реквізити для оплати</b>
      </caption>
      <tr>
        <td style="padding: 5px">
          <p style="margin: 0; padding: 15px 0">
            <b>Отримувач</b><br />ФОП Занкевич Володимир Михайлович
          </p>
          <p style="margin: 0">
            <b>Рахунок отримувача</b><br />UA253808050000000260072159049
          </p>
          <p style="margin: 0; padding: 15px 0"><b>ІПН</b><br />3563508559</p>
          <p style="margin: 0">
            <b>Банк отримувач</b><br />ПАТ "Райффайзен Банк"
          </p>
          <p style="margin: 0; padding: 15px 0">
            <b>Призначення платежу: </b>Оплата згідно рахунку №${numberOfOrder}
            від ${day + '.' + month + '.' + today.getFullYear()}р.
          </p>
        </td>
      </tr>
    </table>

    <table
      style="
        border: 1px solid rgb(160, 152, 152);
        margin-bottom: 30px;
        width: 600px;
      "
    >
      <caption
        style="
          border: 1px solid rgb(160, 152, 152);
          border-bottom: 0;
          text-align: left;
          width: 600px;
          padding: 2px 7px;
          background-color: #9a969638;
        "
      >
        <b>Адреса доставки</b>
      </caption>
      <tr>
        <td style="padding: 5px">
          <p style="margin: 0">${firstName +" " + lastName}</p>
          <p style="margin: 0">
            ${warehouse}
          </p>
          <p style="margin: 0">${city}</p>
        </td>
      </tr>
    </table>

    <table
      border="1"
      style="
        max-width: 600px;
        border-collapse: collapse;
        width: 600px;
        margin-bottom: 30px;
        border: 1px solid rgb(160, 152, 152);
      "
    >
      <tr style="background-color: #9a969638">
        <th style="padding: 5px">Товар</th>
        <th style="padding: 5px">Код товару</th>
        <th style="padding: 5px">Кількість</th>
        <th style="padding: 5px">Ціна</th>
        <th style="padding: 5px">Разом</th>
      </tr>
      ${cartItems.map(item => `<tr style="text-align: center">
         <td style="text-align: left; padding: 5px">
           ${item.name}
         </td>
         <td style="padding: 5px">${item.codeOfGood}</td>
         <td style="padding: 5px">${item.quantityOrdered}</td>
         <td style="padding: 5px">${item.price} грн</td>
         <td style="padding: 5px">${item.totalPrice} грн</td>
       </tr>`).join(" ")}

      <tr style="text-align: center">
        <td colspan="4" style="padding: 5px"><b>Разом</b></td>
        <td style="padding: 5px">${order.total} грн</td>
      </tr>
    </table>

    <p style="color: #ff0505">
      <b
        >При замовленні індивідуальної збірки за умови накладеного платежу -
        передоплата 20%</b
      >
    </p>

    <p>
      Якщо у Вас виникли будь-які запитання, дайте відповідь на це повідомлення,
      або звяжіться із нами за номером телефону який вказаний на сайті.
    </p>
    <hr />
    <p>
      Дякуємо за замовлення! <br />
      З повагою, команда BatteryFly
    </p>
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