require('dotenv').config();
const sgMail = require('@sendgrid/mail');
const { SENDGREED_API_KEY } = process.env;

sgMail.setApiKey(SENDGREED_API_KEY);

const message = {
  to: 'vas7ul@gmail.com',
  from: 'vas7ul@gmail.com',
  subject: 'Test email',
  html: '<h1>Test text</h1>',
  text: 'Test text',
};

sgMail
  .send(message)
  .then((res) => console.info(res))
  .catch((error) => console.error(error));

// const sendEmail = async (data) => {
//   const message = { ...data, from: 'vas7ul@gmail.com' };
//   await sgMail.send(message);
//   return true;
// };
