const HttpError = require('./HttpError');
const ctrlWrapper = require('./ctrlWrapper');
const sendEmail = require('./sendEmailNodemailer');
const {cloudImageProduct} = require('./cloudinary');
const productImages = require('./productImages');
const removeFiles = require('./removeFiles');
const { notifyNewOrder, notifyNewFeedback } = require('./telegram');
const orderStatus = require('./orderStatus');
const settings = require('./settings');
const messageTemplates = require('./messageTemplates');
const { renderTemplate, PLACEHOLDERS } = require('./renderTemplate');

module.exports = {
  HttpError,
  ctrlWrapper,
  sendEmail,
  cloudImageProduct,
  ...productImages,
  removeFiles,
  notifyNewOrder,
  notifyNewFeedback,
  ...orderStatus,
  ...settings,
  ...messageTemplates,
  renderTemplate,
  PLACEHOLDERS
};
