const express = require('express');
const ctrl = require('../../controllers/print3d');

const router = express.Router();

router.get('/', ctrl.get3dPrint);


module.exports = router;