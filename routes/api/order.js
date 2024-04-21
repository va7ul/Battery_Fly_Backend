const express = require('express');
const { validateBody, auth, upload } = require('../../middlewares');
const { schemas } = require('../../models/order');
const ctrl = require('../../controllers/orders');

const router = express.Router();

router.post('/getDeliveryCity', ctrl.getDeliveryCity);
router.post('/getWarehouses', ctrl.getWarehouses);
router.post('/add-order',validateBody(schemas.addOrder), ctrl.addOrder);







module.exports = router;