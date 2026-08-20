require('dotenv').config();
const express = require('express');
// const logger = require('morgan');
const cors = require('cors');

const authRouter = require('./routes/api/auth');
const productsRouter = require('./routes/api/products')
const userRouter = require('./routes/api/user')
const orderRouter = require('./routes/api/order')
const print3dRouter = require('./routes/api/print3d')
const feedBackRouter = require('./routes/api/feedBack')
const heroRouter = require('./routes/api/hero')
const adminRouter = require('./routes/api/admin')
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/user', userRouter)
app.use('/api/order', orderRouter)
app.use('/api/3dprint', print3dRouter)
app.use('/api/feedback', feedBackRouter)
app.use('/api/hero', heroRouter)
app.use('/api/adm', adminRouter)








app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err, req, res, next) => {
  const { status = 500, message = 'Server error' } = err;
  res.status(status).json({ message });
});

module.exports = app;
