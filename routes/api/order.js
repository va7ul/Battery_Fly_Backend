const express = require('express');
const { validateBody, auth, upload } = require('../../middlewares');
const { schemas } = require('../../models/user');
const ctrl = require('../../controllers/orders');

const router = express.Router();

router.post('/getDeliveryCity', auth, ctrl.getDeliveryCity);





module.exports = router;