const FtpServer = require("ftp-srv");
const path = require("path");
const fs = require("fs");
const express = require("express");
const app = express();

let localIp = "0.0.0.0";
const pasv_url = process.env.HOST_IP_ADDRESS || localIp;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send(
    "📸 Sony FTP Server is running! Please point your camera to ftp://" +
      pasv_url +
      ":2121 with the configured credentials.",
  );
});

app.listen(8080, () => {
  console.log(`📡 Web server running on http://${pasv_url}:3000`);
});

const UPLOAD_DIR = path.join(__dirname, "uploaded_photos");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}
const PROCESSED_DIR = path.join(__dirname, "processed_photos");
if (!fs.existsSync(PROCESSED_DIR)) {
  fs.mkdirSync(PROCESSED_DIR);
}

const imagesWritten = new Map();

let initialized = false;

const init = (onImageUploaded) => {
  if (initialized) {
    console.warn("FTP Server is already initialized.");
    return;
  }

  const ftpServer = new FtpServer({
    url: `ftp://0.0.0.0:${process.env.FTP_PORT || "2121"}`,
    pasv_min: 10022,
    pasv_max: 10024,
    pasv_match: false,
    pasv_url: () => '0.0.0.0',  
    anonymous: false,
  });

  // 3. Handle login authentication
  ftpServer.on(
    "login",
    ({ connection, username, password }, resolve, reject) => {
      // Set simple credentials matching what you'll put in the camera
      if (
        username === process.env.FTP_USERNAME &&
        password === process.env.FTP_PASSWORD
      ) {
        console.log(
          `[FTP] Camera connected successfully from ${connection.remoteAddress}`,
        );

        // Direct the camera to place files into our upload directory
        resolve({ root: UPLOAD_DIR });
      } else {
        console.log(`[FTP] Auth rejected for user: ${username}`);
        reject(new Error("Invalid username or password"));
      }
    },
  );

  // 4. Hook into the file upload completion event
  ftpServer.on("client-error", ({ connection, context, error }) => {
    console.error(`[FTP Error]: ${error.message}`);
  });

  // We watch the server filesystem layer for completed uploads
  ftpServer.listen().then(() => {
    console.log(`===================================================`);
    console.log(`🚀 FTP Server is running and waiting for your Sony!`);
    console.log(`📍 Server IP: ${localIp}`);
    console.log(`🔢 Port:      2121`);
    console.log(`👤 Username:  sony`);
    console.log(`🔑 Password:  alpha`);
    console.log(`📂 Destination: ${UPLOAD_DIR}`);
    console.log(`📂 Edited destination: ${PROCESSED_DIR}`);
    console.log(`===================================================`);
  });

  // Optional: Basic file watcher to trigger a "bot push" simulation instantly
  fs.watch(UPLOAD_DIR, (eventType, filename) => {
    // console.log(`[FTP Watcher] Detected ${eventType} on ${filename}`);
    if (eventType === "rename" && filename) {
      console.log(`[FTP Watcher] Detected new file: ${filename}`);
      imagesWritten.set(
        filename,
        setTimeout(() => handleImageReceived(filename), 6000),
      );
    }

    if (eventType === "change" && filename) {
      clearTimeout(imagesWritten.get(filename));
      imagesWritten.set(
        filename,
        setTimeout(async () => await handleImageReceived(filename), 4000),
      );
    }
  });

  const handleImageReceived = async (filename) => {
    const filePath = path.join(UPLOAD_DIR, filename);

    if (fs.existsSync(filePath)) {
      imagesWritten.delete(filename);
      console.log(
        `📸 [NEW IMAGE RECEIVED]: ${filename} (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)} MB)`,
      );

      await onImageUploaded(filePath, filename);
    }
  };

  initialized = true;
};

module.exports = init;
