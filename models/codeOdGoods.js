const { Schema, model } = require('mongoose');

const codeOfGoodsSchema = new Schema({
    codeCounter: {
        type: Number,
        required: [true, 'codeCounter is required'],
        index: true,
        unique: true,
    }
})

const CodeOfGoods = model('codeOfGoods', codeOfGoodsSchema)

module.exports = {
    CodeOfGoods
}