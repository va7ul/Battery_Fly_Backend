const multer = require('multer');
const path = require('node:path');

const tempDir = path.join(__dirname, '../', 'uploads');
const multerConfig = multer.diskStorage({
  destination: tempDir,
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage: multerConfig,
});

module.exports = upload.array('files', 10);
