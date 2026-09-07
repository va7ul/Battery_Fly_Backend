const { ctrlWrapper, HttpError, sendEmail } = require('../helpers');
const {
    acquiringPost,
    acquiringGet,
    buildInvoicePayload,
    getMerchantPubKey,
    verifyWebhookSignature,
} = require('../helpers/acquiring');
const { Order } = require('../models/order');
const { NumberOfOrders } = require('../models/numberOfOrders');
const { PromoCode } = require('../models/promoCode');
const { User } = require('../models/user');

const { MAIL_USER, PUBLIC_URL, FRONTEND_URL } = process.env;

function logAcquiringError(context, error) {
    if (error.response) {
        console.error(`acquiring ${context} failed: status=${error.response.status} body=${JSON.stringify(error.response.data)}`);
    } else {
        console.error(`acquiring ${context} failed: ${error.message}`);
    }
}

function buildAcceptedEmail(email, numberOfOrder) {
    return {
        from: MAIL_USER,
        to: email,
        subject: `Ваше замовлення №${numberOfOrder} прийнято, очікуємо оплату`,
        html: `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0 Transitional//UK">
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body style="width: 600px">
    <b>Ваше замовлення прийнято!</b>
    <p>
      Дякуємо за ваше замовлення в BatteryFly! Замовлення №${numberOfOrder}
      успішно створено, зараз ми очікуємо надходження оплати карткою.
    </p>
    <p>
      Щойно оплата пройде, ми зв’яжемось з вами для уточнення деталей та
      подальших кроків.
    </p>
    <p>
      Якщо у вас виникли запитання, зв'яжіться з нашою підтримкою: <br />тел.
      <a href="tel:+380509686485">+38(050)968-64-85</a> <br />e-mail
      <a href="mailto:batteryfly@meta.ua">batteryfly@meta.ua</a>
    </p>
    <p>Дякуємо, що обрали BatteryFly!</p>
    <hr />
    <p>З повагою, <br />Команда BatteryFly</p>
  </body>
</html>
`,
    };
}

const createAcquiringOrder = async (req, res) => {
    const number = await NumberOfOrders.findOne({});
    const numberOfOrder = number.numberOrder += 1;

    const result = await number.save();

    if (!result) {
        throw HttpError(500, 'Internal server error, write orderNumber in DB');
    }

    const { userData: { firstName, lastName, email, text, tel }, total, cartItems, deliveryType, city, warehouse, promoCode, promoCodeDiscount, discountValue, together } = req.body;

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
        payment: 'card_online',
        acquiringStatus: 'created',
    });

    if (!order) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }

    const payload = buildInvoicePayload({
        numberOfOrder,
        together,
        discountValue,
        cartItems,
        redirectUrl: `${FRONTEND_URL}/payment/result?order=${numberOfOrder}`,
        webHookUrl: `${PUBLIC_URL}/api/acquiring/webhook`,
    });

    let monobankResponse;
    try {
        monobankResponse = await acquiringPost('/api/merchant/invoice/create', payload);
    } catch (error) {
        logAcquiringError('invoice-create', error);
        throw HttpError(502, 'Monobank invoice create request failed');
    }

    const { invoiceId, pageUrl } = monobankResponse.data || {};

    if (!invoiceId || !pageUrl) {
        throw HttpError(502, 'Monobank did not return invoiceId/pageUrl');
    }

    order.acquiringInvoiceId = invoiceId;
    order.acquiringPageUrl = pageUrl;
    await order.save();

    // Профіль клієнта — як в addOrder (промокод стає використаним, номер
    // потрапляє в історію), але з перевіркою на гостя: в addOrder її немає і
    // замовлення без зареєстрованого користувача там впаде.
    const user = await User.findOne({ email });

    if (user) {
        if (promoCode) {
            const promo = await PromoCode.findOne({ name: promoCode });

            if (promo) {
                user.promoCodes.push(promoCode);
            }
        }

        user.orders.push(numberOfOrder);
        await user.save();
    }

    // Лист не повинен блокувати видачу посилання на оплату: рахунок у monobank
    // уже створено, клієнту треба віддати pageUrl навіть при збої пошти.
    try {
        await sendEmail(buildAcceptedEmail(email, numberOfOrder));
    } catch (error) {
        logAcquiringError('accepted-email', error);
    }

    res.status(200).json({
        orderNum: numberOfOrder,
        pageUrl,
    });
};

const acquiringWebhook = async (req, res) => {
    const signature = req.headers['x-sign'];

    let pubKey;
    try {
        pubKey = await getMerchantPubKey();
    } catch (error) {
        logAcquiringError('pubkey', error);
        throw HttpError(503, 'Monobank pubkey is unavailable');
    }

    let isValid = verifyWebhookSignature(req.rawBody, signature, pubKey);

    if (!isValid) {
        // Ключ ротується — одна спроба зі свіжим ключем перед відмовою.
        try {
            pubKey = await getMerchantPubKey(true);
            isValid = verifyWebhookSignature(req.rawBody, signature, pubKey);
        } catch (error) {
            logAcquiringError('pubkey-refresh', error);
        }
    }

    if (!isValid) {
        throw HttpError(401, 'Invalid signature');
    }

    const { invoiceId, status, modifiedDate, reference, failureReason, errCode } = req.body;

    let order = invoiceId ? await Order.findOne({ acquiringInvoiceId: invoiceId }) : null;

    if (!order && reference) {
        order = await Order.findOne({ numberOfOrder: reference });
    }

    if (!order) {
        console.log(`acquiring webhook: order not found (invoiceId=${invoiceId}, reference=${reference})`);
        return res.status(200).json({ message: 'ok' });
    }

    // Порядок доставки вебхуків не гарантований: актуальний той, у кого
    // modifiedDate більший. Застарілий — ігноруємо, але відповідаємо 200,
    // інакше monobank повторюватиме доставку.
    const incomingTime = modifiedDate ? new Date(modifiedDate).getTime() : NaN;
    const storedTime = order.acquiringModifiedDate ? new Date(order.acquiringModifiedDate).getTime() : NaN;

    if (Number.isFinite(incomingTime) && Number.isFinite(storedTime) && incomingTime <= storedTime) {
        console.log(`acquiring webhook: stale webhook ignored for order ${order.numberOfOrder} (incoming=${modifiedDate}, stored=${order.acquiringModifiedDate})`);
        return res.status(200).json({ message: 'ok' });
    }

    const reason = [errCode, failureReason].filter(Boolean).join(': ');

    if (status) {
        order.acquiringStatus = status;
    }

    if (Number.isFinite(incomingTime)) {
        order.acquiringModifiedDate = modifiedDate;
    }

    order.acquiringFailureReason = reason || null;

    // Робочий status замовлення свідомо не чіпаємо — ним керує менеджер
    // через адмінку (PUT /api/adm/put-order/:id).
    await order.save();

    res.status(200).json({ message: 'ok' });
};

const getAcquiringStatus = async (req, res) => {
    const order = await Order.findOne({ numberOfOrder: req.params.id });

    if (!order || !order.acquiringInvoiceId) {
        throw HttpError(404, 'Acquiring order not found');
    }

    let monobankResponse;
    try {
        monobankResponse = await acquiringGet('/api/merchant/invoice/status', { invoiceId: order.acquiringInvoiceId });
    } catch (error) {
        logAcquiringError('invoice-status', error);
        throw HttpError(502, 'Monobank invoice status request failed');
    }

    const { status, modifiedDate, failureReason, errCode, amount, finalAmount } = monobankResponse.data || {};
    const reason = [errCode, failureReason].filter(Boolean).join(': ');

    // Прямий запит статусу авторитетніший за вебхук, тому пишемо без
    // порівняння modifiedDate.
    if (status) {
        order.acquiringStatus = status;
    }

    if (modifiedDate) {
        order.acquiringModifiedDate = modifiedDate;
    }

    order.acquiringFailureReason = reason || null;
    await order.save();

    res.status(200).json({
        orderNum: order.numberOfOrder,
        status: order.acquiringStatus,
        modifiedDate: order.acquiringModifiedDate,
        failureReason: order.acquiringFailureReason,
        amount,
        finalAmount,
    });
};

module.exports = {
    createAcquiringOrder: ctrlWrapper(createAcquiringOrder),
    acquiringWebhook: ctrlWrapper(acquiringWebhook),
    getAcquiringStatus: ctrlWrapper(getAcquiringStatus),
};
