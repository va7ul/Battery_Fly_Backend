const express = require('express');
const { validateBody, authAdm } = require('../../middlewares');
const { schemas } = require('../../models/admin');
const ctrl = require('../../controllers/admin');

const router = express.Router();

router.post('/signin', validateBody(schemas.loginSchema), ctrl.login);
router.post('/signout', authAdm, ctrl.logout);
router.get('/current', authAdm, ctrl.getCurrent);
router.post('/product-add', authAdm, ctrl.addProduct);
router.post('/assemblies-add', authAdm, ctrl.addProductZbirky);

module.exports = router;
