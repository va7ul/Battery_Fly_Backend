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

// public_id із URL Cloudinary — без нього видалити файл із хмари неможливо.
//
// У базі лежать самі URL-рядки (формат навмисно не міняли), тож id доводиться
// діставати з адреси:
//   https://res.cloudinary.com/<cloud>/image/upload/v1722435318/images/name.jpg
//                                                  ^^^^^^^^^^^^ версія
//                                                               ^^^^^^^^^^^ public_id
// Тобто: усе після сегмента версії (v + цифри) і без розширення. Папка
// («images/») у public_id ВХОДИТЬ — без неї Cloudinary файл не знайде.
//
// Повертає null для будь-чого, що не схоже на адресу Cloudinary: краще не
// видалити нічого, ніж послати в destroy сміття.
const extractPublicId = (url) => {
    if (typeof url !== 'string' || !url.includes('/upload/')) {
        return null;
    }

    const afterUpload = url.split('/upload/')[1];

    if (!afterUpload) {
        return null;
    }

    const segments = afterUpload.split('/');
    // Версія є не завжди (залежить від налаштувань доставки) — пропускаємо її
    // лише якщо вона справді на місці.
    const withoutVersion = /^v\d+$/.test(segments[0]) ? segments.slice(1) : segments;

    if (withoutVersion.length === 0) {
        return null;
    }

    const publicId = withoutVersion.join('/');
    const lastDot = publicId.lastIndexOf('.');

    return lastDot === -1 ? publicId : publicId.slice(0, lastDot);
};

// Видалення файлу з хмари. НІКОЛИ не кидає далі: фото — це супровід товару, і
// збій у Cloudinary не має завалювати збереження самого товару. Максимум, що
// станеться, — файл лишиться в хмарі сиротою, і це помітно лише в білінгу.
const deleteFromCloudinary = async (publicId) => {
    if (!publicId) {
        return false;
    }

    try {
        cloudinary.config({
            cloud_name: CLOUD_NAME,
            api_key: CLOUD_API_KEY,
            api_secret: CLOUD_API_SECRET
        });

        await cloudinary.uploader.destroy(publicId);

        return true;
    } catch (error) {
        console.error(`Не вдалося видалити ${publicId} з Cloudinary:`, error.message);

        return false;
    }
};

module.exports = {
    cloudImageProduct,
    extractPublicId,
    deleteFromCloudinary
};