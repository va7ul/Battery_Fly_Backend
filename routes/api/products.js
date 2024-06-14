const express = require('express');
const { validateBody, auth, upload } = require('../../middlewares');
const ctrl = require('../../controllers/products')
// const { schemas } = require('../../models/user');

const router = express.Router();

router.get('/', ctrl.getAllProducts);
router.post('/', ctrl.getProductsArray);
router.get('/batteries', ctrl.getAllBatterys);
router.get('/assemblies', ctrl.getAssemblies);
router.get('/sale', ctrl.getSales);
router.get('/batteries/21700', ctrl.getBatterys21700);
router.get('/batteries/18650', ctrl.getBatterys18650);
router.get('/batteries/32650', ctrl.getBatterys32650);
router.get('/batteries-for-fpv', ctrl.getBatterysFpv);
router.get('/batteries-for-transport', ctrl.getBatterysTransport);
router.get('/batteries-for-toys', ctrl.getBatterysToys);
router.get('/devices', ctrl.getDevices);
router.get('/materials', ctrl.getMaterials);
router.get('/batteries/lipo', ctrl.getBatterysLipo);
router.get('/batteries/lifepo4', ctrl.getBatterysLidepo4);
router.get('/:id', ctrl.getProductById);



module.exports = router;