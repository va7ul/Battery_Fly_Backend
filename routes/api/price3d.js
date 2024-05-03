const express = require('express');
const ctrl = require('../../controllers/price3d');

const router = express.Router();

router.get('/', ctrl.get3dPrices);


module.exports = router;