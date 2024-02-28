const express = require('express');
const { validateBody, auth, upload } = require('../../middlewares');
const { schemas } = require('../../models/user');
const ctrl = require('../../controllers/auth');

const router = express.Router();

router.post('/signup', validateBody(schemas.registerSchema), ctrl.register);

// router.get('/verify/:verificationToken', ctrl.verifyEmail);

// router.post(
//   '/verify',
//   validateBody(schemas.varifyEmailSchema),
//   ctrl.resendVerifyEmail
// );

router.post('/signin', validateBody(schemas.loginSchema), ctrl.login);

router.post('/logout', auth, ctrl.logout);

router.get('/current', auth, ctrl.getCurrent);


module.exports = router;
