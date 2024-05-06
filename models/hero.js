const { Schema, model } = require('mongoose');

const schemas = {
    
}

const HeroSchema = new Schema({
     text: {
        type: String,
        required: [true, 'text is required']
    },
    image: {
        type: String,
        required: [true, 'image is required']
    },
   

},
    { versionKey: false, timestamps: true }
);

const Hero = model('hero', HeroSchema)

module.exports = {
    Hero,
    schemas
}