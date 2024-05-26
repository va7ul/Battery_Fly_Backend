const express = require('express');
const { validateBody, auth, authAdm, upload } = require('../../middlewares');
const { schemas } = require('../../models/order');
const {schemasOrder} = require('../../models/quickOrder')
const ctrl = require('../../controllers/orders');

const router = express.Router();

router.post('/getDeliveryCity', ctrl.getDeliveryCity);
router.post('/getWarehouses', ctrl.getWarehouses);
router.post('/add-order',validateBody(schemas.addOrder), ctrl.addOrder);
router.get('/get-orders', auth, ctrl.getOrders);
router.get('/get-order/:id', auth, ctrl.getOrderById);
router.get('/promo-code/:name', auth, ctrl.getPromoCode);
router.post('/quick-order', validateBody(schemasOrder.addQuickOrder), ctrl.addQuickOrder);










module.exports = router;