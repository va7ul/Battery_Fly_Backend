const express = require('express');
const { validateBody, authAdm } = require('../../middlewares');
const { schemas } = require('../../models/order');
const ctrl = require('../../controllers/acquiring');

const router = express.Router();

router.post('/create', validateBody(schemas.createAcquiring), ctrl.createAcquiringOrder);
router.post('/webhook', ctrl.acquiringWebhook);
router.get('/status/:id', authAdm, ctrl.getAcquiringStatus);

module.exports = router;
