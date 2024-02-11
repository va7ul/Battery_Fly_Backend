const express = require('express');
const { auth, validateBody, isValidId } = require('../../middlewares');
const { schemas } = require('../../models/contact');
const ctrl = require('../../controllers/contacts');

const router = express.Router();

router.get('/', auth, ctrl.getAll);

router.get('/:contactId', auth, isValidId, ctrl.getById);

router.post('/', auth, validateBody(schemas.addSchema), ctrl.add);

router.put(
  '/:contactId',
  auth,
  isValidId,
  validateBody(schemas.addSchema),
  ctrl.updateById
);

router.patch(
  '/:contactId/favorite',
  auth,
  isValidId,
  validateBody(schemas.updateFavoriteSchema),
  ctrl.updateStatusContact
);

router.delete('/:contactId', auth, isValidId, ctrl.deleteById);

module.exports = router;
