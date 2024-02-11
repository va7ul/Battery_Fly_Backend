const express = require('express');
const { validateBody, auth, upload } = require('../../middlewares');
const { schemas } = require('../../models/user');
const ctrl = require('../../controllers/auth');

const router = express.Router();

router.post('/register', validateBody(schemas.registerSchema), ctrl.register);

router.get('/verify/:verificationToken', ctrl.verifyEmail);

router.post(
  '/verify',
  validateBody(schemas.varifyEmailSchema),
  ctrl.resendVerifyEmail
);

router.post('/login', validateBody(schemas.loginSchema), ctrl.login);

router.post('/logout', auth, ctrl.logout);

router.get('/current', auth, ctrl.getCurrent);

router.patch(
  '/',
  auth,
  validateBody(schemas.updatedSubscriptionSchema),
  ctrl.updateSubscription
);

router.patch('/avatars', auth, upload.single('avatar'), ctrl.updateAvatar);

module.exports = router;
