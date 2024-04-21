const { ctrlWrapper, HttpError } = require('../helpers');
const { NOVA_POST } = process.env;

const axios = require('axios');
const { Order } = require('../models/order');
const {NumberOfOrders} = require('../models/numberOfOrders');
const { User } = require('../models/user');
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
            "Page": "1",
            "Limit": "50",
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

    const {userData:{firstName, lastName, email, text, tel}, total, cartItems, deliveryType, city, warehouse, payment} = req.body;

    const finalyOrder = {
        numberOfOrder,
        firstName, 
        lastName, 
        email, 
        comment: text, 
        tel, 
        total, 
        cartItems, 
        deliveryType, 
        city, 
        warehouse, 
        payment
    }
    const order = await Order.create({...finalyOrder})

    if (!order) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }
    
    res.status(200).json({
        message: "Order is accepted"
      });
}

const getOrders = async (req, res) => {
    console.log(req.user.email)
    const orders = await Order.find({email: req.user.email});

    console.log(orders)

    const result = orders.map(order => {
        return {
            numberOfOrder: order.numberOfOrder,
            date: order.createdAt,
            total: order.total,
            status: order.status
        }
    })
    

    
    res.status(200).json({
        result
      });
}

module.exports = {
    getDeliveryCity: ctrlWrapper(getDeliveryCity),
    getWarehouses: ctrlWrapper(getWarehouses),
    addOrder: ctrlWrapper(addOrder),
    getOrders: ctrlWrapper(getOrders),

};