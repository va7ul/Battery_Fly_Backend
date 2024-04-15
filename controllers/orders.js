const { HttpError, ctrlWrapper } = require('../helpers');
const { NOVA_POST } = process.env;

const axios = require('axios');
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

module.exports = {
    getDeliveryCity: ctrlWrapper(getDeliveryCity),
    getWarehouses: ctrlWrapper(getWarehouses),
    
};