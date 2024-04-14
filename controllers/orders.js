const { HttpError, ctrlWrapper, sendEmail } = require('../helpers');
const { NOVA_POST } = process.env;

const axios = require('axios');

const getDeliveryCity = async (req, res) => {
    console.log("getFavorite")

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

    axios.post('https://api.novaposhta.ua/v2.0/json/searchSettlements', reqData )
        .then(function (response) {
          
      const result = response.data.data.map(item => item.Description)
      res.status(200).json({
          cities: result
      });
  })
  .catch(function (error) {
    console.log(error);
  })
};

module.exports = {
  getDeliveryCity: ctrlWrapper(getDeliveryCity),
};