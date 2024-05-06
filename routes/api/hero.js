const express = require('express');
const ctrl = require('../../controllers/hero');

const router = express.Router();

router.get('/', ctrl.getImage);


module.exports = router;