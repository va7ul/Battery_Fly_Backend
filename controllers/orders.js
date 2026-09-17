const { ctrlWrapper, HttpError, notifyNewOrder, calculatePrepayment, getSettings } = require('../helpers');

const {PromoCode} = require('../models/promoCode')
const { Order } = require('../models/order');
const {NumberOfOrders} = require('../models/numberOfOrders');
const { npPost, NovaPoshtaError } = require('../helpers/novaposhta');
const { attachContactToOrder } = require('../helpers/contacts');
const { logOrderCreated } = require('../helpers/activities');
const { User } = require('../models/user');
const { QuickOrder } = require('../models/quickOrder');

// Пошук міста для випадайки на checkout.
//
// ⚠️ Формат відповіді міняти НЕ можна: клієнтський фронт чекає рівно
// { cities: string[] } — і { werehouses } з друкарською помилкою нижче теж.
// Обидва зав'язані в redux/order/orderOperations.ts.
const getDeliveryCity = async (req, res) => {
    const query = String(req.body.query || '').trim();

    if (!query) {
        return res.status(200).json({ cities: [] });
    }

    try {
        const cities = await npPost('Address', 'getCities', {
            Page: '1',
            FindByString: query,
            Limit: '20',
        });

        res.status(200).json({ cities: cities.map(item => item.Description) });
    } catch (error) {
        // ⚠️ Раніше тут стояв .catch(), який віддавав 500 без жодного сліду в
        // логах. Гірше: НП відповідає HTTP 200 навіть на провал, тож для її
        // ділових помилок той catch не спрацьовував ЖОДНОГО разу — падіння
        // виглядало як порожній список міст.
        if (error instanceof NovaPoshtaError) {
            throw HttpError(502, `Нова Пошта: ${error.message}`);
        }

        console.error('[getDeliveryCity] помилка запиту до Нової Пошти:', error.message);
        throw HttpError(502, 'Не вдалося звʼязатися з Новою Поштою');
    }
};

// Відділення й поштомати обраного міста.
const getWarehouses = async (req, res) => {
    const query = String(req.body.query || '').trim();

    if (!query) {
        return res.status(200).json({ werehouses: [] });
    }

    try {
        const warehouses = await npPost('Address', 'getWarehouses', {
            FindByString: '',
            CityName: query,
            Language: 'UA',
        });

        res.status(200).json({ werehouses: warehouses.map(item => item.Description) });
    } catch (error) {
        if (error instanceof NovaPoshtaError) {
            throw HttpError(502, `Нова Пошта: ${error.message}`);
        }

        console.error('[getWarehouses] помилка запиту до Нової Пошти:', error.message);
        throw HttpError(502, 'Не вдалося звʼязатися з Новою Поштою');
    }
};

const addOrder = async (req, res) => {
    console.log("addOrder")

    const number = await NumberOfOrders.findOne({})
    const numberOfOrder = number.numberOrder +=1;

    const result = await number.save();
    
    if (!result) {
                throw HttpError(500, 'Internal server error, write orderNumber in DB');
            }

    const {userData:{firstName, lastName, email, text, tel}, total, cartItems, deliveryType, city, warehouse, payment, promoCode, promoCodeDiscount, discountValue, together} = req.body;

    const shopSettings = await getSettings();

    const finalyOrder = {
        numberOfOrder,
        firstName, 
        lastName, 
        email, 
        comment: text, 
        tel, 
        total, 
        promoCode,
        promoCodeDiscount,
        discountValue,
        together,
        cartItems, 
        deliveryType, 
        city, 
        warehouse, 
        payment,
        // Передоплата актуальна лише для накладеного платежу — для решти
        // способів хелпер поверне null. Відсоток редагується власником у
        // налаштуваннях; find-or-create гарантує документ навіть на свіжій базі.
        prepaymentAmount: calculatePrepayment(payment, together, shopSettings.prepaymentPercent)
    }

    // Клієнт CRM. Шукаємо за телефоном, не знайшли — заводимо нового.
    // Збій тут замовлення не валить: прив'язка внутрішня, і незв'язане
    // замовлення лагодиться ручною прив'язкою або скриптом.
    finalyOrder.contactId = await attachContactToOrder({ tel, firstName, lastName, email });

    const order = await Order.create({ ...finalyOrder })

    await logOrderCreated(order);

    if (promoCode) {

        const promo = await PromoCode.findOne({ name: promoCode })
        
        if (promo) {
            const user = await User.findOne({ email });
            user.promoCodes.push(promoCode);
            await user.save();
        }
        
        
    }
    
    if (!order) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }

    const user = await User.findOne({ email })
  
  if (user) {
    user.orders.push(numberOfOrder)
    await user.save();
  }
  
    
  
    // ⚠️ Лист клієнту про оформлення замовлення СВІДОМО не надсилається.
    //
    // Рішення власника: інформувати про замовлення менеджер має особисто —
    // дзвінком чи повідомленням, а не автоматичним листом, який однаково
    // нічого не додає до того, що клієнт щойно бачив на екрані. Магазин про
    // нове замовлення дізнається з Telegram (notifyNewOrder нижче) і з
    // адмінки.
    //
    // Поштою лишається ТІЛЬКИ підтвердження адреси при реєстрації
    // (controllers/auth.js, controllers/user.js). Не повертати сюди листи, не
    // спитавши власника.


    // Без await: сповіщення не має додавати ~300мс до відповіді клієнту.
    // Хелпер ніколи не реджектиться, тож unhandled rejection тут неможливий.
    notifyNewOrder(order);

    res.status(200).json({
        orderNum: numberOfOrder
      });
}

const getOrders = async (req, res) => {
    console.log("getOrders")

    if (req.admin) {
        const orders = await Order.find({}).sort({numberOfOrder:-1});
        
        const result = orders.map(order => {
        return {
            numberOfOrder: order.numberOfOrder,
            date: order.createdAt,
            together: order.together,
            status: order.status
        }
        })
        
        res.status(200).json({
        result
      });
        
    }


    const orders = await Order.find({ email: req.user.email }).sort({
      numberOfOrder: -1,
    });

    console.log(orders)

    const result = orders.map(order => {
        return {
            numberOfOrder: order.numberOfOrder,
            date: order.createdAt,
            together: order.together,
            status: order.status
        }
    })
    

    
    res.status(200).json({
        result
      });
}

// Замовлення в кабінеті клієнта.
//
// ⚠️ Віддаємо ПРОЄКЦІЮ, а не документ цілком. Раніше сюди їхало все, що є в
// замовленні: внутрішня примітка менеджера, поля трекінгу, посилки — зокрема
// їхні адреси й отримувачі, які могли бути ЧУЖИМИ («надішліть зарядку на
// роботу колезі»). Клієнт нічого з цього не бачив на екрані лише тому, що фронт
// їх не малює, — але в мережевій відповіді вони лежали відкрито.
//
// ⚠️ Список полів явний, а не «прибрати зайве». Чорний список мовчки пропустив
// би кожне нове поле замовлення: варто комусь додати внутрішню позначку — і
// вона поїде клієнту, і ніхто цього не помітить.
const getOrderById = async (req, res) => {
    const order = await Order.findOne({numberOfOrder: req.params.id});

    if (!order) {
        throw HttpError(404, 'Order not found');
    }

    if(req.user.email !== order.email){
        throw HttpError(400, 'Bad request');
    }

    res.status(200).json({
        result: {
            numberOfOrder: order.numberOfOrder,
            createdAt: order.createdAt,
            status: order.status,
            // Дані, які клієнт сам і ввів при оформленні.
            firstName: order.firstName,
            lastName: order.lastName,
            email: order.email,
            tel: order.tel,
            comment: order.comment,
            // Склад і гроші його замовлення.
            cartItems: order.cartItems,
            total: order.total,
            promoCode: order.promoCode,
            promoCodeDiscount: order.promoCodeDiscount,
            discountValue: order.discountValue,
            together: order.together,
            // Доставка, про яку він домовлявся.
            deliveryType: order.deliveryType,
            city: order.city,
            warehouse: order.warehouse,
            payment: order.payment,
            payParts: order.payParts,
            prepaymentAmount: order.prepaymentAmount,
        }
      });
}

const getPromoCode = async (req, res) => {

    const promoCode = await PromoCode.findOne({ name: req.params.name });
    
    const user = req.user;

    if(!promoCode){
        throw HttpError(400, 'Bad request');
    }

    const usesPromo = user.promoCodes.find(item => item === req.params.name)

    if (promoCode.valid && !usesPromo) {
        res.status(200).json({
        promoCode
        });
    }
    if (promoCode.valid && usesPromo) {
        throw HttpError(409, 'promoCode already in use');
    }

    if (!promoCode.valid) {
        throw HttpError(409, 'promoCode not valid');
    }
}

const addQuickOrder = async (req, res) => {
    console.log("addQuickOrder")

    const number = await NumberOfOrders.findOne({})
    const numberOfOrder = number.numberOrder +=1;

    const result = await number.save();
    
    if (!result) {
                throw HttpError(500, 'Internal server error, write orderNumber in DB');
            }

    const {name,userName,email, tel, codeOfGood} = req.body;

    const finalyOrder = {
        numberOfOrder,
        userName,
        email,
        tel,
        codeOfGood,
        name
    };
    const quickOrder = await QuickOrder.create({ ...finalyOrder })
        

    if (!quickOrder) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }
    
    res.status(200).json({
        message: "Quick order is accepted"
      });
}

module.exports = {
    getDeliveryCity: ctrlWrapper(getDeliveryCity),
    getWarehouses: ctrlWrapper(getWarehouses),
    addOrder: ctrlWrapper(addOrder),
    getOrders: ctrlWrapper(getOrders),
    getOrderById: ctrlWrapper(getOrderById),
    getPromoCode: ctrlWrapper(getPromoCode),
    addQuickOrder: ctrlWrapper(addQuickOrder),
};