const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { SECRET_KEY } = process.env;
const {
  HttpError,
  ctrlWrapper,
  cloudImageProduct,
  resolveProductImages,
  cleanupOrphans,
  ORDER_STATUS,
  isTransitionAllowed,
  calculatePrepayment,
  getSettings: loadSettings,
  toPlainSettings,
  getAllTemplateKeys,
  getTemplateKey,
  renderTemplate,
} = require('../helpers');
const { npPost, NovaPoshtaError } = require('../helpers/novaposhta');
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
const {FeedBack} = require('../models/feedback')
const dashboard = require('../helpers/dashboard');
const { PRODUCT_SCOPES, getNextOrder } = require('../helpers/productScopes');




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
  
  // Для нового товару наявних фото немає, тож resolveProductImages просто
  // завантажить files у тому порядку, який прислала адмінка.
  const { image } = await resolveProductImages([], req.body, req.files)

  if (!image || image.length === 0) {
    throw HttpError(400, 'Потрібне щонайменше одне фото товару');
  }

  // Новий товар стає ОСТАННІМ у своєму списку, а не першим-ліпшим: інакше він
  // з'являвся б у випадковому місці вітрини, і власнику довелося б шукати його
  // серед решти, щоб перетягнути.
  const order = await getNextOrder(req.body);

  const addResult = await Product.create({ ...req.body, codeOfGood, image, order })
    
  
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

  const current = await Product.findOne({ codeOfGood: id });

  if (!current) {
    throw HttpError(404, 'Product not found');
  }

  // Фінальний склад фото рахуємо ДО запису: keepImages каже, що лишається, у
  // якому порядку, files додає нові.
  const { image, orphans } = await resolveProductImages(current.image, req.body, req.files);

  const updateFields = { ...req.body };
  // keepImages/imageOrder — службові поля контракту, у документі товару їм не
  // місце. Без цього вони осіли б у базі окремими полями.
  delete updateFields.keepImages;
  delete updateFields.imageOrder;

  if (image) {
    if (image.length === 0) {
      throw HttpError(400, 'У товарі має лишитись щонайменше одне фото');
    }

    updateFields.image = image;
  }

  // ⚠️ Раніше тут було ДВА res.json підряд: гілка з файлами відповідала й не
  // робила return, тож далі йшов другий запис у базу і другий res.json —
  // Express писав ERR_HTTP_HEADERS_SENT у лог на кожне збереження з фото.
  const editResult = await Product.findOneAndUpdate({ codeOfGood: id }, updateFields, { new: true })

  if (!editResult) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }

  // Прибирання хмари — ПІСЛЯ успішного запису: якщо оновлення впаде, фото ще
  // потрібні товару.
  await cleanupOrphans(orphans, [Product, ProductZbirky], editResult._id);

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
  

    const { image } = await resolveProductImages([], req.body, req.files)

    if (!image || image.length === 0) {
        throw HttpError(400, 'Потрібне щонайменше одне фото товару');
    }

    const order = await getNextOrder(req.body);

    const addResult = await ProductZbirky.create({ ...req.body, codeOfGood, image, capacity: {...newCapacity}, order })
    if (!addResult) {
        throw HttpError(500, 'Internal server eror, write code in DB');
    }
  res.status(200).json({addResult})

  
};

const editProductZbirky = async (req, res) => {
  console.log("editProductZbirky")
    
  const { token } = req.user;
  const { id } = req.params;
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const capacity = JSON.parse(req.body.capacity)
  
  let newCapacity = {};

  for (const cap of capacity) {
    const key = Object.keys(cap)
    
    newCapacity[key[0]] = cap[key[0]]
  }

  const current = await ProductZbirky.findOne({ codeOfGood: id });

  if (!current) {
    throw HttpError(404, 'Product not found');
  }

  // Фінальний склад фото рахуємо ДО запису: keepImages каже, що лишається і в
  // якому порядку, files додає нові.
  const { image, orphans } = await resolveProductImages(current.image, req.body, req.files);

  const updateFields = { ...req.body, capacity: {...newCapacity} };
  // Службові поля контракту не мають осідати в документі товару.
  delete updateFields.keepImages;
  delete updateFields.imageOrder;

  if (image) {
    if (image.length === 0) {
      throw HttpError(400, 'У товарі має лишитись щонайменше одне фото');
    }

    updateFields.image = image;
  }

  // ⚠️ Раніше тут було ДВА res.json підряд: гілка з файлами відповідала й не
  // робила return, тож далі йшов другий запис у базу і другий res.json —
  // Express писав ERR_HTTP_HEADERS_SENT у лог на кожне збереження з фото.
  const editResult = await ProductZbirky.findOneAndUpdate({ codeOfGood: id }, updateFields, { new: true })

  if (!editResult) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }

  // Прибирання хмари — ПІСЛЯ успішного запису: якщо оновлення впаде, фото ще
  // потрібні товару.
  await cleanupOrphans(orphans, [Product, ProductZbirky], editResult._id);

  res.status(200).json({ editResult })
};

const changeHeaderInfo = async (req, res) => {

   const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }
  
  const { text } = req.body;
  const { id } = req.params;

  if (!req.file) {
    const hero = await Hero.findByIdAndUpdate({ _id: id }, { text }, { new: true });
    
    if (!hero) {
    throw HttpError(400, 'Wrong id');
  }

    await hero.save()
    
    res.status(200).json({ hero })
    
  };
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

  res.status(200).json({ id , message: "Delete successful" })

}

const getOrders = async (req, res) => {
  console.log("getOrders")
  
    const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

        const orders = await Order.find({}).sort({ numberOfOrder: -1 });
        
        const result = orders.map(order => {
        return {
          _id: order._id,
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
          // Ручна знижка — щоб список і картка не розходились: зі списку теж
          // можна зробити крок статусу, і він шле замовлення назад цілком.
          personalDiscountRate: order.personalDiscountRate,
          personalDiscountValue: order.personalDiscountValue,
          together: order.together,
          cartItems: order.cartItems,
          deliveryType: order.deliveryType,
          city: order.city,
          warehouse: order.warehouse,
          // ttn і prepaymentAmount свідомо в списку, а не лише в get-order:
          // адмінка шле весь об'єкт замовлення назад в update, і поля, яких у
          // списку немає, доводиться доклеювати руками в кожному обробнику.
          // Заразом ТТН видно прямо в переліку, без заходу в картку.
          ttn: order.ttn,
          prepaymentAmount: order.prepaymentAmount,
          payment: order.payment,
          payParts: order.payParts,
          monopayState: order.monopayState,
          monopaySubState: order.monopaySubState,
          monopayOrderId: order.monopayOrderId,
          acquiringInvoiceId: order.acquiringInvoiceId,
          acquiringStatus: order.acquiringStatus,
          acquiringPageUrl: order.acquiringPageUrl,
          acquiringFailureReason: order.acquiringFailureReason,
          acquiringModifiedDate: order.acquiringModifiedDate,
          createdAt: order.createdAt,
          status: order.status,
          isViewed: order.isViewed,
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
  
  const orders = await Print3dOrder.find({}).sort({ numberOfOrder: -1 });

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
  
    const orders = await QuickOrder.find({}).sort({ numberOfOrder: -1 });

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
  
  const users = await User.find(
    {},
    { password: 0, verificationToken: 0, token: 0 }
  ).sort({ createdAt: -1 });

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

  const promo = await PromoCode.find({}).sort({ createdAt: -1 });
  

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

  // Раніше тут стояла заборона видаляти код, який уже є в user.promoCodes.
  // Вона робила промокод невидаляним НАЗАВЖДИ після першого ж використання:
  // з трьох кодів у базі два не можна було прибрати взагалі.
  //
  // user.promoCodes — це історія використаних кодів, потрібна рівно для
  // одного: не дати клієнту застосувати той самий код двічі (див.
  // getPromoCode в controllers/orders.js). Видалення коду цю історію не
  // ламає — назва просто лишається в списку, а знижку за нею все одно вже
  // ніхто не отримає, бо самого коду більше немає.
  const promoDelete = await PromoCode.findByIdAndDelete({_id: id});

  if (!promoDelete) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }

  res.status(200).json({ id, message: "Delete successful" })

}

const deleteProduct = async (req, res) => {
  console.log("deleteProduct")

   const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { id } = req.params;

  const product = await Product.findOneAndDelete({codeOfGood: id});

  if (!product) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }

  res.status(200).json({ id, message: "Delete successful" })

}

const deleteZbirka = async (req, res) => {
  console.log("deleteProduct")

   const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { id } = req.params;

  const product = await ProductZbirky.findOneAndDelete({codeOfGood: id});

  if (!product) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }

  res.status(200).json({ id, message: "Delete successful" })

}

const getFeedback = async (req, res) => {
  console.log("getFeedback")

   const { token } = req.user;
  
  const admin = await Admin.findOne({ token })
    
  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const feedback = await FeedBack.find({}).sort({ createdAt: -1 })
  
  const result = feedback.map(i => {
    return {
      _id: i._id,
      numberOfApplication: i.numberOfOrder,
      name: i.name,
      tel: i.tel,
      comment: i.comment,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      isViewed: i.isViewed
    }
  })

  if (!feedback) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }

  res.status(200).json({
         result  
  });
}

// Списання / повернення залишків.
//
// $inc, а не запис абсолютного значення. Стара версія рахувала
// `item.quantity ± quantityOrdered`, де `item.quantity` приходило З ТІЛА
// ЗАПИТУ — тобто залишок на момент, коли адмінка востаннє бачила товар.
// При підтвердженні це ще працювало (адмінка перед тим підтягує свіжі
// quantity), а от при скасуванні вона шле кошик як є, зі стоком на момент
// ОФОРМЛЕННЯ замовлення. На тесті це давало 13 замість 10: товар з'являвся
// з повітря. $inc змінює залишок відносно поточного значення в базі й не
// залежить від того, що надіслав клієнт.
const applyStockChange = async (cartItems, sign) => {
  if (!Array.isArray(cartItems)) {
    return;
  }

  for (const item of cartItems) {
    const ordered = Number(item.quantityOrdered);

    if (!Number.isFinite(ordered) || ordered <= 0) {
      continue;
    }

    const delta = { $inc: { quantity: sign * ordered } };
    const product = await Product.findOneAndUpdate({ _id: item._id }, delta, { new: true });

    if (!product) {
      await ProductZbirky.findOneAndUpdate({ _id: item._id }, delta, { new: true });
    }
  }
};

// Зміна замовлення з адмінки: статус, ТТН, ручна знижка, склад кошика.
//
// Статуси йдуть суворим конвеєром, і він РІЗНИЙ залежно від способу оплати
// (див. helpers/orderStatus.js). Валідація стоїть тут, а не лише в UI:
// адмінка на Netlify може відстати від бека на Render, а перестрибнутий
// статус зіпсує і залишки на складі, і звітність дашборду.
const updateOrderById = async (req, res) => {

  const { token } = req.user;

  const admin = await Admin.findOne({ token })

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  // Поточний стан потрібен ДО оновлення: за ним перевіряємо дозволеність
  // переходу і вирішуємо, чи вже списаний товар.
  const current = await Order.findOne({ _id: req.params.id });

  if (!current) {
    throw HttpError(404, 'Order not found');
  }

  const { status, cartItems, ttn } = req.body;

  if (status && status !== current.status
      && !isTransitionAllowed(current.status, status, current.payment)) {
    throw HttpError(409, `Перехід «${current.status}» → «${status}» не дозволений`);
  }

  // deliveredAt і stockDeducted проставляє ВИКЛЮЧНО сервер. Значення з тіла
  // прибираємо: адмінка шле назад увесь об'єкт замовлення, отриманий з GET, і
  // без цих рядків клієнт міг би перезаписати дату доставки або збити
  // прапорець списання, а разом з ним і залишки на складі.
  const updateFields = { ...req.body };
  delete updateFields.deliveredAt;
  delete updateFields.stockDeducted;

  // Передоплата перераховується, коли змінилась САМА СУМА замовлення.
  //
  // prepaymentAmount рахувався один раз — при створенні замовлення. Менеджер
  // же вносить ручну знижку вже в картці, і після неї передоплата лишалась від
  // старої суми: замовлення на 12 645 ₴ зі знижкою до 10 000 ₴ показувало
  // «передоплата 2 529 ₴ (20% від суми)», хоча 20% — це 2 000 ₴. Ця ж цифра
  // їхала клієнту в готовому тексті повідомлення.
  //
  // ⚠️ Перераховуємо ТІЛЬКИ при зміні `together` і тільки поки замовлення ще
  // не оплачене. Робити це на кожне збереження не можна: prepaymentAmount
  // навмисно заморожений (див. models/order.js), щоб пізніша зміна відсотка в
  // налаштуваннях не рухала суму в уже виставлених замовленнях. Тут сума
  // змінилась — тож і передоплата від неї має змінитись.
  const nextTogether = Number(updateFields.together);
  const togetherChanged =
    Number.isFinite(nextTogether) && nextTogether !== Number(current.together);
  const stillEditable =
    current.status === ORDER_STATUS.NEW ||
    current.status === ORDER_STATUS.AWAITING_PAYMENT;

  if (togetherChanged && stillEditable) {
    const shopSettings = await loadSettings();

    updateFields.prepaymentAmount = calculatePrepayment(
      current.payment,
      nextTogether,
      shopSettings.prepaymentPercent
    );
  } else {
    // Значення з тіла запиту не приймаємо взагалі: адмінка шле назад увесь
    // об'єкт замовлення, і зайвий шлях, яким клієнт міг би переписати суму
    // передоплати, тут не потрібен.
    delete updateFields.prepaymentAmount;
  }

  // ТТН обов'язковий саме на відправці: без номера цей статус не несе тієї
  // інформації, заради якої його вводили.
  if (status === ORDER_STATUS.SHIPPED && !ttn && !current.ttn) {
    throw HttpError(400, 'Для статусу «Відправлено» потрібен номер ТТН');
  }

  // Списання складу перенесене з «В роботі» на «Оплачено»: гроші отримані —
  // товар закріплений за клієнтом. Прапорець не дає списати двічі, якщо
  // картку збережуть ще раз уже в тому самому статусі.
  if (status === ORDER_STATUS.PAID && !current.stockDeducted) {
    await applyStockChange(cartItems, -1);
    updateFields.stockDeducted = true;
  }

  // Повернення на залишки — за ФАКТОМ списання, а не за статусом: скасувати
  // можуть і з «Оплачено», і з «Відправлено».
  if (status === ORDER_STATUS.CANCELLED && current.stockDeducted) {
    await applyStockChange(cartItems, 1);
    updateFields.stockDeducted = false;
  }

  // Пишеться один раз — при першому переході в "Доставлено". Повторні
  // збереження вже доставленого замовлення дату не зсувають, інакше середній
  // час обробки поплив би від будь-якого редагування.
  if (status === ORDER_STATUS.DELIVERED && !current.deliveredAt) {
    updateFields.deliveredAt = new Date();
  }

  const order = await Order.findOneAndUpdate({ _id: req.params.id }, updateFields, { new: true });

  if (!order) {
    throw HttpError(500, 'Internal server eror, write code in DB');
  }

  res.status(200).json({
    result: order
  });
};

// GET /api/adm/dashboard?period=month — усе для головної сторінки адмінки
// одним запитом. Кожен блок рахує MongoDB; сюди приїжджають готові числа та
// короткі списки, сирих замовлень у Node немає.
const getDashboard = async (req, res) => {
  const { token } = req.user;

  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { period = 'month', from, to, month } = req.query;
  const range = dashboard.resolvePeriod(period, from, to, month);

  if (!range) {
    throw HttpError(400, 'Invalid period range');
  }

  // Блоки незалежні один від одного — рахуємо паралельно, щоб дашборд
  // відкривався за один похід у базу по часу, а не за суму всіх агрегацій.
  const [
    totals,
    prevTotals,
    processing,
    prevProcessing,
    stuckOrders,
    unpaidOnline,
    lowStock,
    ordersInWork,
    wholesaleCustomers,
    newVsReturning,
    revenueByCategory,
    paymentMethods,
    revenueByDay,
  ] = await Promise.all([
    dashboard.aggregateTotals(Order, range.from, range.to),
    dashboard.aggregateTotals(Order, range.previous.from, range.previous.to),
    dashboard.aggregateProcessingTime(Order, range.from, range.to),
    dashboard.aggregateProcessingTime(Order, range.previous.from, range.previous.to),
    dashboard.aggregateStuckOrders(Order),
    dashboard.aggregateUnpaidOnline(Order),
    dashboard.aggregateLowStock(Product, ProductZbirky),
    dashboard.aggregateOrdersInWork(Order),
    dashboard.aggregateWholesaleCustomers(Order, range.from, range.to),
    dashboard.aggregateNewVsReturning(Order, range.from, range.to),
    dashboard.aggregateRevenueByCategory(Order, range.from, range.to),
    dashboard.aggregatePaymentMethods(Order, range.from, range.to),
    dashboard.aggregateRevenueByDay(Order, range.from, range.to),
  ]);

  // Оптовість — статус клієнта, а не властивість періоду, тож один і той
  // самий список годує і бейдж «опт» у топі, і секцію зниклих.
  const wholesaleKeys = new Set(wholesaleCustomers.map(customer => customer._id));
  const inactiveCustomers = dashboard.selectInactiveWholesale(wholesaleCustomers);

  const topCustomers = await dashboard.aggregateTopCustomers(
    Order,
    range.from,
    range.to,
    wholesaleKeys
  );

  res.status(200).json({
    result: {
      period: {
        type: period,
        from: range.from,
        to: range.to,
        previousFrom: range.previous.from,
        previousTo: range.previous.to,
      },
      pulse: {
        revenue: {
          value: totals.revenue,
          change: dashboard.percentChange(totals.revenue, prevTotals.revenue),
        },
        ordersCount: {
          value: totals.ordersCount,
          change: dashboard.percentChange(totals.ordersCount, prevTotals.ordersCount),
        },
        avgCheck: {
          value: totals.avgCheck,
          change: dashboard.percentChange(totals.avgCheck, prevTotals.avgCheck),
        },
        // hours === null означає "даних ще нема" (жодного замовлення з
        // deliveredAt у періоді), а не нуль годин.
        avgProcessingTime: {
          value: processing.hours,
          count: processing.count,
          change: dashboard.percentChange(processing.hours, prevProcessing.hours),
        },
      },
      alerts: {
        unpaidOnline,
        stuckOrders,
        lowStock,
      },
      ordersInWork,
      topCustomers,
      inactiveCustomers,
      revenueByCategory,
      paymentMethods,
      customersNewVsReturning: newVsReturning,
      revenueByDay,
    },
  });
};





// Готовий текст повідомлення для клієнта: шаблон із налаштувань + підставлені
// дані замовлення.
//
// Окремий endpoint, а не поле у відповіді на зміну статусу: той самий текст
// потрібно показати ще й повторно, кнопкою в картці замовлення, без жодної
// зміни статусу. Один маршрут обслуговує обидва випадки.
//
// Статус приходить ПАРАМЕТРОМ, а не читається з бази: адмінка запитує текст
// одразу після збереження нового статусу, і покладатись на те, що запис уже
// видно наступному читанню, — це гонка.
const getOrderMessage = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const order = await Order.findOne({ numberOfOrder: req.params.numberOfOrder });

  if (!order) {
    throw HttpError(404, 'Order not found');
  }

  const status = req.query.status || order.status;
  const templateKey = getTemplateKey(order.payment, status);

  // Для «Нове» шаблону не існує — це не помилка, а нормальний стан: щойно
  // створеному замовленню клієнту ще нічого повідомляти.
  if (!templateKey) {
    return res.status(200).json({ result: { message: null, status, templateKey: null } });
  }

  const settings = toPlainSettings(await loadSettings());
  const template = settings.messageTemplates[templateKey];

  if (!template) {
    return res.status(200).json({ result: { message: null, status, templateKey } });
  }

  const message = renderTemplate(template, order, settings);

  res.status(200).json({
    result: { message: message || null, status, templateKey },
  });
};

// Налаштування магазину. Документ один на всю базу; якщо його ще немає —
// хелпер створює з дефолтами, тож розділ ніколи не відкривається порожнім.
const getShopSettings = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const settings = await loadSettings();

  res.status(200).json({ result: toPlainSettings(settings) });
};

const updateShopSettings = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const settings = await loadSettings();
  const { prepaymentPercent, requisites, messageTemplates, npSender, npDefaults } =
    req.body;

  if (prepaymentPercent !== undefined) {
    const percent = Number(prepaymentPercent);

    // Відсоток бере участь у розрахунку грошей, тож перевіряємо тут, а не
    // покладаємось на UI: адмінка на Netlify може відстати від бека.
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw HttpError(400, 'prepaymentPercent має бути числом від 0 до 100');
    }

    settings.prepaymentPercent = percent;
  }

  if (requisites !== undefined) {
    if (typeof requisites !== 'string') {
      throw HttpError(400, 'requisites має бути рядком');
    }

    settings.requisites = requisites;
  }

  if (messageTemplates !== undefined) {
    if (typeof messageTemplates !== 'object' || messageTemplates === null) {
      throw HttpError(400, 'messageTemplates має бути обʼєктом');
    }

    // Записуємо ЛИШЕ відомі ключі: інакше будь-яка помилка в адмінці засмічує
    // документ полями, які ніхто ніколи не прочитає.
    const allowed = new Set(getAllTemplateKeys());

    Object.entries(messageTemplates).forEach(([key, value]) => {
      if (allowed.has(key) && typeof value === 'string') {
        settings.messageTemplates.set(key, value);
      }
    });
  }

  if (npSender !== undefined) {
    if (typeof npSender !== 'object' || npSender === null) {
      throw HttpError(400, 'npSender має бути обʼєктом');
    }

    // Білий список: усе інше з тіла ігнорується. Адмінка шле назад увесь
    // об'єкт налаштувань, і без цього в документ потрапляли б випадкові поля.
    const SENDER_KEYS = [
      'counterpartyRef',
      'counterpartyName',
      'contactRef',
      'contactName',
      'phone',
      'cityRef',
      'cityName',
      'warehouseRef',
      'warehouseName',
    ];

    SENDER_KEYS.forEach(key => {
      if (npSender[key] !== undefined) {
        if (typeof npSender[key] !== 'string') {
          throw HttpError(400, `npSender.${key} має бути рядком`);
        }

        settings.npSender[key] = npSender[key].trim();
      }
    });
  }

  if (npDefaults !== undefined) {
    if (typeof npDefaults !== 'object' || npDefaults === null) {
      throw HttpError(400, 'npDefaults має бути обʼєктом');
    }

    // Вага й обʼєм їдуть у Пошту як є, тож нуль або відʼємне число там
    // перетворилось би на її ж малозрозумілу відмову.
    ['weight', 'volumeGeneral'].forEach(key => {
      if (npDefaults[key] !== undefined) {
        const value = Number(npDefaults[key]);

        if (!Number.isFinite(value) || value <= 0) {
          throw HttpError(400, `npDefaults.${key} має бути додатним числом`);
        }

        settings.npDefaults[key] = value;
      }
    });

    if (npDefaults.description !== undefined) {
      if (typeof npDefaults.description !== 'string') {
        throw HttpError(400, 'npDefaults.description має бути рядком');
      }

      settings.npDefaults.description = npDefaults.description.trim();
    }
  }

  await settings.save();

  res.status(200).json({ result: toPlainSettings(settings) });
};

// Довідник відправників для налаштувань адмінки.
//
// Contragent і контактна особа — єдине в усій інтеграції, чого НЕ можна
// вивести з назви: це внутрішні ідентифікатори кабінету Нової Пошти. Тому їх
// не вводять руками, а вибирають зі списку, який Пошта віддає за нашим же
// ключем — переплутати 36 символів тоді просто ніде.
const getNovaPoshtaSenders = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  try {
    const counterparties = await npPost('Counterparty', 'getCounterparties', {
      CounterpartyProperty: 'Sender',
      Page: '1',
    });

    // Контакти запитуються на кожного контрагента окремо — свого «дай усе
    // одразу» метода Пошта не має. Відправників у кабінету одиниці, тож
    // послідовні виклики тут дешевші за складність.
    const result = [];

    for (const party of counterparties) {
      const contacts = await npPost('ContactPerson', 'getCounterpartyContactPersons', {
        Ref: party.Ref,
        Page: '1',
      });

      result.push({
        ref: party.Ref,
        name: party.Description,
        contacts: contacts.map(person => ({
          ref: person.Ref,
          name: person.Description,
          phone: person.Phones || '',
        })),
      });
    }

    res.status(200).json({ result });
  } catch (error) {
    if (error instanceof NovaPoshtaError) {
      throw HttpError(502, `Нова Пошта: ${error.message}`);
    }

    console.error('[getNovaPoshtaSenders] помилка:', error.message);
    throw HttpError(502, 'Не вдалося звʼязатися з Новою Поштою');
  }
};


// Лічильники непереглянутого: скільки замовлень, заявок на 3D-друк і заявок
// зі форми зв'язку менеджер ще не відкривав.
//
// Умова — { $ne: true }, а не { isViewed: false }. У MongoDB запис, де поля
// взагалі НЕМАЄ, під `false` не підпадає: старі записи (до появи поля) тихо
// випали б із підрахунку, а в списках адмінки при цьому світились би як нові —
// цифра й екран розійшлись би. `$ne: true` означає буквально «ще не
// переглянуто» і працює однаково до й після разового скрипта.
const UNVIEWED = { isViewed: { $ne: true } };

const getCounters = async (req, res) => {
  const { token } = req.user;

  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const [orders, print3d, feedback] = await Promise.all([
    Order.countDocuments(UNVIEWED),
    Print3dOrder.countDocuments(UNVIEWED),
    FeedBack.countDocuments(UNVIEWED),
  ]);

  res.status(200).json({
    result: { orders, print3d, feedback },
  });
};

// Позначити переглянутим. Три ручки замість side-effect у GET-контролерах:
// читання не має мовчки писати в базу — інакше будь-який перезапит списку чи
// відкриття картки з іншою метою (лист, перевірка ТТН) знімало б позначку
// «нове», і менеджер втрачав би записи, яких насправді не бачив.
//
// Повертаємо alreadyViewed — стан ДО запису. Клієнт зменшує лічильник на
// одиницю локально, не перезапитуючи /counters, і без цієї відповіді повторний
// виклик по тому самому запису відняв би ще одиницю: у базі нічого не змінилось
// би, а цифра в шапці поїхала. А повторний виклик — не рідкість: подвійний
// клік, дві вкладки, StrictMode у дев-режимі React.
//
// Саме тому findOneAndUpdate БЕЗ { new: true } — так драйвер віддає документ
// у стані до оновлення.
const markViewed = (Model, buildFilter) => async (req, res) => {
  const { token } = req.user;

  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const previous = await Model.findOneAndUpdate(
    buildFilter(req.params),
    { $set: { isViewed: true } }
  );

  if (!previous) {
    throw HttpError(404, 'Not found');
  }

  res.status(200).json({
    result: {
      _id: previous._id,
      isViewed: true,
      alreadyViewed: Boolean(previous.isViewed),
    },
  });
};

// Замовлення адресуються номером — саме він у маршруті адмінки
// (/admin/orders/:orderId) і в get-order/:id.
const markOrderViewed = markViewed(Order, params => ({
  numberOfOrder: params.numberOfOrder,
}));

const markPrint3dViewed = markViewed(Print3dOrder, params => ({
  _id: params.id,
}));

const markFeedbackViewed = markViewed(FeedBack, params => ({
  _id: params.id,
}));


// Зберегти новий порядок товарів у межах одного списку.
//
// Приймає ВЕСЬ список області, а не пару «що куди перемістили»: після
// перетягування адмінка вже знає підсумковий порядок, і надіслати його цілком
// дешевше й надійніше, ніж відтворювати перестановку на сервері. Ідемпотентно:
// повторний той самий запит перезапише ті самі числа.
const reorderProducts = async (req, res) => {
  const { token } = req.user;

  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { scope, orderedIds } = req.body;
  const target = PRODUCT_SCOPES[scope];

  if (!target) {
    throw HttpError(400, `Невідомий список товарів: ${scope}`);
  }

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw HttpError(400, 'orderedIds має бути непорожнім масивом');
  }

  const { model, filter } = target;

  // Перевіряємо, що всі id справді з цього списку. Без перевірки помилка в UI
  // (напр. неочищений стан при переході між категоріями) тихо проставила б
  // чужим товарам порядок сусідньої категорії.
  const existing = await model.find(filter, { _id: 1 }).lean();
  const allowed = new Set(existing.map(item => String(item._id)));
  const unknown = orderedIds.filter(id => !allowed.has(String(id)));

  if (unknown.length > 0) {
    throw HttpError(400, `Товари не належать списку «${scope}»: ${unknown.join(', ')}`);
  }

  await model.bulkWrite(
    orderedIds.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order: index } } },
    }))
  );

  res.status(200).json({
    result: { scope, updated: orderedIds.length },
  });
};

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
  editProductZbirky: ctrlWrapper(editProductZbirky),
  deleteProduct: ctrlWrapper(deleteProduct),
  deleteZbirka: ctrlWrapper(deleteZbirka),
  getFeedback: ctrlWrapper(getFeedback),
  updateOrderById: ctrlWrapper(updateOrderById),
  getDashboard: ctrlWrapper(getDashboard),
  getOrderMessage: ctrlWrapper(getOrderMessage),
  getShopSettings: ctrlWrapper(getShopSettings),
  updateShopSettings: ctrlWrapper(updateShopSettings),
  getNovaPoshtaSenders: ctrlWrapper(getNovaPoshtaSenders),
  getCounters: ctrlWrapper(getCounters),
  markOrderViewed: ctrlWrapper(markOrderViewed),
  markPrint3dViewed: ctrlWrapper(markPrint3dViewed),
  markFeedbackViewed: ctrlWrapper(markFeedbackViewed),
  reorderProducts: ctrlWrapper(reorderProducts),


















};
