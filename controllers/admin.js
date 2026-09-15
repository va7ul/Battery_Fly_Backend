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
  getMissingSenderFields,
  CASH_ON_DELIVERY,
} = require('../helpers');
const { npPost, NovaPoshtaError } = require('../helpers/novaposhta');
const {
  resolveCityRef,
  resolveWarehouse,
  ensureRecipient,
  redeliverySum,
  buildTtnPayload,
  explainRedeliveryRefusal,
} = require('../helpers/ttn');
const { Contact } = require('../models/contact');
const { normalizePhone } = require('../helpers/phone');
const {
  addActivity,
  addJournalEntry,
  logAuto,
  logJournal,
  АВТО,
} = require('../helpers/activities');
const { Activity } = require('../models/activity');
const { OrderJournal } = require('../models/orderJournal');
const {
  FUNNEL_STAGES,
  FUNNEL_CANDIDATES,
  isInFunnel,
  isSleeping,
  днівВід,
} = require('../helpers/funnel');
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

  // Фактично внесена сума — ЄДИНИЙ випадок, коли передоплату диктує тіло
  // запиту.
  //
  // До цього моменту prepaymentAmount був прогнозом: відсоток від суми. У
  // момент підтвердження оплати він перестає бути прогнозом — клієнт міг
  // внести не ту суму, яку йому виставили (переказав рівну тисячу замість
  // 2 529 ₴), і далі все рахується від ФАКТУ: і решта накладеним у картці, і
  // {codAmount} у тексті для клієнта, і сума накладеного платежу в ТТН.
  //
  // ⚠️ Двері вузькі навмисно: лише накладений платіж, лише перехід в
  // «Оплачено» і лише з іншого статусу. Приймати це поле будь-коли не можна —
  // адмінка шле назад увесь об'єкт замовлення, і кожне збереження переписувало б
  // передоплату тим, що випадково лежало в сторі.
  const paidAmount = Number(updateFields.prepaymentAmount);
  const acceptsPaidAmount =
    current.payment === CASH_ON_DELIVERY &&
    status === ORDER_STATUS.PAID &&
    current.status !== ORDER_STATUS.PAID &&
    Number.isFinite(paidAmount) &&
    paidAmount >= 0;

  if (acceptsPaidAmount) {
    updateFields.prepaymentAmount = Math.round(paidAmount);
  } else if (togetherChanged && stillEditable) {
    const shopSettings = await loadSettings();

    updateFields.prepaymentAmount = calculatePrepayment(
      current.payment,
      nextTogether,
      shopSettings.prepaymentPercent
    );
  } else {
    // Поза цими двома випадками значення з тіла запиту не приймаємо взагалі:
    // зайвий шлях, яким клієнт міг би переписати суму передоплати, тут не
    // потрібен.
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
      'cityName',
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
    ['weight', 'width', 'length', 'height'].forEach(key => {
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

// ─── Клієнти CRM ────────────────────────────────────────────────────────────
//
// ⚠️ Це НЕ те саме, що getUsers нижче. Той віддає акаунти на сайті (`User`) —
// їх мають лише зареєстровані. Contact охоплює всіх, хто замовляв, і доданих
// руками. В адмінці вони живуть двома вкладками одного розділу.

// Скільки замовлень і на яку суму — щоб у списку було видно цінність клієнта.
//
// ⚠️ Шукаємо і за contactId, І за телефоном. Замовлення до появи CRM
// contactId не мають, і без другої умови картка клієнта показувала б порожню
// історію в того, хто замовляв роками.
async function loadContactOrders(contact) {
  const digits = contact.phones.map(phone => phone.digits).filter(Boolean);
  const умови = [{ contactId: contact._id }];

  if (digits.length > 0) {
    // Телефон у замовленні зберігається як введений, тож нормалізуємо на льоту
    // регуляркою по цифрах — індексу тут немає, але й замовлень на клієнта
    // одиниці.
    умови.push({ tel: { $in: digits.flatMap(вибірДляТелефону) } });
  }

  return Order.find({ $or: умови }).sort({ createdAt: -1 });
}

// Варіанти написання того самого номера, які трапляються в замовленнях.
function вибірДляТелефону(digits) {
  const без380 = digits.replace(/^380/, '');

  return [
    digits,
    `+${digits}`,
    `0${без380}`,
    new RegExp(`${без380}$`),
  ];
}

// Замовлення ВСІХ клієнтів воронки — одним запитом замість запиту на клієнта.
//
// getContacts дозволяє собі N запитів свідомо: там сторінка на 50. Дошка ж
// показує воронку цілком і не гортається — сотня оптовиків перетворилась би на
// сотню запитів при кожному відкритті вкладки.
async function loadOrdersTotals(contacts) {
  const заТелефоном = new Map();
  const варіантиТелефонів = [];
  const ids = contacts.map(contact => contact._id);
  const наші = new Set(ids.map(String));

  contacts.forEach(contact => {
    contact.phones.forEach(phone => {
      if (!phone.digits) {
        return;
      }

      заТелефоном.set(phone.digits, String(contact._id));
      варіантиТелефонів.push(...вибірДляТелефону(phone.digits));
    });
  });

  const orders = await Order.find({
    $or: [
      { contactId: { $in: ids } },
      ...(варіантиТелефонів.length > 0
        ? [{ tel: { $in: варіантиТелефонів } }]
        : []),
    ],
  }).select('contactId tel together createdAt');

  const підсумки = new Map();

  orders.forEach(order => {
    // ⚠️ Спершу пряма прив'язка, і лише потім телефон. Замовлення, що підходить
    // під обидві умови, інакше порахувалося б двічі. А прив'язка може вести й
    // до клієнта ПОЗА воронкою (спільний номер) — тоді падаємо назад на телефон.
    const прямо = order.contactId ? String(order.contactId) : null;
    const id =
      прямо && наші.has(прямо)
        ? прямо
        : заТелефоном.get(normalizePhone(order.tel));

    if (!id || !наші.has(id)) {
      return;
    }

    const поточне = підсумки.get(id) || {
      ordersCount: 0,
      ordersTotal: 0,
      lastOrderAt: null,
    };

    поточне.ordersCount += 1;
    поточне.ordersTotal += Number(order.together) || 0;

    // Дата найсвіжішого замовлення — за нею рахується «замовк» для Реанімації.
    if (!поточне.lastOrderAt || order.createdAt > поточне.lastOrderAt) {
      поточне.lastOrderAt = order.createdAt;
    }

    підсумки.set(id, поточне);
  });

  return підсумки;
}

// Порожні підсумки. Клієнт без жодного замовлення в мапі відсутній, і кожне
// місце інакше писало б свій власний `|| { ordersCount: 0, ... }`.
const БЕЗ_ЗАМОВЛЕНЬ = { ordersCount: 0, ordersTotal: 0, lastOrderAt: null };

// Підсумки одного клієнта — там, де дошка не потрібна (картка, зміна стадії).
async function загальнеПоЗамовленнях(contact) {
  const orders = await loadContactOrders(contact);

  return {
    ordersCount: orders.length,
    ordersTotal: orders.reduce((sum, order) => sum + (Number(order.together) || 0), 0),
    // loadContactOrders сортує від найновішого.
    lastOrderAt: orders.length > 0 ? orders[0].createdAt : null,
  };
}

const getContacts = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { search = '', type, kind, page = 1, limit = 50 } = req.query;

  // ⚠️ Фільтр БЕЗ типу. Саме з нього рахуються лічильники вкладок: питання на
  // них — «скільки з САЙТУ серед того, що я зараз шукаю», і домішувати туди
  // вибрану вкладку не можна. Тип додається лише до вибірки списку нижче.
  const filter = {};

  if (kind) filter.kind = kind;

  const query = String(search).trim();

  if (query) {
    // Пошук за номером має працювати в БУДЬ-ЯКОМУ написанні, тому цифри
    // шукаємо окремо від тексту.
    const digits = normalizePhone(query);
    const текст = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    filter.$or = [
      { name: текст },
      { company: текст },
      { email: текст },
      ...(digits ? [{ 'phones.digits': digits }] : []),
    ];
  }

  const перPage = Math.min(Number(limit) || 50, 200);
  const пропустити = (Math.max(Number(page) || 1, 1) - 1) * перPage;

  const списковий = type ? { ...filter, type } : filter;

  // ⚠️ Лічильники рахує БАЗА, а не адмінка по отриманій сторінці. Рахунок по
  // сторінці був подвійно неправдивий: по-перше, він мінявся від вибраної
  // вкладки (на «Із сайту» вкладка «Додані вручну» показувала 0, бо в вибірці
  // ручних не було); по-друге, сторінка — це щонайбільше 50 записів, тож на
  // більшій базі цифри були б стелею, а не кількістю.
  const [contacts, total, all, site, manual] = await Promise.all([
    Contact.find(списковий).sort({ updatedAt: -1 }).skip(пропустити).limit(перPage),
    Contact.countDocuments(списковий),
    Contact.countDocuments(filter),
    Contact.countDocuments({ ...filter, type: 'site' }),
    Contact.countDocuments({ ...filter, type: 'manual' }),
  ]);

  // Підсумки по замовленнях — по одному запиту на клієнта сторінки. Сторінка
  // невелика, а зводити це в агрегацію довелось би через два різні способи
  // зв'язку (contactId і телефон), що читалось би гірше за користь.
  const result = await Promise.all(
    contacts.map(async contact => {
      const orders = await loadContactOrders(contact);

      return {
        ...contact.toObject(),
        primaryPhone: contact.primaryPhone(),
        ordersCount: orders.length,
        ordersTotal: orders.reduce((sum, order) => sum + (Number(order.together) || 0), 0),
      };
    })
  );

  res.status(200).json({ result, total, counts: { all, site, manual } });
};

const getContactById = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    throw HttpError(404, 'Клієнта не знайдено');
  }

  const orders = await loadContactOrders(contact);

  res.status(200).json({
    result: {
      ...contact.toObject(),
      primaryPhone: contact.primaryPhone(),
      orders: orders.map(order => ({
        _id: order._id,
        numberOfOrder: order.numberOfOrder,
        createdAt: order.createdAt,
        status: order.status,
        payment: order.payment,
        together: order.together,
        // Прив'язане явно чи знайдене за телефоном — менеджеру варто бачити
        // різницю: друге можна закріпити ручною прив'язкою.
        linked: String(order.contactId || '') === String(contact._id),
      })),
      ordersCount: orders.length,
      ordersTotal: orders.reduce((sum, order) => sum + (Number(order.together) || 0), 0),
      // ⚠️ Рахує БЕК, а не адмінка. Участь у воронці залежить від дат замовлень
      // (сплячий оптовик), і другий розрахунок у браузері розійшовся б із
      // дошкою: клієнт був би на ній, а картка не показувала б стадію.
      inFunnel: isInFunnel(contact, {
        ordersCount: orders.length,
        lastOrderAt: orders.length > 0 ? orders[0].createdAt : null,
      }),
    },
  });
};

// Поля, які адмінка має право записати. Усе інше з тіла ігнорується: форма
// шле назад увесь об'єкт, і без білого списку в документ потрапляло б сміття.
function pickContactFields(body) {
  const fields = {};

  ['name', 'email', 'company', 'note', 'type', 'kind'].forEach(key => {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'string') {
        throw HttpError(400, `${key} має бути рядком`);
      }

      fields[key] = body[key].trim();
    }
  });

  if (fields.type && !['site', 'manual'].includes(fields.type)) {
    throw HttpError(400, 'type має бути site або manual');
  }

  if (fields.kind && !['retail', 'wholesale'].includes(fields.kind)) {
    throw HttpError(400, 'kind має бути retail або wholesale');
  }

  if (body.phones !== undefined) {
    if (!Array.isArray(body.phones)) {
      throw HttpError(400, 'phones має бути масивом');
    }

    fields.phones = body.phones
      .map(phone => ({
        number: String(phone && phone.number ? phone.number : '').trim(),
        isPrimary: Boolean(phone && phone.isPrimary),
      }))
      .filter(phone => phone.number);
  }

  return fields;
}

const createContact = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const fields = pickContactFields(req.body);

  if (!fields.name) {
    throw HttpError(400, 'Вкажіть імʼя клієнта');
  }

  // Створений руками — за замовчуванням саме такий тип, якщо не сказано інше.
  const contact = await Contact.create({ type: 'manual', ...fields });

  // ⚠️ Стартову стадію більше не рахуємо. Раніше клієнт із наявними покупками
  // одразу ставав «Співпрацюємо»; тепер такий у воронку просто НЕ потрапляє —
  // вона лише для тих, хто ще нічого не купив. Усі, хто на дошку заходить,
  // заходять у «Новий лід» — це значення поля за замовчуванням.
  const totals = await загальнеПоЗамовленнях(contact);

  res
    .status(201)
    .json({ result: { ...contact.toObject(), inFunnel: isInFunnel(contact, totals) } });
};

const updateContact = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    throw HttpError(404, 'Клієнта не знайдено');
  }

  Object.assign(contact, pickContactFields(req.body));

  // ⚠️ Стадію при зміні типу/виду більше не чіпаємо. Раніше клієнт, якого
  // позначали оптовиком, отримував стартову стадію за наявністю покупок; тепер
  // покупки просто тримають його поза воронкою, і рахувати нічого.
  //
  // save(), а не findByIdAndUpdate: нормалізація телефонів живе в pre-validate
  // моделі, і оновлення повз документ її оминуло б.
  await contact.save();

  res.status(200).json({ result: contact });
};

const deleteContact = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    throw HttpError(404, 'Клієнта не знайдено');
  }

  // ⚠️ Замовлення НЕ видаляємо — лише відв'язуємо. Видалення картки клієнта не
  // має знищувати історію продажів.
  await Order.updateMany({ contactId: contact._id }, { $set: { contactId: null } });
  await contact.deleteOne();

  res.status(200).json({ result: { _id: contact._id } });
};

// Початок сьогоднішнього дня. Нагадування порівнюються з «<= зараз», тож час у
// даті лише заважав би: виставлене о 14:00 «на сьогодні» до обіду не спрацювало б.
const початокДня = () => {
  const дата = new Date();

  дата.setHours(0, 0, 0, 0);

  return дата;
};

// Вхід оптовика в Реанімацію — рівно один раз за епізод мовчання.
//
// ⚠️ Це ЗАПИС під час читання дошки, і зроблено так свідомо. «Замовк» — не
// подія, а її відсутність: жоден виклик у системі не настає в момент, коли
// клієнт перестав замовляти, тож зафіксувати це можна лише тоді, коли хтось
// дивиться. Cron у проєкті немає.
//
// ⚠️ `reactivationSince` — сторож одноразовості, а не ознака належності до
// колонки (та рахується на льоту). Без нього кожне відкриття дошки
// перезаписувало б `nextContactDate` на сьогодні й затирало дату, яку менеджер
// виставив руками.
async function позначитиРеанімацію(contact, днів) {
  if (contact.reactivationSince) {
    return;
  }

  contact.reactivationSince = new Date();

  // Дату менеджера не чіпаємо: якщо він уже домовився передзвонити в п'ятницю,
  // «сьогодні» з автомата зіпсувало б домовленість.
  if (!contact.nextContactDate) {
    contact.nextContactDate = початокДня();
  }

  await contact.save();
  await logAuto(contact._id, АВТО.reactivation(днів));
}

// Вихід із Реанімації: клієнт або знову замовив, або мовчить понад 60 днів.
//
// ⚠️ Нагадування знімаємо разом із позначкою. Воно належало саме цьому епізоду
// мовчання: людина купила — дзвонити «ви давно не замовляли» вже безглуздо, а
// висіти в блоці «сьогодні звʼязатися» воно буде доти, доки хтось не прибере.
async function зняти3Реанімації(contact) {
  if (!contact.reactivationSince) {
    return;
  }

  contact.reactivationSince = null;
  contact.nextContactDate = null;

  await contact.save();
}

// Дошка воронки: потенційні клієнти + сплячі оптовики, згруповані за стадією.
//
// ⚠️ Воронка — про шлях ДО першої покупки. Хто купив, з дошки виходить і живе у
// списку клієнтів; інакше дошка з часом перетворилась би на другий, гірший
// список усієї бази. Єдиний виняток — оптовик, який замовк: він повертається
// окремим входом «Реанімація».
//
// Повертаємо ВСІ стадії, зокрема порожні: колонка без клієнтів — теж
// інформація («пропозицій ніхто не чекає»), а дошка, у якої колонки то
// з'являються, то зникають, читається як зламана.
const getFunnel = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const кандидати = await Contact.find(FUNNEL_CANDIDATES).sort({ updatedAt: -1 });
  const підсумки = await loadOrdersTotals(кандидати);

  const board = Object.fromEntries(FUNNEL_STAGES.map(stage => [stage, []]));

  for (const contact of кандидати) {
    const totals = підсумки.get(String(contact._id)) || БЕЗ_ЗАМОВЛЕНЬ;
    const спить = isSleeping(contact, totals.lastOrderAt);

    // Епізод мовчання скінчився — прибираємо позначку, навіть якщо клієнт
    // взагалі виходить із воронки: інакше при наступному засинанні він уже
    // вважався б позначеним і не отримав би нагадування.
    if (!спить && contact.reactivationSince) {
      await зняти3Реанімації(contact);
    }

    if (!isInFunnel(contact, totals)) {
      continue;
    }

    // ⚠️ Сплячий іде в «Реанімацію» НЕЗАЛЕЖНО від збереженої стадії. Стадія в
    // нього лишилась із часів, коли він був лідом, і показувати оптовика з
    // трьома покупками в «Новий лід» означало б брехати про те, де він у
    // стосунках із магазином.
    const stage = спить
      ? 'reactivation'
      : FUNNEL_STAGES.includes(contact.funnelStage)
      ? contact.funnelStage
      : FUNNEL_STAGES[0];

    if (спить) {
      await позначитиРеанімацію(contact, днівВід(totals.lastOrderAt));
    }

    board[stage].push({
      _id: contact._id,
      name: contact.name,
      company: contact.company,
      type: contact.type,
      kind: contact.kind,
      funnelStage: stage,
      primaryPhone: contact.primaryPhone(),
      nextContactDate: contact.nextContactDate,
      lostReason: contact.lostReason,
      // Скільки днів мовчить — головне число картки в «Реанімації».
      silentDays: спить ? днівВід(totals.lastOrderAt) : null,
      ...totals,
    });
  }

  res.status(200).json({ result: board, reminders: await зібратиНагадування() });
};

// Кого час набрати: дата настала або вже минула.
//
// ⚠️ Їде разом із дошкою, а не окремим запитом. Блок нагадувань живе вгорі тієї
// самої сторінки, і другий круговий запит заради списку з трьох рядків дав би
// видиме мигтіння там, де все могло приїхати одразу.
//
// ⚠️ Беремо ВСІХ, у кого настала дата, — навіть тих, кого на дошці немає. Клієнт
// міг купити й вийти з воронки, поки домовленість передзвонити лишалась; забути
// про неї через те, що картка зникла, — саме те, чого нагадування й мають не
// допустити.
async function зібратиНагадування() {
  const clients = await Contact.find({
    nextContactDate: { $ne: null, $lte: new Date() },
  })
    .sort({ nextContactDate: 1 })
    .limit(50);

  return clients.map(contact => ({
    _id: contact._id,
    name: contact.name,
    company: contact.company,
    primaryPhone: contact.primaryPhone(),
    nextContactDate: contact.nextContactDate,
    // Звідки взялось нагадування — щоб менеджер знав, з чим дзвонить.
    reason: contact.reactivationSince
      ? 'reactivation'
      : contact.funnelStage === 'lost'
      ? 'lost'
      : 'manual',
    lostReason: contact.lostReason,
  }));
}

// Зміна стадії — і з дошки, і з картки клієнта.
const setContactStage = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { funnelStage, nextContactDate, lostReason } = req.body;

  if (!FUNNEL_STAGES.includes(funnelStage)) {
    throw HttpError(400, 'Невідома стадія воронки');
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    throw HttpError(404, 'Клієнта не знайдено');
  }

  // ⚠️ Стадію отримують лише учасники воронки. Інакше клієнт, який давно купує,
  // тихо отримав би стадію, якої ніде не видно, — і ніхто б не зрозумів,
  // звідки вона взялась, якби він колись повернувся на дошку.
  const totals = await загальнеПоЗамовленнях(contact);

  if (!isInFunnel(contact, totals)) {
    throw HttpError(
      400,
      'У воронці лише потенційні клієнти (ще без замовлень) і сплячі оптовики'
    );
  }

  const попередня = contact.funnelStage;

  contact.funnelStage = funnelStage;

  // ⚠️ Причина відмови й дата повернення живуть РІВНО поки клієнт у «Відмові».
  // Повернули в роботу — обидва поля чистяться: «відмовив, бо дорого» біля
  // клієнта, з яким знову ведуть перемовини, дезінформує, а нагадування
  // передзвонити стосувалось саме тієї відмови.
  if (funnelStage === 'lost') {
    contact.lostReason =
      typeof lostReason === 'string' && lostReason.trim()
        ? lostReason.trim()
        : null;

    if (nextContactDate) {
      const дата = new Date(nextContactDate);

      if (Number.isNaN(дата.getTime())) {
        throw HttpError(400, 'Некоректна дата повторного контакту');
      }

      contact.nextContactDate = дата;
    } else {
      contact.nextContactDate = null;
    }
  } else {
    contact.lostReason = null;
    contact.nextContactDate = null;
  }

  await contact.save();

  if (попередня !== funnelStage) {
    await logAuto(contact._id, АВТО.stage(попередня, funnelStage));
  }

  res.status(200).json({ result: contact });
};

// Журнал замовлення — від найсвіжішого.
//
// ⚠️ Шукається за НОМЕРОМ замовлення (100504), як усі інші ручки замовлень в
// адмінці, а зберігається за _id. Номер — те, чим замовлення називають люди;
// _id — те, чим його називає база, і плутати їх у роутах уже одного разу
// коштувало помилок (див. коментар до put-order).
const getOrderJournal = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const order = await Order.findOne({ numberOfOrder: req.params.numberOfOrder });

  if (!order) {
    throw HttpError(404, 'Замовлення не знайдено');
  }

  const entries = await OrderJournal.find({ orderId: order._id })
    .sort({ date: -1, createdAt: -1 })
    .limit(200);

  res.status(200).json({ result: entries });
};

// Ручна нотатка менеджера.
//
// ⚠️ Тип фіксований — 'note'. Приймати його з тіла не можна: 'status' і 'ttn'
// означають «це записала система», і позначка варта чогось лише доти, доки її
// не може поставити будь-хто.
const createOrderJournalNote = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';

  if (!text) {
    throw HttpError(400, 'Порожню нотатку не зберігаємо');
  }

  const order = await Order.findOne({ numberOfOrder: req.params.numberOfOrder });

  if (!order) {
    throw HttpError(404, 'Замовлення не знайдено');
  }

  const entry = await addJournalEntry({
    orderId: order._id,
    type: 'note',
    text,
    createdBy: admin.login,
  });

  res.status(201).json({ result: entry });
};

// Хронологія клієнта — від найсвіжішого.
const getContactActivities = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const activities = await Activity.find({ contactId: req.params.id })
    .sort({ date: -1, createdAt: -1 })
    .limit(200);

  res.status(200).json({ result: activities });
};

const ТИПИ_АКТИВНОСТІ = ['call', 'meeting', 'message', 'note'];

// Ручний запис у хронологію.
//
// ⚠️ 'system' через цю ручку не приймаємо: позначка «записала система» має
// щось означати, а якщо її може поставити будь-хто, вона не означає нічого.
const createContactActivity = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { type, text, date, nextContactDate } = req.body;

  if (!ТИПИ_АКТИВНОСТІ.includes(type)) {
    throw HttpError(400, 'Невідомий тип активності');
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    throw HttpError(404, 'Клієнта не знайдено');
  }

  const колиСталось = date ? new Date(date) : new Date();

  if (Number.isNaN(колиСталось.getTime())) {
    throw HttpError(400, 'Некоректна дата активності');
  }

  // ⚠️ Нагадування має ТРИ стани, і розрізняти їх обов'язково:
  //   поля немає  — не чіпати (звичайна нотатка не повинна зносити домовленість);
  //   null        — зняти (кнопка «звʼязався» в блоці нагадувань);
  //   дата        — виставити.
  let дата = null;

  if (nextContactDate !== undefined) {
    if (nextContactDate === null) {
      contact.nextContactDate = null;
    } else {
      дата = new Date(nextContactDate);

      if (Number.isNaN(дата.getTime())) {
        throw HttpError(400, 'Некоректна дата наступного контакту');
      }

      contact.nextContactDate = дата;
    }

    await contact.save();
  }

  const activity = await addActivity({
    contactId: contact._id,
    type,
    text: typeof text === 'string' ? text.trim() : '',
    date: колиСталось,
    createdBy: admin.login,
    nextContactDate: дата,
  });

  res.status(201).json({ result: activity });
};

// Ручна прив'язка замовлення до клієнта — коли авто за телефоном не спрацювала
// (людина замовила з іншого номера) або прив'язалась не до того.
const setOrderContact = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { contactId } = req.body;
  const order = await Order.findOne({ numberOfOrder: req.params.numberOfOrder });

  if (!order) {
    throw HttpError(404, 'Замовлення не знайдено');
  }

  if (contactId) {
    const contact = await Contact.findById(contactId);

    if (!contact) {
      throw HttpError(404, 'Клієнта не знайдено');
    }

    order.contactId = contact._id;
  } else {
    // Порожнє значення = відв'язати.
    order.contactId = null;
  }

  await order.save();

  res.status(200).json({ result: { numberOfOrder: order.numberOfOrder, contactId: order.contactId } });
};

// Формування ТТН Нової Пошти для замовлення.
//
// ⚠️ Статус замовлення тут НЕ змінюється — свідомо. Перехід у «Відправлено»
// має власні правила (дозволені переходи, обов'язковість ТТН, залишки), і вони
// вже живуть в updateOrderById. Дублювати їх тут означало б завести другий,
// нікому не відомий шлях зміни статусу, який розійдеться з першим при першій
// же правці. Адмінка після успіху викликає той самий updateOrderById, що й при
// ручному вводі номера.
//
// ⚠️ Номер зберігається ОДРАЗУ після відповіді Пошти, окремим записом. Якщо
// впасти між створенням ТТН і збереженням, у Пошті лишиться оплачена накладна,
// про яку магазин нічого не знає, — а другу для того самого замовлення вже не
// створити (див. перевірку нижче).
const createOrderTtn = async (req, res) => {
  const { token } = req.user;
  const admin = await Admin.findOne({ token });

  if (!admin) {
    throw HttpError(404, 'Not Found');
  }

  const { numberOfOrder } = req.params;
  const order = await Order.findOne({ numberOfOrder });

  if (!order) {
    throw HttpError(404, `Замовлення ${numberOfOrder} не знайдено`);
  }

  // Друга ТТН на те саме замовлення — це друга реальна посилка й друга оплата
  // доставки. Краще показати наявний номер, ніж мовчки створити ще одну.
  if (order.ttn) {
    throw HttpError(409, `Для цього замовлення вже є ТТН: ${order.ttn}`);
  }

  const settings = await loadSettings();
  const missing = getMissingSenderFields(settings);

  if (missing.length > 0) {
    throw HttpError(
      400,
      `Не заповнено дані відправника в Налаштуваннях: ${missing.join(', ')}`
    );
  }

  const { weight, width, length, height, seatsAmount, cost, description, codAmount } =
    req.body;

  const positive = (value, label) => {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      throw HttpError(400, `${label} має бути додатним числом`);
    }

    return number;
  };

  // Габарити в сантиметрах — з них рахується OptionsSeat, без якого Пошта
  // накладну не приймає.
  const manual = {
    weight: positive(weight, 'Вага'),
    width: positive(width, 'Ширина'),
    length: positive(length, 'Довжина'),
    height: positive(height, 'Висота'),
    seatsAmount: Math.max(1, Math.trunc(Number(seatsAmount) || 1)),
    cost: Math.max(0, Math.round(Number(cost) || 0)),
    description: String(description || '').trim(),
    codAmount: 0,
  };

  if (!manual.description) {
    throw HttpError(400, 'Опис відправлення обовʼязковий');
  }

  // Наложка тільки для накладеного платежу. Сума з модалки має пріоритет —
  // менеджер міг домовитись інакше, — але для решти способів оплати вона
  // ігнорується: там гроші вже отримані.
  if (order.payment === CASH_ON_DELIVERY) {
    const запропоновано = redeliverySum(order);
    const обрано = codAmount === undefined || codAmount === null ? запропоновано : Number(codAmount);

    if (обрано !== null && Number.isFinite(обрано) && обрано > 0) {
      manual.codAmount = Math.round(обрано);
    }
  }

  try {
    // Адреса отримувача відновлюється з тексту замовлення: Ref у ньому ніколи
    // не зберігався, а назви Пошти однозначні.
    const city = await resolveCityRef(order.city);
    const warehouse = await resolveWarehouse(order.city, order.warehouse);

    // Адреса ВІДПРАВНИКА — тим самим механізмом. У налаштуваннях лежать лише
    // назви, обрані з довідника Пошти, тож Ref беремо тут, а не зберігаємо.
    const senderCity = await resolveCityRef(settings.npSender.cityName);
    const senderWarehouse = await resolveWarehouse(
      settings.npSender.cityName,
      settings.npSender.warehouseName
    );

    if (warehouse.maxWeight && manual.weight > warehouse.maxWeight) {
      throw HttpError(
        400,
        `Вага ${manual.weight} кг перевищує ліміт цього відділення (${warehouse.maxWeight} кг). ` +
          `Це ${warehouse.category === 'Postomat' ? 'поштомат' : 'відділення'}, ` +
          'оберіть меншу вагу або домовтесь із клієнтом про іншу адресу.'
      );
    }

    // ⚠️ Дані клієнта в замовленні ПЛАСКІ. Форма шле їх у userData, але
    // контролер створення розкладає їх на верхній рівень (див. схему
    // models/order.js) — і order.userData в збереженому документі не існує.
    const recipient = await ensureRecipient({
      firstName: order.firstName,
      lastName: order.lastName,
      phone: order.tel,
    });

    const payload = buildTtnPayload({
      order,
      sender: settings.npSender,
      senderCity,
      senderWarehouse,
      recipient,
      city,
      warehouse,
      manual,
    });

    const created = await npPost('InternetDocument', 'save', payload);
    const document = created[0];

    if (!document || !document.IntDocNumber) {
      throw new NovaPoshtaError(['Нова Пошта не повернула номер ТТН']);
    }

    order.ttn = document.IntDocNumber;
    await order.save();

    res.status(200).json({
      result: {
        ttn: document.IntDocNumber,
        ref: document.Ref,
        cost: document.CostOnSite,
        estimatedDeliveryDate: document.EstimatedDeliveryDate,
        serviceType: payload.ServiceType,
        warehouseCategory: warehouse.category,
        codAmount: manual.codAmount,
      },
    });
  } catch (error) {
    if (error instanceof NovaPoshtaError) {
      // Єдиний випадок, коли текст Пошти замінюємо своїм: «Передана послуга
      // Післяплата недоступна» нічого не каже про те, ЩО робити, і виглядає
      // як помилка в даних — хоча це питання договору з Поштою.
      const проПісляплату =
        error.errorCodes.includes('20000204637') || /Післяплат/i.test(error.message);

      if (проПісляплату && manual.codAmount) {
        throw HttpError(
          502,
          await explainRedeliveryRefusal(settings.npSender.counterpartyRef)
        );
      }

      // Решта — текстом Пошти як є: саме він каже, що виправити.
      throw HttpError(502, `Нова Пошта: ${error.message}`);
    }

    if (error.status) {
      throw error;
    }

    console.error('[createOrderTtn] несподівана помилка:', error.message);
    throw HttpError(502, 'Не вдалося створити ТТН');
  }
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
    //
    // ⚠️ Модель саме `Counterparty`, а НЕ `ContactPerson`. Назва методу читається
    // як «контактні особи контрагента», і модель ContactPerson напрошується сама
    // — але там живуть лише save/update/delete. Пошта на помилку відповідає
    // «Method ContactPersonGeneral_getCounterpartyContactPersons not found»:
    // вона складає внутрішню назву як <Модель>General_<метод>, тож у тексті
    // помилки видно, в якій саме моделі шукали.
    const result = [];

    for (const party of counterparties) {
      let contacts = [];

      try {
        contacts = await npPost('Counterparty', 'getCounterpartyContactPersons', {
          Ref: party.Ref,
          Page: '1',
        });
      } catch (contactsError) {
        // Один проблемний контрагент не має ховати решту списку: краще
        // показати його без контактів, ніж лишити налаштування порожніми.
        console.error(
          `[getNovaPoshtaSenders] контакти для ${party.Ref} не отримано:`,
          contactsError.message
        );
      }

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

  const [orders, print3d, feedback, reminders] = await Promise.all([
    Order.countDocuments(UNVIEWED),
    Print3dOrder.countDocuments(UNVIEWED),
    FeedBack.countDocuments(UNVIEWED),
    // ⚠️ Це НЕ «непереглянуте». Три лічильники вище знімаються кнопкою
    // «переглянуто» й зменшуються в адмінці локально; цей — обчислюваний стан
    // («час дзвонити»), і зникає лише тоді, коли менеджер справді зняв або
    // переніс дату. Тому для нього немає markViewed і його не можна віднімати
    // локально — тільки перечитувати.
    Contact.countDocuments({ nextContactDate: { $ne: null, $lte: new Date() } }),
  ]);

  res.status(200).json({
    result: { orders, print3d, feedback, reminders },
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
  createOrderTtn: ctrlWrapper(createOrderTtn),
  getContacts: ctrlWrapper(getContacts),
  getContactById: ctrlWrapper(getContactById),
  createContact: ctrlWrapper(createContact),
  updateContact: ctrlWrapper(updateContact),
  deleteContact: ctrlWrapper(deleteContact),
  setOrderContact: ctrlWrapper(setOrderContact),
  getFunnel: ctrlWrapper(getFunnel),
  getContactActivities: ctrlWrapper(getContactActivities),
  getOrderJournal: ctrlWrapper(getOrderJournal),
  createOrderJournalNote: ctrlWrapper(createOrderJournalNote),
  createContactActivity: ctrlWrapper(createContactActivity),
  setContactStage: ctrlWrapper(setContactStage),
  getCounters: ctrlWrapper(getCounters),
  markOrderViewed: ctrlWrapper(markOrderViewed),
  markPrint3dViewed: ctrlWrapper(markPrint3dViewed),
  markFeedbackViewed: ctrlWrapper(markFeedbackViewed),
  reorderProducts: ctrlWrapper(reorderProducts),


















};
