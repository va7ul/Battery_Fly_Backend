const express = require('express');
const { validateBody, auth, upload } = require('../../middlewares');
const ctrl = require('../../controllers/products')
const { schemas } = require('../../models/user');

const router = express.Router();

router.get('/', ctrl.getAllProducts);
router.post('/', ctrl.addProduct);


module.exports = router;