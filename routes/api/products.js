const express = require('express');
const { validateBody, auth, upload } = require('../../middlewares');
const ctrl = require('../../controllers/products')
// const { schemas } = require('../../models/user');

const router = express.Router();

router.get('/', ctrl.getAllProducts);
router.post('/', ctrl.addProduct);
router.post('/products_zbirky', ctrl.addProductZbirky);
router.get('/battery', ctrl.getAllBatterys);
router.get('/sale', ctrl.getSales);




module.exports = router;