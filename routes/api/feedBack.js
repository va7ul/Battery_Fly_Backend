const express = require('express');
const { validateBody } = require('../../middlewares');
const { schemas } = require('../../models/feedback');

const ctrl = require('../../controllers/feedback');

const router = express.Router();

router.post('/', ctrl.addFeedBack);



module.exports = router;