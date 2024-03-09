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
    const result = await Product.find({ category: "battery" })
    
    
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getAssemblies = async (req, res) => {
    console.log("getAssemblies")
    const result = await ProductZbirky.find({ })
    
    
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
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
        result: {
        salesProducts,
        salesProductsZbirky
        }
        
  });
}

const getBatterys21700 = async (req, res) => {
    console.log("Batterys 21700")
    const result = await Product.find({ type: "21700" })
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getBatterys18650 = async (req, res) => {
    console.log("Batterys 18650")
    const result = await Product.find({ type: "18650" })
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getBatterys32650 = async (req, res) => {
    console.log("Batterys 18650")
    const result = await Product.find({ type: "32650" })
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getBatterysFpv = async (req, res) => {
    console.log("getBatterysFpv")
    const result = await ProductZbirky.find({ category: "fpv" })
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getBatterysTransport = async (req, res) => {
    console.log("getBatterysTransport")
    const result = await ProductZbirky.find({ category: "transport" })
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getBatterysToys = async (req, res) => {
    console.log("getBatterysToys")
    const result = await ProductZbirky.find({ category: "toys" })
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getProductById = async (req, res) => {
    console.log("getProductById")
    const { id } = req.params;

    const product = await Product.findOne({ codeOfGood: id })
    const productZbirka = await ProductZbirky.findOne({codeOfGood: id})
    
    if (!product && !productZbirka) {
        throw HttpError(401, 'Bad request');
    }
    if (product !== null) {
        const result = product
        res.status(200).json({
        result
    });
    }
    const result = productZbirka
    res.status(200).json({
        result
    });
};

const getDevices = async (req, res) => {
    console.log("getDevices")
    const result = await Product.find({ category: "devices" })
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getMaterials = async (req, res) => {
    console.log("getMaterials")
    const result = await Product.find({ category: "materials" })
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getBatterysLipo = async (req, res) => {
    console.log("Batterys 21700")
    const result = await Product.find({ type: "li-po" })
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getBatterysLidepo4 = async (req, res) => {
    console.log("Batterys 21700")
    const result = await Product.find({ type: "lifepo4" })
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
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
    getMaterials: ctrlWrapper(getMaterials),
    getBatterysLipo: ctrlWrapper(getBatterysLipo),
    getBatterysLidepo4: ctrlWrapper(getBatterysLidepo4),
    getAssemblies: ctrlWrapper(getAssemblies),






}