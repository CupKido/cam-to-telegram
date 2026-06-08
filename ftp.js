const FtpServer = require("ftp-srv");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const gm = require("gm").subClass({ imageMagick: "7+" });

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
// 1. Get your computer's local IP address (e.g., 192.168.X.X from your hotspot)
const { networkInterfaces } = require("os");
const nets = networkInterfaces();
let localIp = "127.0.0.1";

for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    // Skip over non-IPv4 and internal (i.e. loopback) addresses
    if (net.family === "IPv4" && !net.internal) {
      localIp = net.address;
    }
  }
}

async function applyAutoExposure(inputPath, filename, callback) {
  // if directory doesn't exist, create it

  const outputPath = path.join(
    __dirname,
    "processed_photos",
    `auto_${filename}`,
  );

  try {
    // await sharp(inputPath)
    //   .normalise() // ◄ This is your "Lightroom Auto-Exposure" engine
    //   .modulate({
    //     brightness: 1.05, // Optional fine-tuning: Adds a 5% baseline lift
    //     saturation: 1.1, // Optional: Boosts saturation by 10% for punchier colors
    //   })
    //   .jpeg({ quality: 100 }) // Compress for fast dispatching to your bot
    //   .toFile(outputPath);

    await gm(inputPath)
      .autoOrient()
      .modulate(110, 90)
      .level("10%", "90%", 1.0)
      .quality(100)
      .write(outputPath, async function (err) {
        if (err) console.log("Error applying auto exposure:", err);
        else {
          console.error("Tonal values adjusted!");
          await callback(outputPath);
        }
      });

    return outputPath;
  } catch (err) {
    console.error("Failed to process auto exposure:", err);
  }
}

const init = (onImageUploaded) => {
  if (initialized) {
    console.warn("FTP Server is already initialized.");
    return;
  }

  const ftpServer = new FtpServer({
    url: `ftp://${localIp}:2121`,
    pasv_url: localIp, // Crucial for Sony cameras to establish data channels
    anonymous: false,
  });

  // 3. Handle login authentication
  ftpServer.on(
    "login",
    ({ connection, username, password }, resolve, reject) => {
      // Set simple credentials matching what you'll put in the camera
      if (username === "sony" && password === "alpha") {
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

      await applyAutoExposure(filePath, filename, async (processedPath) => {
        if (processedPath) {
          console.log(
            `   ✅ Auto-exposure applied. Processed file: ${processedPath}`,
          );
          await onImageUploaded(processedPath, filename);
        }
      });
    }
  };

  initialized = true;
};

module.exports = init;
