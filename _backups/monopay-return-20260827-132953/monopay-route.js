const express = require('express');
const { validateBody, authAdm } = require('../../middlewares');
const { schemas } = require('../../models/order');
const ctrl = require('../../controllers/monopay');

const router = express.Router();

router.post('/create', validateBody(schemas.createMonopayOrder), ctrl.createMonopayOrder);
router.post('/callback', ctrl.monopayCallback);
router.post('/state/:id', authAdm, ctrl.getMonopayState);
router.post('/confirm/:id', authAdm, ctrl.confirmMonopayOrder);
router.post('/reject/:id', authAdm, ctrl.rejectMonopayOrder);
router.post('/resend/:id', authAdm, ctrl.resendMonopayOrder);

module.exports = router;
