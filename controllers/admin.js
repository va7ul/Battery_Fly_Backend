const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');



const { SECRET_KEY } = process.env;
const { HttpError, ctrlWrapper, cloudImageProduct } = require('../helpers');
const { Admin } = require('../models/admin');
const { CodeOfGoods } = require('../models/codeOdGoods');
const { Product } = require('../models/product');
const { ProductZbirky } = require('../models/products_zbirky');
const { Hero } = require('../models/hero');
const { Order } = require('../models/order');
const { Print3dOrder } = require('../models/print3d');
const { QuickOrder } = require('../models/quickOrder');
const { User } = require('../models/user');
const { PromoCode } = require('../models/promoCode');




const login = async (req, res) => {
  const { login, password } = req.body;
  const user = await Admin.findOne({ login });
  if (!user) {
    throw HttpError(401, 'Email or password is wrong');
  }

  const passwordCompare = await bcrypt.compare(password, user.password);
  if (!passwordCompare) {
    throw HttpError(401, 'Email or password is wrong');
  }

  const payload = { id: user._id };
  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '1y' });
  await Admin.findByIdAndUpdate(user._id, { token });

  res.status(200).json({
      login,
      token,
  });
};

const logout = async (req, res) => {
  const { _id } = req.user;
  await Admin.findByIdAndUpdate(_id, { token: '' });

  res.status(204).end();
};

const getCurrent = async (req, res) => {
  const {
    login,
    token,
  } = req.user;

  res.status(200).json({
      login,
      token,
  });
};


const addProduct = async (req, res) => {
  console.log("addProduct")
    
  const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const code = await CodeOfGoods.findOne({})

  const codeOfGood = code.codeCounter += 1;

  const result = await code.save();
  if (!result) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }
  
  const images = await cloudImageProduct(req.files)


  const addResult = await Product.create({ ...req.body, codeOfGood, image: images })
    
  
  if (!addResult) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }
  res.status(200).json({ addResult })
};

const editProduct = async (req, res) => {
  console.log("editProduct")
    
  const { token } = req.user;
  const { id } = req.params;
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  if (req.files.length > 0) {

    const images = await cloudImageProduct(req.files)

    const editResult = await Product.findOneAndUpdate({ codeOfGood: id }, { ...req.body, image: images }, { new: true })
    
    if (!editResult) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }
  res.status(200).json({ editResult })
  }

  const editResult = await Product.findOneAndUpdate({ codeOfGood: id }, { ...req.body}, { new: true })
  
  if (!editResult) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }
  res.status(200).json({ editResult })
};

const addProductZbirky = async (req, res) => {
    console.log("addProductZbirky")
   
    const {token} = req.user;

    const admin = await Admin.findOne({ token })
    
    if (!admin) {
        throw HttpError(404, 'Not Found');
    }

    const code = await CodeOfGoods.findOne({})
   
    const codeOfGood= code.codeCounter += 1;

    const result = await code.save();
    if (!result) {
        throw HttpError(500, 'Internal server eror, write code in DB');
  }
  const capacity = JSON.parse(req.body.capacity)

  const newCapacity = {};

  for (const cap of capacity) {
    const key = Object.keys(cap)
    
    newCapacity[key[0]] = cap[key[0]]
  }
  

    const images = await cloudImageProduct(req.files)

    const addResult = await ProductZbirky.create({ ...req.body, codeOfGood, image: images, capacity: {...newCapacity} })
    if (!addResult) {
        throw HttpError(500, 'Internal server eror, write code in DB');
    }
  res.status(200).json({addResult})

  
};

const changeHeaderInfo = async (req, res) => {

   const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }
  console.log(req.file)
  const { text } = req.body;
  const { id } = req.params;
  const arr = [];
  arr.push(req.file)

  const img = await cloudImageProduct(arr)


  const hero = await Hero.findByIdAndUpdate({ _id: id }, {text, image: img[0]}, {new: true});
  
  if (!hero) {
    throw HttpError(400, 'Wrong id');
  }

  await hero.save()



res.status(200).json({ hero })

}

const addHeaderInfo = async (req, res) => {
  const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }
  
  const { text } = req.body;
  const arr = [];
  arr.push(req.file)

  const img = await cloudImageProduct(arr)


  const hero = await Hero.create({ text, image: img[0]});
  
  if (!hero) {
    throw HttpError(500, 'Internal server error');
  }

  res.status(200).json({ hero })
};

const deleteHeaderInfo = async (req, res) => {
  console.log("deleteHeaderInfo")
  const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { id } = req.params;

  const hero = await Hero.findByIdAndDelete({_id: id});

  if (!hero) {
    throw HttpError(400, 'Wrong id');
  }

  res.status(200).json({ message: "Delete successful" })

}

const getOrders = async (req, res) => {
  console.log("getOrders")
  
    const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

        const orders = await Order.find({});
        
        const result = orders.map(order => {
        return {
          numberOfOrder: order.numberOfOrder,
          firstName: order.firstName,
          lastName: order.lastName,
          email: order.email,
          comment: order.comment,
          tel: order.tel,
          total: order.total,
          promoCode: order.promoCode,
          promoCodeDiscount: order.promoCodeDiscount,
          discountValue: order.discountValue,
          together: order.together,
          cartItems: order.cartItems,
          deliveryType: order.deliveryType,
          city: order.city,
          warehouse: order.warehouse,
          payment: order.payment,
          date: order.createdAt,
          status: order.status,
        };
        })
        
        res.status(200).json({
        result
      });
        
    
}

const getOrderById = async (req, res) => {
  console.log("getOrderById")
  const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }
  
    const order = await Order.findOne({numberOfOrder: req.params.id});

    res.status(200).json({
        result: order
      });
}

const get3dPrintOrders = async (req, res) => {
  console.log("get3dPrintOrders")
  const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }
  
  const orders = await Print3dOrder.find({});

  res.status(200).json({
    result: orders
  });
};

const get3dPrintOrderById = async (req, res) => {
  console.log("get3dPrintOrderById")
  const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }
  
  const order = await Print3dOrder.findOne({ numberOfOrder: req.params.id });

  res.status(200).json({
    result: order
  });
};

const getQuickOrders = async (req, res) => {
  console.log("getQuickOrders")
  const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }
  
    const orders = await QuickOrder.find({});

    res.status(200).json({
        result: orders
      });
}

const getQuickOrderById = async (req, res) => {
  console.log("getQuickOrderById")
  const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }
  
  const order = await QuickOrder.findOne({ numberOfOrder: req.params.id });

  res.status(200).json({
    result: order
  });
};

const getUsers = async (req, res) => {
  console.log("getUsers")
  const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }
  
  const users = await User.find({}, {"password": 0,"verificationToken": 0, "token": 0});

  // _id: user._id,
  //   firstName: user.firstName,
  //   lastName: user.lastName,
  //   patronymic: user.patronymic,
  //   tel: user.tel,
  //   email: user.email,
  //   orders: user.orders,
  //   delivery: user.delivery,
  //   verifiedEmail: user.verifiedEmail,
  //   favorites: user.favorites,
  //   promoCodes: user.promoCodes
  
  res.status(200).json({
    users
  });
}

const getUserById = async (req, res) => {
  console.log("getUserById")
  const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const {id} = req.params
  
  const user = await User.findOne({_id: id}, {"password": 0,"verificationToken": 0, "token": 0});

  // _id: user._id,
  //   firstName: user.firstName,
  //   lastName: user.lastName,
  //   patronymic: user.patronymic,
  //   tel: user.tel,
  //   email: user.email,
  //   orders: user.orders,
  //   delivery: user.delivery,
  //   verifiedEmail: user.verifiedEmail,
  //   favorites: user.favorites,
  //   promoCodes: user.promoCodes
  
  res.status(200).json({
    user
  });
}

const getPromocode = async (req, res) => {
  console.log("getPromocode")

   const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const promo = await PromoCode.find({  })
  

  if (!promo) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }

  res.status(200).json({
    promo
  });
}

const addPromocode = async (req, res) => {
  console.log("addPromocode")

   const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { name } = req.body;

  const oldCode = await PromoCode.findOne({ name })
  
  if (oldCode) {
    throw HttpError(409, 'Promocode with the same name already exists');
  }

  const promo = await PromoCode.create({...req.body});

  if (!promo) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }

  res.status(200).json({
    promo
  });
}

const updatePromocode = async (req, res) => {
  console.log("updatePromocode")

  const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { id } = req.params;

  const promo = await PromoCode.findByIdAndUpdate({ _id: id }, { ...req.body }, { new: true });

  if (!promo) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }

  res.status(200).json({
    promo
  });
};

const deletePromocode = async (req, res) => {
  console.log("deletePromocode")

   const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { id } = req.params;

  const promo = await PromoCode.findByIdAndDelete({_id: id});

  if (!promo) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }

  res.status(200).json({ message: "Delete successful" })

}



module.exports = {

  login: ctrlWrapper(login),
  logout: ctrlWrapper(logout),
  getCurrent: ctrlWrapper(getCurrent),
  addProduct: ctrlWrapper(addProduct),
  addProductZbirky: ctrlWrapper(addProductZbirky),
  changeHeaderInfo: ctrlWrapper(changeHeaderInfo),
  addHeaderInfo: ctrlWrapper(addHeaderInfo),
  deleteHeaderInfo: ctrlWrapper(deleteHeaderInfo),
  getOrders: ctrlWrapper(getOrders),
  getOrderById: ctrlWrapper(getOrderById),
  get3dPrintOrders: ctrlWrapper(get3dPrintOrders),
  get3dPrintOrderById: ctrlWrapper(get3dPrintOrderById),
  getQuickOrders: ctrlWrapper(getQuickOrders),
  getQuickOrderById: ctrlWrapper(getQuickOrderById),
  getUsers: ctrlWrapper(getUsers),
  getUserById: ctrlWrapper(getUserById),
  addPromocode: ctrlWrapper(addPromocode),
  getPromocode: ctrlWrapper(getPromocode),
  updatePromocode: ctrlWrapper(updatePromocode),
  deletePromocode: ctrlWrapper(deletePromocode),
  editProduct: ctrlWrapper(editProduct),













};
