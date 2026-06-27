const FtpServer = require("ftp-srv");
const { randomUUID } = require("crypto");
const http = require("http");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");
const https = require("https");
const app = express();
const {
  recordImageReceiveTime,
  onFTPClientConnected,
  onFTPClientDisconnected,
} = require("./metrics");
//CONFIG
let localIp = "0.0.0.0";
const PASV_URL = process.env.HOST_IP_ADDRESS || localIp;
const FTP_PORT = process.env.FTP_PORT || "2121";
const LAN_IP = require("ip").address();
const FTP_TLS_KEY = process.env.FTP_TLS_KEY;
const FTP_TLS_CERT = process.env.FTP_TLS_CERT;

// Build TLS options when both key and cert paths are provided
let tlsOptions = null;
if (FTP_TLS_KEY && FTP_TLS_CERT) {
  try {
    tlsOptions = {
      key: fs.readFileSync(FTP_TLS_KEY),
      cert: fs.readFileSync(FTP_TLS_CERT),
    };
    console.log("[FTP] TLS is enabled.");
  } catch (err) {
    console.error(`[FTP] Failed to load TLS files: ${err.message}`);
    process.exit(1);
  }
}
const server = tlsOptions
  ? https.createServer(tlsOptions, app)
  : http.createServer(app);
//STATE VARIABLES
let initialized = false;
let latestDisplayImage = null;
let latestDisplayPayload = null;
const displayImages = new Map();
const DISPLAY_PAGE_PATH = path.join(__dirname, "public", "display.html");
const DISPLAY_PAGE_HTML = fs.readFileSync(DISPLAY_PAGE_PATH, "utf8");
const MAX_DISPLAY_IMAGES = 100;

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

app.get("/display", (req, res) => {
  res.type("html").send(DISPLAY_PAGE_HTML);
});

app.get("/display/latest-image", (req, res) => {
  if (!latestDisplayImage) {
    res.status(404).send("No image available yet.");
    return;
  }

  res.set("Cache-Control", "no-store");
  res.type(latestDisplayImage.mimeType).send(latestDisplayImage.buffer);
});

app.get("/display/image/:imageId", (req, res) => {
  const image = displayImages.get(req.params.imageId);
  if (!image) {
    res.status(404).send("Image not found.");
    return;
  }

  res.set("Cache-Control", "no-store");
  res.type(image.mimeType).send(image.buffer);
});

const displayUpdatesServer = new WebSocketServer({
  server,
  path: "/display-updates",
});

displayUpdatesServer.on("connection", (socket) => {
  if (latestDisplayPayload) {
    sendDisplayPayload(socket, latestDisplayPayload);
  }
});

server.listen(8080, () => {
  const protocol = tlsOptions ? "https" : "http";
  const label = tlsOptions ? "🔒 Secure" : "📡 Web";
  console.log(`${label} server running at ${protocol}://${PASV_URL}:8080`);
});

const UPLOAD_DIR = path.join(__dirname, "uploaded_photos");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

const imagesWritten = new Map();

const IMAGE_MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};
const DISPLAY_AUTO_ORIENT_EXTENSIONS = new Set([".jpg", ".jpeg", ".tif", ".tiff"]);

const broadcastDisplayUpdate = async (filePath, filename) => {
  try {
    const displayImage = await getDisplayImage(filePath, filename);
    const imageId = randomUUID();
    storeDisplayImage(imageId, displayImage);
    latestDisplayImage = displayImage;
    latestDisplayPayload = {
      filename,
      imageUrl: `/display/image/${imageId}`,
    };

    const openClients = Array.from(displayUpdatesServer.clients).filter(
      (client) => client.readyState === WebSocket.OPEN,
    );

    openClients.forEach((client) => {
      sendDisplayPayload(client, latestDisplayPayload);
    });
  } catch (error) {
    console.error(`[Display] Failed to broadcast image ${filename}:`, error);
  }
};

const sendDisplayPayload = (socket, payload) => {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    socket.send(JSON.stringify(payload));
  } catch (error) {
    console.error("[Display] Failed to send websocket payload:", error);
  }
};

const getImageMimeType = (filename) => {
  return IMAGE_MIME_TYPES[path.extname(filename).toLowerCase()] || "image/jpeg";
};

const getDisplayImage = async (filePath, filename) => {
  const mimeType = getImageMimeType(filename);

  if (!DISPLAY_AUTO_ORIENT_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
    return {
      buffer: await fs.promises.readFile(filePath),
      mimeType,
    };
  }

  try {
    return {
      buffer: await sharp(filePath).rotate().toBuffer(),
      mimeType,
    };
  } catch (error) {
    console.error(`[Display] Failed to auto-orient image ${filename}:`, error);

    return {
      buffer: await fs.promises.readFile(filePath),
      mimeType,
    };
  }
};

const storeDisplayImage = (imageId, image) => {
  displayImages.set(imageId, image);

  if (displayImages.size > MAX_DISPLAY_IMAGES) {
    const oldestImageId = displayImages.keys().next().value;
    displayImages.delete(oldestImageId);
  }
};

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
    ...(tlsOptions && { tls: tlsOptions }),
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
        onFTPClientConnected();

        connection.on("STOR", async (error, filePath) => {
          if (error) {
            console.error(`[FTP] Error uploading file ${filePath}:`, error);
            return;
          }

          const filename = path.basename(filePath);

          if (imagesWritten.get(filename)) {
            recordImageReceiveTime(imagesWritten.get(filename));
          }

          await handleImageReceived(filePath, filename);
        });

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
    console.log(`🔒 TLS:       ${tlsOptions ? "enabled (FTPS)" : "disabled"}`);
    console.log(`===================================================`);
  });

  ftpServer.on("disconnect", ({ connection, id, newConnectionCount }) => {
    console.log(`[FTP] disconnected: ${id}`);
    onFTPClientDisconnected();
  });

  fs.watch(UPLOAD_DIR, (eventType, filename) => {
    if (eventType === "rename" && filename) {
      imagesWritten.set(filename, Date.now());
      setTimeout(() => {
        if (imagesWritten.get(filename)) {
          imagesWritten.delete(filename);
        }
      }, 120000);
    }
  });

  const handleImageReceived = async (filePath, filename) => {
    imagesWritten.delete(filename);

    await broadcastDisplayUpdate(filePath, filename);
    await onImageUploaded(filePath, filename);
  };

  initialized = true;
};

module.exports = init;
