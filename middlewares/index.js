const validateBody = require('./validateBody');
const isValidId = require('./isValidId');
const auth = require('./auth');
const upload = require('./upload');
const authAdm = require('./authAdm')

module.exports = {
  validateBody,
  isValidId,
  auth,
  upload,
  authAdm
};
