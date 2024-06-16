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
router.post('/change-info', auth, validateBody(schemas.changeInfoSchema), ctrl.changeUserInfo);
router.post('/change-password', auth, validateBody(schemas.changePassSchema),ctrl.changePassword);
router.post('/change-delivery', auth, validateBody(schemas.changeDeliverySchema),ctrl.changeUserDeliveryInfo);



module.exports = router;