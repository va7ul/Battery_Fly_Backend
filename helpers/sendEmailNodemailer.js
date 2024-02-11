require('dotenv').config();
const nodemailer = require('nodemailer');
const { MAILTRAP_USER, MAILTRAP_PASSWORD } = process.env;

const nodemailerConfig = {
  host: 'sandbox.smtp.mailtrap.io',
  port: 2525,
  auth: {
    user: MAILTRAP_USER,
    pass: MAILTRAP_PASSWORD,
  },
};

const transport = nodemailer.createTransport(nodemailerConfig);

// const message = {
//   to: 'vas7ul@gmail.com',
//   from: 'vas7ul@gmail.com',
//   subject: 'Test email',
//   html: '<h1>Test text</h1>',
//   text: 'Test text',
// };

// transport
//   .sendMail(message)
//   .then((res) => console.info(res))
//   .catch((error) => console.error(error));

const sendEmail = async (data) => {
  const message = { ...data, from: 'vas7ul@gmail.com' };
  await transport.sendMail(message);
};

module.exports = sendEmail;
