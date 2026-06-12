const fs = require("fs");

const getUserKey = (from) => {
  return `${from.first_name}_${from.last_name}_${from.username}`;
};

function deleteFileAfterDelay(imagePath, delay) {
  setTimeout(() => {
    fs.unlink(imagePath, (err) => {
      if (err) {
        console.error("Failed to delete image:", err);
      } else {
        console.log(`Deleted image: ${imagePath}`);
      }
    });
  }, delay);
}

module.exports = {
  getUserKey,
  deleteFileAfterDelay,
};
