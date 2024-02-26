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
router.get('/battery/21700', ctrl.getBatterys21700);
router.get('/battery/18650', ctrl.getBatterys18650);
router.get('/battery/32650', ctrl.getBatterys32650);
router.get('/:id', ctrl.getProductById);








module.exports = router;