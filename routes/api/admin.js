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

// Довідник відправників Нової Пошти для налаштувань (контрагенти + контакти).
router.get('/np/senders', authAdm, ctrl.getNovaPoshtaSenders);

// Формування ТТН. Статус замовлення не змінює — це робить окремий виклик
// оновлення замовлення, тим самим шляхом, що й при ручному вводі номера.
router.post('/orders/:numberOfOrder/create-ttn', authAdm, ctrl.createOrderTtn);
// Скидання ТТН: розблокувати створення нової, коли поточна недійсна.
router.post('/orders/:numberOfOrder/reset-ttn', authAdm, ctrl.resetOrderTtn);

// ─── Клієнти CRM ────────────────────────────────────────────────────────────
// Не плутати з /users: там акаунти на сайті, тут — усі, хто замовляв.
router.get('/contacts', authAdm, ctrl.getContacts);
router.post('/contacts', authAdm, ctrl.createContact);
router.get('/contacts/:id', authAdm, ctrl.getContactById);
router.put('/contacts/:id', authAdm, ctrl.updateContact);
router.delete('/contacts/:id', authAdm, ctrl.deleteContact);

// Ручна прив'язка замовлення до клієнта.
router.patch('/orders/:numberOfOrder/contact', authAdm, ctrl.setOrderContact);

// Воронка продажів. Дошка окремим роутом, а не параметром до /contacts:
// повертає інший формат (згруповано за стадіями) і інший набір клієнтів.
router.get('/funnel', authAdm, ctrl.getFunnel);
router.patch('/contacts/:id/stage', authAdm, ctrl.setContactStage);

// Хронологія клієнта. Окремим ресурсом, а не полем картки: записів десятки, і
// вантажити їх щоразу разом з іменем і телефоном ні до чого.
router.get('/contacts/:id/activities', authAdm, ctrl.getContactActivities);

// Журнал замовлення: автоподії (статус, ТТН) + внутрішні нотатки менеджера.
// ⚠️ Не плутати з order.comment — то коментар клієнта з оформлення.
router.get('/orders/:numberOfOrder/journal', authAdm, ctrl.getOrderJournal);
router.post('/orders/:numberOfOrder/journal', authAdm, ctrl.createOrderJournalNote);
// Внутрішня примітка — одне поточне значення замовлення (історія — у журналі).
router.patch('/orders/:numberOfOrder/note', authAdm, ctrl.setOrderNote);
router.post('/contacts/:id/activities', authAdm, ctrl.createContactActivity);
















module.exports = router;
