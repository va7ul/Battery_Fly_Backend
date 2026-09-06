const { ctrlWrapper, HttpError, sendEmail } = require('../helpers');
const {
    acquiringPost,
    acquiringGet,
    buildInvoicePayload,
    getMerchantPubKey,
    verifyWebhookSignature,
    ACQUIRING_STATUS,
    isFinalStatus,
    isInvoiceStillValid,
    generatePublicRef,
    shouldSyncStatus,
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

// Обидва URL-и, що йдуть у monobank, — в одному місці, бо тепер їх будує і
// create, і resend.
function buildRedirectUrl(publicRef) {
    return `${FRONTEND_URL}/payment/result?ref=${publicRef}`;
}

function buildWebhookUrl() {
    return `${PUBLIC_URL}/api/acquiring/webhook`;
}

async function fetchInvoiceStatus(invoiceId) {
    const response = await acquiringGet('/api/merchant/invoice/status', { invoiceId });

    return response.data || {};
}

// Переносить відповідь monobank (вебхук або invoice/status — тіла ідентичні) в
// поля замовлення. Робочий status замовлення свідомо не чіпає.
function applyStatusToOrder(order, data) {
    const { status, modifiedDate, failureReason, errCode } = data || {};
    const reason = [errCode, failureReason].filter(Boolean).join(': ');

    if (status) {
        order.acquiringStatus = status;
    }

    if (modifiedDate) {
        order.acquiringModifiedDate = modifiedDate;
    }

    order.acquiringFailureReason = reason || null;
}

// Чи можна запропонувати клієнту оплатити ще раз ТИМ САМИМ посиланням.
// Тільки після невдалої спроби і поки рахунок живий: у created/processing
// повторювати нічого (оплата ще в процесі), а success/reversed/expired —
// стани, де повтор або зайвий, або неможливий.
function canRetryPayment(order) {
    return order.acquiringStatus === ACQUIRING_STATUS.FAILURE
        && !!order.acquiringPageUrl
        && isInvoiceStillValid(order.acquiringInvoiceCreatedAt || order.createdAt);
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

    // Генеруємо ДО invoice/create: redirectUrl їде всередині того запиту, а
    // invoiceId відомий лише з відповіді на нього.
    const publicRef = generatePublicRef();

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
        acquiringStatus: ACQUIRING_STATUS.CREATED,
        acquiringPublicRef: publicRef,
    });

    if (!order) {
        throw HttpError(500, 'Internal server error, write order in DB');
    }

    const payload = buildInvoicePayload({
        numberOfOrder,
        together,
        discountValue,
        cartItems,
        redirectUrl: buildRedirectUrl(publicRef),
        webHookUrl: buildWebhookUrl(),
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
    order.acquiringInvoiceCreatedAt = new Date();
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

    // Фолбек за reference може знайти замовлення, у якого вже ІНШИЙ рахунок:
    // після повторної оплати (resend) створюється новий invoiceId, а вебхук
    // від старого рахунку цілком може долетіти пізніше. Приймати його не
    // можна — він перезапише статус актуального рахунку.
    if (order && invoiceId && order.acquiringInvoiceId && order.acquiringInvoiceId !== invoiceId) {
        console.log(`acquiring webhook: ignored webhook from stale invoice ${invoiceId} for order ${order.numberOfOrder} (current invoice ${order.acquiringInvoiceId})`);
        return res.status(200).json({ message: 'ok' });
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

    applyStatusToOrder(order, { status, modifiedDate, failureReason, errCode });

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

    let data;
    try {
        data = await fetchInvoiceStatus(order.acquiringInvoiceId);
    } catch (error) {
        logAcquiringError('invoice-status', error);
        throw HttpError(502, 'Monobank invoice status request failed');
    }

    // Прямий запит статусу авторитетніший за вебхук, тому пишемо без
    // порівняння modifiedDate.
    applyStatusToOrder(order, data);
    await order.save();

    res.status(200).json({
        orderNum: order.numberOfOrder,
        status: order.acquiringStatus,
        modifiedDate: order.acquiringModifiedDate,
        failureReason: order.acquiringFailureReason,
        amount: data.amount,
        finalAmount: data.finalAmount,
    });
};

// Публічний (без авторизації) статус оплати для сторінки /payment/result.
// Знаходить замовлення за невгадуваним ref з redirectUrl або за invoiceId.
const getPublicAcquiringStatus = async (req, res) => {
    const { ref, invoiceId } = req.body;

    const order = ref
        ? await Order.findOne({ acquiringPublicRef: ref })
        : await Order.findOne({ acquiringInvoiceId: invoiceId });

    if (!order || !order.acquiringInvoiceId) {
        throw HttpError(404, 'Payment not found');
    }

    // Стан не фінальний — питаємо monobank напряму: вебхук міг ще не долетіти,
    // а про expired він не приходить взагалі (дока: вебхуки шлються "окрім
    // статусу expired"). shouldSyncStatus тротлить ці запити.
    if (!isFinalStatus(order.acquiringStatus) && shouldSyncStatus(order.acquiringInvoiceId)) {
        try {
            const data = await fetchInvoiceStatus(order.acquiringInvoiceId);
            applyStatusToOrder(order, data);
            await order.save();
        } catch (error) {
            // Недоступність monobank не повинна ламати сторінку клієнта —
            // показуємо останній відомий стан.
            logAcquiringError('public-invoice-status', error);
        }
    }

    // ⚠️ Свідомо віддаємо ЛИШЕ платіжні поля. Ні cartItems, ні імені, ні
    // телефону, ні email: роут публічний, посилання може відкрити будь-хто,
    // кому воно потрапило.
    res.status(200).json({
        orderNum: order.numberOfOrder,
        status: order.acquiringStatus,
        failureReason: order.acquiringFailureReason,
        together: order.together,
        pageUrl: canRetryPayment(order) ? order.acquiringPageUrl : null,
    });
};

// Повторна оплата з боку адмінки: віддати менеджеру живе посилання, щоб він
// надіслав його клієнту. Якщо чинний рахунок ще живий — те саме посилання,
// інакше — новий рахунок на те саме замовлення.
const resendAcquiringOrder = async (req, res) => {
    const order = await Order.findOne({ numberOfOrder: req.params.id });

    if (!order || order.payment !== 'card_online') {
        throw HttpError(404, 'Acquiring order not found');
    }

    // Спершу звіряємо реальний стан. Видавати посилання на оплату, не знаючи
    // актуального статусу, — це ризик взяти гроші за вже оплачене замовлення.
    if (order.acquiringInvoiceId) {
        try {
            const data = await fetchInvoiceStatus(order.acquiringInvoiceId);
            applyStatusToOrder(order, data);
            await order.save();
        } catch (error) {
            logAcquiringError('resend-invoice-status', error);
            throw HttpError(502, 'Monobank invoice status request failed');
        }
    }

    if (order.acquiringStatus === ACQUIRING_STATUS.SUCCESS) {
        throw HttpError(409, 'Замовлення вже оплачено');
    }

    if (order.acquiringStatus === ACQUIRING_STATUS.HOLD) {
        throw HttpError(409, 'Кошти заблоковано (hold) — потрібне завершення, а не нове посилання');
    }

    if (order.acquiringStatus === ACQUIRING_STATUS.REVERSED) {
        throw HttpError(409, 'Оплату повернено — потрібне нове замовлення');
    }

    const invoiceAlive = order.acquiringPageUrl
        && order.acquiringStatus !== ACQUIRING_STATUS.EXPIRED
        && isInvoiceStillValid(order.acquiringInvoiceCreatedAt || order.createdAt);

    if (invoiceAlive) {
        return res.status(200).json({
            orderNum: order.numberOfOrder,
            status: order.acquiringStatus,
            pageUrl: order.acquiringPageUrl,
            invoiceId: order.acquiringInvoiceId,
            reused: true,
        });
    }

    // ref лишається тим самим: він ідентифікує ЗАМОВЛЕННЯ, а не рахунок, тож
    // раніше видане посилання на /payment/result покаже статус нового рахунку.
    const publicRef = order.acquiringPublicRef || generatePublicRef();

    const payload = buildInvoicePayload({
        numberOfOrder: order.numberOfOrder,
        together: order.together,
        discountValue: order.discountValue,
        cartItems: order.cartItems,
        redirectUrl: buildRedirectUrl(publicRef),
        webHookUrl: buildWebhookUrl(),
    });

    let monobankResponse;
    try {
        monobankResponse = await acquiringPost('/api/merchant/invoice/create', payload);
    } catch (error) {
        logAcquiringError('resend-invoice-create', error);
        throw HttpError(502, 'Monobank invoice create request failed');
    }

    const { invoiceId: newInvoiceId, pageUrl } = monobankResponse.data || {};

    if (!newInvoiceId || !pageUrl) {
        throw HttpError(502, 'Monobank did not return invoiceId/pageUrl');
    }

    order.acquiringPublicRef = publicRef;
    order.acquiringInvoiceId = newInvoiceId;
    order.acquiringPageUrl = pageUrl;
    order.acquiringInvoiceCreatedAt = new Date();
    order.acquiringStatus = ACQUIRING_STATUS.CREATED;
    order.acquiringModifiedDate = null;
    order.acquiringFailureReason = null;
    await order.save();

    res.status(200).json({
        orderNum: order.numberOfOrder,
        status: order.acquiringStatus,
        pageUrl,
        invoiceId: newInvoiceId,
        reused: false,
    });
};

module.exports = {
    createAcquiringOrder: ctrlWrapper(createAcquiringOrder),
    acquiringWebhook: ctrlWrapper(acquiringWebhook),
    getAcquiringStatus: ctrlWrapper(getAcquiringStatus),
    getPublicAcquiringStatus: ctrlWrapper(getPublicAcquiringStatus),
    resendAcquiringOrder: ctrlWrapper(resendAcquiringOrder),
};
