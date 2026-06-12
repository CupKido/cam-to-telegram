const { Telegraf, Markup } = require("telegraf");
const dotenv = require("dotenv");
dotenv.config();
const StartFTPServer = require("./ftp");
const randomReplySentence = require("./replySentences");
const {
  saveUserData,
  getUsers,
  getUserId,
  getRawUsersData,
} = require("./usersData");
const { logImage, getLogFilesList, getLogFilePath } = require("./imageLogger");
const { getUserKey, deleteFileAfterDelay } = require("./utils");
const imagesProccesor = require("./imagesProccesor");
const {
  getMetricsReport,
  recordImageUploadTime,
  onNoUserSelected,
  resetMetrics,
} = require("./metrics");
//CONFIG
const OWNER_TELEGRAM_ID = process.env.OWNER_TELEGRAM_ID;
const CONCURRENT_UPLOAD_WORKERS = process.env.CONCURRENT_UPLOAD_WORKERS || 2;
const CONCURRENT_PROCESSING_WORKERS =
  process.env.CONCURRENT_PROCESSING_WORKERS || 1;
const MESSAGE_SENTENCE_COOLDOWN_MS = Number(
  process.env.MESSAGE_SENTENCE_COOLDOWN_MS || 2 * 60 * 1000,
);

//STATE VARIABLES
const userToMessageTimeMap = new Map();
const imagesUploadQueue = [];
const imagesProcessingQueue = [];

let messagesNotSendQueue = [];
let selectedUser = null;
let selectedUsers = new Set();

//APP
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

async function imageProcessWorker(workerId) {
  while (true) {
    if (imagesProcessingQueue.length > 0) {
      console.log(
        `Worker ${workerId} is processing an image. Queue length: ${imagesProcessingQueue.length}`,
      );
      await workOnImageProcessTask(imagesProcessingQueue.shift());
    } else {
      // Queue is empty, wait 3 seconds before checking again to avoid burning CPU
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function imageUploadWorker(workerId) {
  while (true) {
    if (imagesUploadQueue.length > 0) {
      console.log(
        `Worker ${workerId} is uploading an image. Queue length: ${imagesUploadQueue.length}`,
      );
      await workOnImageUploadTask(imagesUploadQueue.shift());
    } else {
      // Queue is empty, wait 5 seconds before checking again to avoid burning CPU
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

const startWorkers = () => {
  for (let i = 0; i < CONCURRENT_UPLOAD_WORKERS; i++) {
    imageUploadWorker(`uploading_${i}`);
  }
  for (let i = 0; i < CONCURRENT_PROCESSING_WORKERS; i++) {
    imageProcessWorker(`processing_${i}`);
  }
};

const workOnImageUploadTask = async (uploadTask) => {
  const { userKey, usersKeys, imagePath } = uploadTask;

  try {
    if (usersKeys) {
      await sendImagesToUsers(usersKeys, imagePath);
    } else {
      await sendImageToUser(userKey, imagePath);
    }
  } catch (err) {
    console.error("Failed to send image:", err);
  } finally {
    deleteFileAfterDelay(imagePath, 10000);
  }
};

const workOnImageProcessTask = async (processTask) => {
  const { userKey, usersKeys, imagePath, filename } = processTask;

  const processedImagePath = await imagesProccesor.applyAutoExposure(
    imagePath,
    filename,
  );

  if (!processedImagePath) {
    console.error(`Failed to process image: ${imagePath}. Skipping upload.`);
    return;
  }

  if (processedImagePath !== imagePath) {
    deleteFileAfterDelay(imagePath, 10000);
  }

  imagesUploadQueue.push({
    userKey,
    usersKeys,
    imagePath: processedImagePath,
  });
};

const initializeBot = (botToInitialize) => {
  botToInitialize.command("start", (ctx) => {
    if (getUsers().has(getUserKey(ctx.from))) {
      if (ctx.from.id.toString() === OWNER_TELEGRAM_ID) {
        ctx.reply(
          "Welcome back, owner! Use /selectUser to choose a recipient for the photos.",
        );
        return;
      }

      ctx.reply("Welcome back! Use /myID to get your Telegram ID.");
      return;
    }

    console.log("User signed in:", ctx.from.username, ctx.from.id);
    saveUserData(getUserKey(ctx.from), ctx.from.id);

    ctx.reply(
      `Hello ${ctx.from.first_name}!\n
    Welcome to the CamToTelegram bot!\n
    The owner has been notified of your sign-in.\n
    Don't worry, you'll recieve the processed photos shortly after the shoot!`,
    );
    bot.telegram.sendMessage(
      OWNER_TELEGRAM_ID,
      `New user signed in: ${getUserKey(ctx.from)} (${ctx.from.id})`,
    );
  });

  botToInitialize.command("selectUser", async (ctx) => {
    if (ctx.from.id.toString() !== OWNER_TELEGRAM_ID) {
      ctx.reply("You are not authorized to use this command.");
      return;
    }

    // List all signed-in users
    const userList = Array.from(getUsers().keys()).map((username) =>
      Markup.button.callback(username, "select:" + username),
    );

    await ctx.reply(
      "Please choose a user from the menu below:",
      Markup.inlineKeyboard(userList)
        .resize() // Fits the keyboard nicely on mobile screens
        .oneTime(), // Automatically hides the keyboard after a button is pressed (optional)
    );
  });

  botToInitialize.command("selectUsers", async (ctx) => {
    if (ctx.from.id.toString() !== OWNER_TELEGRAM_ID) {
      ctx.reply("You are not authorized to use this command.");
      return;
    }

    selectedUsers = new Set();

    // List all signed-in users
    const userList = Array.from(getUsers().keys()).map((username) =>
      Markup.button.callback(username, "addtoselected:" + username),
    );

    const clearButton = Markup.button.callback(
      "Clear Selection",
      "clearUsersSelection",
    );

    await ctx.reply(
      "Please choose a user from the menu below:",
      Markup.inlineKeyboard([...userList, clearButton])
        .resize() // Fits the keyboard nicely on mobile screens
        .persistent(), // Keeps the keyboard open after a button is pressed
    );
  });

  botToInitialize.command("getLogs", async (ctx) => {
    if (ctx.from.id.toString() !== OWNER_TELEGRAM_ID) {
      ctx.reply("You are not authorized to use this command.");
      return;
    }

    const logFiles = getLogFilesList().map((date) =>
      Markup.button.callback(date, "getLog:" + date),
    );

    await ctx.reply(
      "Please choose a log file from the menu below:",
      Markup.inlineKeyboard(logFiles)
        .resize() // Fits the keyboard nicely on mobile screens
        .oneTime(), // Automatically hides the keyboard after a button is pressed (optional)
    );
  });

  botToInitialize.command("metrics", async (ctx) => {
    if (ctx.from.id.toString() !== OWNER_TELEGRAM_ID) {
      ctx.reply("You are not authorized to use this command.");

      return;
    }

    const report = getMetricsReport();
    await ctx.reply(report);
  });

  botToInitialize.command("resetMetrics", (ctx) => {
    if (ctx.from.id.toString() !== OWNER_TELEGRAM_ID) {
      ctx.reply("You are not authorized to use this command.");
      return;
    }

    resetMetrics();
    ctx.reply("Metrics have been reset.");
  });

  botToInitialize.command("rawUsersData", (ctx) => {
    if (ctx.from.id.toString() !== OWNER_TELEGRAM_ID) {
      ctx.reply("You are not authorized to use this command.");
      return;
    }

    ctx.reply(getRawUsersData());
  });

  botToInitialize.action(/getLog:(.+)/, async (ctx) => {
    const logFilePath = getLogFilePath(ctx.match[1]);
    if (!logFilePath) {
      ctx.reply("Log file not found.");

      return;
    }

    ctx.replyWithDocument({
      source: logFilePath,
    });
  });

  botToInitialize.action(/select:(.+)/, (ctx) => {
    selectedUser = ctx.match[1];
    ctx.reply(`You have selected: ${selectedUser}`);

    if (messagesNotSendQueue.length > 0) {
      ctx.reply(
        `There are ${messagesNotSendQueue.length} messages waiting to be sent. They will be processed shortly.`,
      );

      messagesNotSendQueue.forEach(({ filePath, filename }) => {
        imagesProcessingQueue.push({
          userKey: selectedUser,
          imagePath: filePath,
          filename,
        });
      });
      messagesNotSendQueue = [];
    }
  });

  botToInitialize.action(/addtoselected:(.+)/, (ctx) => {
    selectedUsers.add(ctx.match[1]);
    ctx.reply(
      `You have selected: ${ctx.match[1]}, total selected: ${selectedUsers.size}`,
    );
  });

  botToInitialize.action("clearUsersSelection", (ctx) => {
    selectedUsers = new Set();
    selectedUser = null;
    ctx.reply("User selection cleared.");
  });

  process.once("SIGINT", () => botToInitialize.stop("SIGINT"));
  process.once("SIGTERM", () => botToInitialize.stop("SIGTERM"));

  botToInitialize.launch();

  botToInitialize.telegram.sendMessage(
    OWNER_TELEGRAM_ID,
    `Bot has been started and is ready to receive images!\n` +
      `Current upload workers: ${CONCURRENT_UPLOAD_WORKERS}\n` +
      `Current processing workers: ${CONCURRENT_PROCESSING_WORKERS}\n` +
      `Listed users count: ${getUsers().size}`,
  );
};

initializeBot(bot);
startWorkers();
StartFTPServer(handleImageReceived);

async function sendImageToUser(userKey, imagePath) {
  const userId = getUserId(userKey);
  logImage(imagePath, userKey, userId);
  try {
    const startTime = Date.now();
    await bot.telegram.sendDocument(userId, {
      source: imagePath,
    });
    await messageUserIfShould(userId);
    recordImageUploadTime(startTime);
  } catch (error) {
    console.error("Failed to send image to user:", error);
  }
}

async function sendImagesToUsers(usersKeys, imagePath) {
  try {
    const startTime = Date.now();
    const message = await bot.telegram.sendDocument(OWNER_TELEGRAM_ID, {
      source: imagePath,
    });
    recordImageUploadTime(startTime);
    const fileId = message.document.file_id;

    await Promise.all(
      usersKeys.map(async (userKey) => {
        const userId = getUserId(userKey);
        logImage(imagePath, userKey, userId);
        await bot.telegram.sendDocument(userId, fileId, {
          caption: "Here is your picture!",
        });
        await messageUserIfShould(userId);
      }),
    );
  } catch (error) {
    console.error("Failed to send image to users:", error);
  }
}

async function handleImageReceived(filePath, filename) {
  if (!selectedUser && selectedUsers.size === 0) {
    console.warn(
      "No user selected. Please use /selectUser to choose a recipient.",
    );
    onNoUserSelected();
    messagesNotSendQueue.push({
      filePath,
      filename,
    });

    return;
  }

  if (selectedUsers.size > 0) {
    imagesProcessingQueue.push({
      usersKeys: Array.from(selectedUsers),
      imagePath: filePath,
      filename,
    });
  } else {
    imagesProcessingQueue.push({
      userKey: selectedUser,
      imagePath: filePath,
      filename,
    });
  }
}

const messageUserIfShould = async (userId) => {
  if (wasMessageSentToUserRecently(userId)) {
    userToMessageTimeMap.set(userId, Date.now());
    await bot.telegram.sendMessage(userId, randomReplySentence());
  }
};

const wasMessageSentToUserRecently = (userId) => {
  return (
    !userToMessageTimeMap.has(userId) ||
    Date.now() - userToMessageTimeMap.get(userId) > MESSAGE_SENTENCE_COOLDOWN_MS
  );
};
