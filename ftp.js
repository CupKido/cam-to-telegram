const FtpServer = require("ftp-srv");
const http = require("http");
const path = require("path");
const fs = require("fs");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");
const app = express();
const server = http.createServer(app);
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
//STATE VARIABLES
let initialized = false;
let latestDisplayImage = null;
let latestDisplayPayload = null;
const DISPLAY_PAGE_PATH = path.join(__dirname, "public", "display.html");
const DISPLAY_PAGE_HTML = fs.readFileSync(DISPLAY_PAGE_PATH, "utf8");

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
  console.log(`📡 Web server running on http://${PASV_URL}:8080`);
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

const broadcastDisplayUpdate = async (filePath, filename) => {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    latestDisplayImage = {
      buffer: fileBuffer,
      mimeType: getImageMimeType(filename),
    };
    latestDisplayPayload = {
      filename,
      imageUrl: "/display/latest-image",
    };

    displayUpdatesServer.clients.forEach((client) => {
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
module.exports.broadcastDisplayUpdate = broadcastDisplayUpdate;
