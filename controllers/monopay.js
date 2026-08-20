const { ctrlWrapper, HttpError } = require('../helpers');
const { monopayPost, buildCreatePayload, buildOrderIdPayload, verifyCallbackSignature } = require('../helpers/monopay');
const { Order } = require('../models/order');
const { NumberOfOrders } = require('../models/numberOfOrders');

function logMonopayError(context, error) {
    if (error.response) {
        console.error(`monopay ${context} failed: status=${error.response.status} body=${JSON.stringify(error.response.data)}`);
    } else {
        console.error(`monopay ${context} failed: ${error.message}`);
    }
}

const createMonopayOrder = async (req, res) => {
    const number = await NumberOfOrders.findOne({});
    const numberOfOrder = number.numberOrder += 1;

    const result = await number.save();

    if (!result) {
        throw HttpError(500, 'Internal server error, write orderNumber in DB');
    }

    const { userData: { firstName, lastName, email, text, tel }, total, cartItems, deliveryType, city, warehouse, promoCode, promoCodeDiscount, discountValue, together, payParts } = req.body;

    const order = await Order.create({
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
        payment: 'monopay_parts',
        payParts,
        monopayState: 'pending',
        isTest: true,
    });

    if (!order) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }

    const payload = buildCreatePayload({
        storeOrderId: numberOfOrder,
        clientPhone: tel,
        totalSum: together,
        payParts,
        resultCallback: `${process.env.PUBLIC_URL}/api/monopay/callback`,
    });

    let monobankResponse;
    try {
        monobankResponse = await monopayPost('/api/order/create', payload);
    } catch (error) {
        logMonopayError('create', error);
        throw HttpError(502, 'Monobank create order request failed');
    }

    const monopayOrderId = monobankResponse.data && monobankResponse.data.order_id;

    if (!monopayOrderId) {
        throw HttpError(502, 'Monobank did not return order_id');
    }

    order.monopayOrderId = monopayOrderId;
    await order.save();

    res.status(200).json({
        orderNum: numberOfOrder,
        status: order.monopayState,
    });
};

const monopayCallback = async (req, res) => {
    const signatureHeader = req.headers.signature;

    if (!verifyCallbackSignature(req.rawBody, signatureHeader)) {
        throw HttpError(401, 'Invalid signature');
    }

    const { order_id, state, order_sub_state } = req.body;

    const order = await Order.findOneAndUpdate(
        { monopayOrderId: order_id },
        { monopayState: state, monopaySubState: order_sub_state }
    );

    if (!order) {
        console.log(`monopay callback: order with monopayOrderId=${order_id} not found`);
    }

    res.status(200).json({ message: 'ok' });
};

const findMonopayOrder = async (id) => {
    const order = await Order.findOne({ numberOfOrder: id });

    if (!order || !order.monopayOrderId) {
        throw HttpError(404, 'Monopay order not found');
    }

    return order;
};

const getMonopayState = async (req, res) => {
    const order = await findMonopayOrder(req.params.id);

    let monobankResponse;
    try {
        monobankResponse = await monopayPost('/api/order/state', buildOrderIdPayload(order.monopayOrderId));
    } catch (error) {
        logMonopayError('state', error);
        throw HttpError(502, 'Monobank state request failed');
    }

    const { state, order_sub_state } = monobankResponse.data;

    order.monopayState = state;
    order.monopaySubState = order_sub_state;
    await order.save();

    res.status(200).json({
        state: order.monopayState,
        subState: order.monopaySubState,
    });
};

const confirmMonopayOrder = async (req, res) => {
    const order = await findMonopayOrder(req.params.id);

    let monobankResponse;
    try {
        monobankResponse = await monopayPost('/api/order/confirm', buildOrderIdPayload(order.monopayOrderId));
    } catch (error) {
        logMonopayError('confirm', error);
        throw HttpError(502, 'Monobank confirm request failed');
    }

    res.status(200).json({ result: monobankResponse.data });
};

const rejectMonopayOrder = async (req, res) => {
    const order = await findMonopayOrder(req.params.id);

    let monobankResponse;
    try {
        monobankResponse = await monopayPost('/api/order/reject', buildOrderIdPayload(order.monopayOrderId));
    } catch (error) {
        logMonopayError('reject', error);
        throw HttpError(502, 'Monobank reject request failed');
    }

    res.status(200).json({ result: monobankResponse.data });
};

module.exports = {
    createMonopayOrder: ctrlWrapper(createMonopayOrder),
    monopayCallback: ctrlWrapper(monopayCallback),
    getMonopayState: ctrlWrapper(getMonopayState),
    confirmMonopayOrder: ctrlWrapper(confirmMonopayOrder),
    rejectMonopayOrder: ctrlWrapper(rejectMonopayOrder),
};
