const { Product } = require('../models/product');
const {CodeOfGoods} = require('../models/codeOdGoods')
const { HttpError, ctrlWrapper } = require('../helpers');

const getAllProducts = async (req, res) => {
    console.log("All")
    const products = await Product.find({})
    const codeOfGood = await CodeOfGoods.find({})
    
    if (!products) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
    products
  });
}

const addProduct = async (req, res) => {
    const code = await CodeOfGoods.findOne({})
    console.log(code.codeCounter)
    const codeOfGood= code.codeCounter += 1;

    const result = await code.save();
    if (!result) {
        throw HttpError(500, 'Internal server eror, write code in DB');
    }

    console.log(req.body)

    const addResult = await Product.create({...req.body, codeOfGood})
    res.status(200).json({addResult})
};


module.exports = {
    getAllProducts: ctrlWrapper(getAllProducts),
    addProduct: ctrlWrapper(addProduct)
}