const express = require('express');
const { validateBody, authAdm, upload, uploadProductImages } = require('../../middlewares');
const { schemas } = require('../../models/admin');
const ctrl = require('../../controllers/admin');

const router = express.Router();

router.post('/signin', validateBody(schemas.loginSchema), ctrl.login);
router.post('/signout', authAdm, ctrl.logout);
router.get('/current', authAdm, ctrl.getCurrent);
router.post('/product-add', authAdm, uploadProductImages.array('files', 15), ctrl.addProduct);
router.put('/product-edit/:id', authAdm, uploadProductImages.array('files', 15), ctrl.editProduct);
router.post('/assemblies-add', authAdm, uploadProductImages.array('files', 15), ctrl.addProductZbirky);
router.put('/assemblies-edit/:id', authAdm, uploadProductImages.array('files', 15), ctrl.editProductZbirky);
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
router.put('/promo-code/:id', authAdm, ctrl.updatePromocode);
router.delete('/promo-code/:id', authAdm, ctrl.deletePromocode);
router.get('/feedback', authAdm, ctrl.getFeedback);
router.put('/put-order/:id', authAdm, ctrl.updateOrderById);
router.get('/dashboard', authAdm, ctrl.getDashboard);
router.get('/order-message/:numberOfOrder', authAdm, ctrl.getOrderMessage);
router.put('/products/reorder', authAdm, ctrl.reorderProducts);
router.get('/counters', authAdm, ctrl.getCounters);
router.patch('/orders/:numberOfOrder/viewed', authAdm, ctrl.markOrderViewed);
router.patch('/print3d/:id/viewed', authAdm, ctrl.markPrint3dViewed);
router.patch('/feedback/:id/viewed', authAdm, ctrl.markFeedbackViewed);
router.get('/settings', authAdm, ctrl.getShopSettings);
router.put('/settings', authAdm, ctrl.updateShopSettings);
















module.exports = router;
