const express = require('express');
const { validateBody, auth, upload } = require('../../middlewares');
const { schemas } = require('../../models/user');
const ctrl = require('../../controllers/user');

const router = express.Router();

router.get('/favorite', auth, ctrl.getFavorite);
router.post('/favorite/:id', auth, ctrl.addFavorite);
router.get('/verify/:verifyToken', ctrl.verifyEmail);




module.exports = router;