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




module.exports = router;
