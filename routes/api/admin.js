const express = require('express');
const { validateBody, authAdm, upload } = require('../../middlewares');
const { schemas } = require('../../models/admin');
const ctrl = require('../../controllers/admin');

const router = express.Router();

router.post('/signin', validateBody(schemas.loginSchema), ctrl.login);
router.post('/signout', authAdm, ctrl.logout);
router.get('/current', authAdm, ctrl.getCurrent);
router.post('/product-add', authAdm, upload.array('files', 12), ctrl.addProduct);
router.put('/product-edit/:id', authAdm, upload.array('files', 12), ctrl.editProduct);
router.post('/assemblies-add', authAdm, upload.array('files', 12), ctrl.addProductZbirky);
router.put('/assemblies-edit/:id', authAdm,upload.array('files', 12),  ctrl.editProductZbirky);
router.delete('/product/:id', authAdm, ctrl.deleteProduct);
router.delete('/assemblies/:id', authAdm, ctrl.deleteZbirka);
router.put('/hero/:id', authAdm, upload.single('image'), ctrl.changeHeaderInfo);
router.post('/hero/', authAdm, upload.single('image'), ctrl.addHeaderInfo);
router.delete('/hero/:id', authAdm, ctrl.deleteHeaderInfo);
router.get('/get-orders', authAdm, ctrl.getOrders);
router.get('/get-order/:id', authAdm, ctrl.getOrderById);
router.get('/3dprint-orders', authAdm, ctrl.get3dPrintOrders);
router.get('/3dprint-orders/:id', authAdm, ctrl.get3dPrintOrderById);
router.get('/quick-orders', authAdm, ctrl.getQuickOrders);
router.get('/quick-order/:id', authAdm, ctrl.getQuickOrderById);
router.get('/users', authAdm, ctrl.getUsers);
router.get('/user/:id', authAdm, ctrl.getUserById);
router.get('/promo-codes', authAdm, ctrl.getPromocode);
router.post('/promo-code', authAdm, ctrl.addPromocode);
router.post('/promo-code/:id', authAdm, ctrl.updatePromocode);
router.delete('/promo-code/:id', authAdm, ctrl.deletePromocode);
router.get('/feedback', authAdm, ctrl.getFeedback);
router.put('/put-order/:id', authAdm, ctrl.updateOrderById);
















module.exports = router;
