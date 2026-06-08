const fs = require("fs");

const images_logs = "_images_logs.txt";

const LOGS_DIR = "logs";
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

const logImage = (imagePath, userKey, userId) => {
  const todays_file =
    LOGS_DIR + "/" + new Date().toISOString().split("T")[0] + images_logs;
  if (!fs.existsSync(todays_file)) {
    fs.writeFileSync(todays_file, "");
  }

  const imageLog = `${new Date().toISOString()} - ${imagePath} sending to: ${userKey} (${userId})`;
  fs.appendFileSync(todays_file, imageLog + "\n");
};

const getLogFilesList = () => {
  const files = fs.readdirSync(LOGS_DIR);

  return files
    .filter((file) => file.endsWith(images_logs))
    .map((file) => file.split("_")[0]);
};

const getLogFilePath = (date) => {
  const filePath = `${LOGS_DIR}/${date}${images_logs}`;
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  return null;
};

module.exports = { logImage, getLogFilesList, getLogFilePath };
