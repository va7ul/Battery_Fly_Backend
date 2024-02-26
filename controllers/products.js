const { Product } = require('../models/product');
const { CodeOfGoods } = require('../models/codeOdGoods')
const {ProductZbirky} = require('../models/products_zbirky')
const { HttpError, ctrlWrapper } = require('../helpers');

const getAllProducts = async (req, res) => {
    console.log("All")
    const products = await Product.find({})
    const productsZbirky = await ProductZbirky.find({})
    
    
    if (!products || !productsZbirky) {
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

const getAllBatterys = async (req, res) => {
    console.log("All Batterys")
    const battery = await Product.find({ category: "battery" })
    
    
    
    if (!battery) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        battery
    });
};

const getSales = async (req, res) => {
    console.log("Sales")
    const salesProducts = await Product.find({sale: "true"})
    const salesProductsZbirky = await ProductZbirky.find({sale: "true"})
    
    
    if (!salesProducts || !salesProductsZbirky) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        salesProducts,
        salesProductsZbirky
  });
}

const getBatterys21700 = async (req, res) => {
    console.log("Batterys 21700")
    const battery21700 = await Product.find({ type: "21700" })
    
    if (!battery21700) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        battery21700
    });
};

const getBatterys18650 = async (req, res) => {
    console.log("Batterys 18650")
    const battery18650 = await Product.find({ type: "18650" })
    
    if (!battery18650) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        battery18650
    });
};

const getBatterys32650 = async (req, res) => {
    console.log("Batterys 18650")
    const battery32650 = await Product.find({ type: "32650" })
    
    if (!battery32650) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        battery32650
    });
};

const getBatterysFpv = async (req, res) => {
    console.log("getBatterysFpv")
    const batterysFpv = await ProductZbirky.find({ category: "fpv" })
    
    if (!batterysFpv) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        batterysFpv
    });
};

const getBatterysTransport = async (req, res) => {
    console.log("getBatterysTransport")
    const batterysTransport = await ProductZbirky.find({ category: "transport" })
    
    if (!batterysTransport) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        batterysTransport
    });
};

const getBatterysToys = async (req, res) => {
    console.log("getBatterysToys")
    const batterysToys = await ProductZbirky.find({ category: "toys" })
    
    if (!batterysToys) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        batterysToys
    });
};

const getProductById = async (req, res) => {
    console.log("getProductById")
    
    const { id } = req.params;
    const product = await Product.findOne({codeOfGood: id})
    const productZbirka = await ProductZbirky.findOne({codeOfGood: id})
    
    if (!product && !productZbirka) {
        throw HttpError(401, 'Bad request');
    }
    if (product !== null) {
        res.status(200).json({
        product
    });
    }
    res.status(200).json({
        productZbirka
    });
};

const getDevices = async (req, res) => {
    console.log("getDevices")
    const devices = await Product.find({ category: "devices" })
    
    if (!devices) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        devices
    });
};

module.exports = {
    getAllProducts: ctrlWrapper(getAllProducts),
    addProduct: ctrlWrapper(addProduct),
    addProductZbirky: ctrlWrapper(addProductZbirky),
    getAllBatterys: ctrlWrapper(getAllBatterys),
    getSales: ctrlWrapper(getSales),
    getBatterys21700: ctrlWrapper(getBatterys21700),
    getBatterys18650: ctrlWrapper(getBatterys18650),
    getBatterys32650: ctrlWrapper(getBatterys32650),
    getProductById: ctrlWrapper(getProductById),
    getBatterysFpv: ctrlWrapper(getBatterysFpv),
    getBatterysTransport: ctrlWrapper(getBatterysTransport),
    getBatterysToys: ctrlWrapper(getBatterysToys),
    getDevices: ctrlWrapper(getDevices),





}