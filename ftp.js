const FtpServer = require("ftp-srv");
const path = require("path");
const fs = require("fs");
const express = require("express");
const app = express();
const { recordImageReceiveTime } = require("./metrics");
//CONFIG
let localIp = "0.0.0.0";
const PASV_URL = process.env.HOST_IP_ADDRESS || localIp;
const FTP_PORT = process.env.FTP_PORT || "2121";
const LAN_IP = require("ip").address();
//STATE VARIABLES
let initialized = false;

// APP
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send(
    "📸 Sony FTP Server is running! Please point your camera to ftp://" +
      PASV_URL +
      ":2121 with the configured credentials.",
  );
});

app.listen(8080, () => {
  console.log(`📡 Web server running on http://${PASV_URL}:3000`);
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

const init = (onImageUploaded, onLogin) => {
  if (initialized) {
    console.warn("FTP Server is already initialized.");
    return;
  }

  const ftpServer = new FtpServer({
    url: `ftp://0.0.0.0:${FTP_PORT}`,

    // 1. MUST be your computer's actual local network IP on your router!
    pasv_url: PASV_URL,

    // 2. Explicitly bound range for the dynamic data channels
    pasv_min: 10021,
    pasv_max: 10030,
    max_connections: 2,
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
    console.log(`📍 LAN IP: ${LAN_IP}`);
    console.log(`🔢 Port:      ${FTP_PORT}`);
    console.log(`👤 Username:  ${process.env.FTP_USERNAME}`);
    console.log(`📂 Destination: ${UPLOAD_DIR}`);
    console.log(`📂 Edited destination: ${PROCESSED_DIR}`);
    console.log(`===================================================`);
  });

  // Optional: Basic file watcher to trigger a "bot push" simulation instantly
  fs.watch(UPLOAD_DIR, (eventType, filename) => {
    // console.log(`[FTP Watcher] Detected ${eventType} on ${filename}`);
    let startTime = Date.now();
    if (eventType === "rename" && filename) {
      console.log(`[FTP Watcher] Detected new file: ${filename}`);
      imagesWritten.set(
        filename,
        setTimeout(async () => {
          await handleImageReceived(filename, startTime);
        }, 6000),
      );
    }

    if (eventType === "change" && filename) {
      clearTimeout(imagesWritten.get(filename));
      imagesWritten.set(
        filename,
        setTimeout(async () => {
          await handleImageReceived(filename, startTime);
        }, 4000),
      );
    }
  });

  const handleImageReceived = async (filename, startTime) => {
    const filePath = path.join(UPLOAD_DIR, filename);

    if (fs.existsSync(filePath)) {
      recordImageReceiveTime(startTime);
      imagesWritten.delete(filename);

      await onImageUploaded(filePath, filename);
    }
  };

  initialized = true;
};

module.exports = init;
