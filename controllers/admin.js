const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');



const { SECRET_KEY } = process.env;
const { HttpError, ctrlWrapper, cloudImageProduct } = require('../helpers');
const { Admin } = require('../models/admin');
const { CodeOfGoods } = require('../models/codeOdGoods');
const { Product } = require('../models/product');
const { ProductZbirky } = require('../models/products_zbirky');
const { Hero } = require('../models/hero');





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

  let newCapacity = {};

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
  let arr = [];
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
  let arr = [];
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

module.exports = {

  login: ctrlWrapper(login),
  logout: ctrlWrapper(logout),
  getCurrent: ctrlWrapper(getCurrent),
  addProduct: ctrlWrapper(addProduct),
  addProductZbirky: ctrlWrapper(addProductZbirky),
  changeHeaderInfo: ctrlWrapper(changeHeaderInfo),
  addHeaderInfo: ctrlWrapper(addHeaderInfo),
  deleteHeaderInfo: ctrlWrapper(deleteHeaderInfo),


    
    

};
