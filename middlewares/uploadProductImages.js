const multer = require('multer');
const path = require('node:path');

const MAX_FILES = 15;
const MAX_FILE_SIZE_MB = 10;

// Окремий multer ТІЛЬКИ для фото товарів.
//
// ⚠️ Ліміти не можна вішати на спільний `upload`: той самий інстанс обслуговує
// форму 3D-друку, куди клієнти вантажать .stl/.zip/.rar. Обмеження в 10 МБ і
// фільтр на image/* поховали б там реальні замовлення.
const tempDir = path.join(__dirname, '../', 'uploads');

const storage = multer.diskStorage({
  destination: tempDir,
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const uploadProductImages = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: MAX_FILES,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }

    // Помилку віддаємо через колбек, а не throw: multer тоді сам згорне запит
    // і передасть її в обробник, замість того щоб уронити процес.
    cb(new Error('Дозволені лише зображення'));
  },
});

module.exports = uploadProductImages;
module.exports.MAX_FILES = MAX_FILES;
module.exports.MAX_FILE_SIZE_MB = MAX_FILE_SIZE_MB;
