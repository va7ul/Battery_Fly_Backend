const express = require('express');
const { validateBody, authAdm, upload } = require('../../middlewares');
const { schemas } = require('../../models/admin');
const ctrl = require('../../controllers/admin');

const router = express.Router();

router.post('/signin', validateBody(schemas.loginSchema), ctrl.login);
router.post('/signout', authAdm, ctrl.logout);
router.get('/current', authAdm, ctrl.getCurrent);
router.post('/product-add', authAdm, upload.array('files', 12),ctrl.addProduct);
router.post('/assemblies-add', authAdm,upload.array('files', 12),  ctrl.addProductZbirky);
router.put('/hero/:id', authAdm, upload.single('image'), ctrl.changeHeaderInfo);
router.post('/hero/', authAdm, upload.single('image'), ctrl.addHeaderInfo);
router.delete('/hero/:id', authAdm, ctrl.deleteHeaderInfo);
router.get('/get-orders', authAdm, ctrl.getOrders);
router.get('/get-order/:id', authAdm, ctrl.getOrderById);
router.get('/get-3dprint-orders', authAdm, ctrl.get3dPrintOrders);
router.get('/get-3dprint-orders/:id', authAdm, ctrl.get3dPrintOrderById);
router.get('/quick-orders', authAdm, ctrl.getQuickOrders);
router.get('/quick-order/:id', authAdm, ctrl.getQuickOrderById);
router.get('/get-users', authAdm, ctrl.getUsers);
router.get('/get-user/:id', authAdm, ctrl.getUserById);
router.get('/promo-get', authAdm, ctrl.getPromocode);
router.post('/promo-add', authAdm, ctrl.addPromocode);
router.post('/promo-update/:id', authAdm, ctrl.updatePromocode);
router.delete('/promo-delete/:id', authAdm, ctrl.deletePromocode);













module.exports = router;
