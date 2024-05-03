const express = require('express');
const { validateBody } = require('../../middlewares');
const { schemas } = require('../../models/order');
const ctrl = require('../../controllers/price3d');

const router = express.Router();

router.get('/', ctrl.get3dPrices);


module.exports = router;