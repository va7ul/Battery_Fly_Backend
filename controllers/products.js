const { Product } = require('../models/product');
const { CodeOfGoods } = require('../models/codeOdGoods')
const {ProductZbirky} = require('../models/products_zbirky')
const { HttpError, ctrlWrapper } = require('../helpers');

const getAllProducts = async (req, res) => {
    console.log("All")
    const products = await Product.find({})
    const productsZbirky = await ProductZbirky.find({})
    
    
    if (!products) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        products,
        productsZbirky
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

    const addResult = await Product.create({ ...req.body, codeOfGood })
    if (!addResult) {
        throw HttpError(500, 'Internal server eror, write code in DB');
    }
    res.status(200).json({addResult})
};

const addProductZbirky = async (req, res) => {
    const code = await CodeOfGoods.findOne({})
    console.log(code.codeCounter)
    const codeOfGood= code.codeCounter += 1;

    const result = await code.save();
    if (!result) {
        throw HttpError(500, 'Internal server eror, write code in DB');
    }

    const addResult = await ProductZbirky.create({ ...req.body, codeOfGood })
    if (!addResult) {
        throw HttpError(500, 'Internal server eror, write code in DB');
    }
    res.status(200).json({addResult})
};


module.exports = {
    getAllProducts: ctrlWrapper(getAllProducts),
    addProduct: ctrlWrapper(addProduct),
    addProductZbirky: ctrlWrapper(addProductZbirky)
}