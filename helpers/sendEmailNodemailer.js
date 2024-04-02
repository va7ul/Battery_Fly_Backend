require('dotenv').config();
const nodemailer = require('nodemailer');
const { MAIL_USER, MAIL_PASS } = process.env;

const nodemailerConfig = {
host: 'smtp.meta.ua',
  port: 465,
  secure: true,
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS,
  },
};

const transport = nodemailer.createTransport(nodemailerConfig);


const sendEmail = async (data) => {
  console.log(data)
  const message = { ...data };
  await transport.sendMail(message);
};

module.exports = sendEmail;
