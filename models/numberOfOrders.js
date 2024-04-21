const { Schema, model } = require('mongoose');

const numberOfOrdersSchema = new Schema({
    numberOrder: {
        type: Number,
        required: [true, 'numberOrders is required'],
        index: true,
        unique: true,
    }
})

const NumberOfOrders = model('numberOfOrders', numberOfOrdersSchema)

module.exports = {
    NumberOfOrders
}