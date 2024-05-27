const express = require('express');
const { validateBody, auth, upload } = require('../../middlewares');
const { schemas } = require('../../models/user');
const ctrl = require('../../controllers/user');

const router = express.Router();

router.get('/favorite', auth, ctrl.getFavorite);
router.post('/favorite/:id', auth, ctrl.addFavorite);
router.delete('/favorite/:id', auth, ctrl.deleteFavorite);
router.get('/verify/:verifyToken', ctrl.verifyEmail);
router.post('/resend', ctrl.resendVerifyEmail);
router.post('/change-info', auth, ctrl.changeUserInfo);
router.post('/change-password', auth, ctrl.changePassword);
router.post('/change-delivery', auth, ctrl.changeUserDeliveryInfo);



module.exports = router;