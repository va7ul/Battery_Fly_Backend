const express = require('express');
const { validateBody, auth} = require('../../middlewares');
const { schemas } = require('../../models/user');
const ctrl = require('../../controllers/auth');

const router = express.Router();

router.post('/signup', validateBody(schemas.registerSchema), ctrl.register);

router.post('/signin', validateBody(schemas.loginSchema), ctrl.login);

router.post('/signout', auth, ctrl.logout);

router.get('/current', auth, ctrl.getCurrent);

router.post('/forgot-password', ctrl.forgotPassword);



module.exports = router;
