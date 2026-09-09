const { Product } = require('../models/product');
const { CodeOfGoods } = require('../models/codeOdGoods')
const {ProductZbirky} = require('../models/products_zbirky')
const { HttpError, ctrlWrapper } = require('../helpers');
const { ORDER_SORT, sortByOrder } = require('../helpers/productScopes');

const getAllProducts = async (req, res) => {
    console.log("All")
    const products = await Product.find({ popular: 'true' });
    const productsZbirky = await ProductZbirky.find({ popular: 'true' });
    
    
    if (!products || !productsZbirky) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
      result: [
        ...products,
        ...productsZbirky,
      ]
    });
}

const getProductsArray = async (req, res) => {
    console.log("getProductsArray")
    const {products} = req.body
    const prod = await Product.find({codeOfGood: [...products]})
    const productsZbirky = await ProductZbirky.find({codeOfGood: [...products]})
    
    
    if (!products && !productsZbirky) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
      result: [
        ...prod,
        ...productsZbirky,
      ]
    });
}

// ⚠️ Змішані списки (усі акумулятори, популярне, акції) за `order` НЕ
// сортуються навмисно. order унікальний у межах СВОГО списку, тож у збірному
// переліку товари різних типів мали б однакові номери й перемішались би між
// собою — сторінка /batteries змінила б вигляд, хоч ніхто нічого не
// перетягував. В адмінці спільної сторінки для них немає, а отже й порядку,
// який треба було б повторити.
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
    const result = sortByOrder(await ProductZbirky.find({ category: "assembly" }).sort(ORDER_SORT));
    
    
    
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
        result: [
        ...salesProducts,
        ...salesProductsZbirky
        ]
  });
}

const getBatterys21700 = async (req, res) => {
    console.log("Batterys 21700")
    const result = sortByOrder(await Product.find({ type: "21700" }).sort(ORDER_SORT))
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getBatterys18650 = async (req, res) => {
    console.log("Batterys 18650")
    const result = sortByOrder(await Product.find({ type: "18650" }).sort(ORDER_SORT))
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};


const getBatterysFpv = async (req, res) => {
    console.log("getBatterysFpv")
    const result = sortByOrder(await ProductZbirky.find({ category: "fpv" }).sort(ORDER_SORT))
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getBatterysTransport = async (req, res) => {
    console.log("getBatterysTransport")
    const result = sortByOrder(await ProductZbirky.find({ category: "transport" }).sort(ORDER_SORT))
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getBatterysToys = async (req, res) => {
    console.log("getBatterysToys")
    const result = sortByOrder(await ProductZbirky.find({ category: "toys" }).sort(ORDER_SORT))
    
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
    // ⚠️ return обов'язковий. Без нього після відповіді по звичайному товару
    // виконання йшло далі й слало ДРУГУ відповідь по збірці — Express писав
    // ERR_HTTP_HEADERS_SENT у лог на кожне відкриття картки товару.
    if (product !== null) {
        res.status(200).json({
            result: product
        });

        return;
    }

    res.status(200).json({
        result: productZbirka
    });
};

const getDevices = async (req, res) => {
    console.log("getDevices")
    const result = sortByOrder(await Product.find({ category: "devices" }).sort(ORDER_SORT))
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};

const getMaterials = async (req, res) => {
    console.log("getMaterials")
    const result = sortByOrder(await Product.find({ category: "materials" }).sort(ORDER_SORT))
    
    if (!result) {
        throw HttpError(401, 'Bad request');
    }
    res.status(200).json({
        result
    });
};



module.exports = {
    getAllProducts: ctrlWrapper(getAllProducts),
    getAllBatterys: ctrlWrapper(getAllBatterys),
    getSales: ctrlWrapper(getSales),
    getBatterys21700: ctrlWrapper(getBatterys21700),
    getBatterys18650: ctrlWrapper(getBatterys18650),
    getProductById: ctrlWrapper(getProductById),
    getBatterysFpv: ctrlWrapper(getBatterysFpv),
    getBatterysTransport: ctrlWrapper(getBatterysTransport),
    getBatterysToys: ctrlWrapper(getBatterysToys),
    getDevices: ctrlWrapper(getDevices),
    getMaterials: ctrlWrapper(getMaterials),
    getAssemblies: ctrlWrapper(getAssemblies), 
    getProductsArray: ctrlWrapper(getProductsArray),
    






}