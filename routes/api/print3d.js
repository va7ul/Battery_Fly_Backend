const express = require('express');
const { validateBody, auth, upload } = require('../../middlewares');

const ctrl = require('../../controllers/print3d');

const router = express.Router();

router.get('/', ctrl.get3dPrint);
router.post('/', upload.single('file'),ctrl.add3dPrintOrder);


module.exports = router;