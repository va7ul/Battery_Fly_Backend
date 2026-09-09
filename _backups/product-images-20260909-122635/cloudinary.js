const cloudinary = require('../node_modules/cloudinary/lib/v2/index');
const removeFiles = require('./removeFiles');
// import { v2 as cloudinary } from 'cloudinary';
const { CLOUD_NAME, CLOUD_API_KEY, CLOUD_API_SECRET } = process.env;

          


const cloudImageProduct = async (files) => {

    cloudinary.config({
        cloud_name: CLOUD_NAME,
        api_key: CLOUD_API_KEY,
        api_secret: CLOUD_API_SECRET
    });
    
     let images =[];
  
  for (let i = 0; i < files.length; i++){
    let names = "";
    let path = "";
    if (files[i].filename) {
      names = files[i].filename.split(".")
      path = files[i].path;
    }

    if (files[i].name) {
      names = files[i].name.split(".")
      path = files[i].path;
    }
      
    
    const res = await cloudinary.uploader.upload(path,
        {
            public_id: names[0],
            transformation: [
              { width: 518, crop: "scale" },
              { fetch_format: "auto" }
            ],
            folder: "images"
         },
        function (error, result) { return result });
      
      images.push(res.secure_url)
      
      await removeFiles(path)
  }
  return images
};

module.exports = {
    cloudImageProduct
};