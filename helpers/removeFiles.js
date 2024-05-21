const fs = require('fs').promises;

const removeFiles = async (path) => {
    await fs.unlink(path, function (err) {
    if(err && err.code == 'ENOENT') {
        console.info("File doesn't exist, won't remove it.");
    } else if (err) {
        console.error("Error occurred while trying to remove file");
    } else {
        console.log(`removed`);
    }
    });
}

module.exports = removeFiles;