const { Telegraf, Markup } = require("telegraf");
const dotenv = require("dotenv");
dotenv.config();
const StartFTPServer = require("./ftp");
const randomReplySentence = require("./replySentences");
const { saveUserData, getUsers, getUserId } = require("./usersData");
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
const CONCURRENT_WORKERS = process.env.CONCURRENT_WORKERS || 3;

//STATE VARIABLES
const userToMessageTimeMap = new Map();
const imagesQueue = [];
const messagesNotSendQueue = [];
let selectedUser = null;
let selectedUsers = new Set();

//APP
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

async function imageWorker(workerId) {
  while (true) {
    if (imagesQueue.length > 0) {
      console.log(
        `Worker ${workerId} is processing an image. Queue length: ${imagesQueue.length}`,
      );
      await workOnImagesTask(imagesQueue.shift());
    } else {
      // Queue is empty, wait 3 seconds before checking again to avoid burning CPU
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

const startWorkers = () => {
  for (let i = 0; i < CONCURRENT_WORKERS; i++) {
    imageWorker(i);
  }
};

const workOnImagesTask = async (task) => {
  const { userKey, usersKeys, imagePath, filename } = task;

  await imagesProccesor.applyAutoExposure(
    imagePath,
    filename,
    async (processedImagePath) => {
      deleteFileAfterDelay(imagePath, 10000);
      try {
        if (usersKeys) {
          await sendImagesToUsers(usersKeys, processedImagePath);
        } else {
          await sendImageToUser(userKey, processedImagePath);
        }
      } catch (err) {
        console.error(`Worker ${workerId} failed to send image:`, err);
      } finally {
        deleteFileAfterDelay(processedImagePath, 30000);
      }
    },
  );
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
        imagesQueue.push({
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
};

initializeBot(bot);
bot.launch();
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
    messageUserIfShould(userId);
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

    usersKeys.forEach(async (userKey) => {
      const userId = getUserId(userKey);
      logImage(imagePath, userKey, userId);
      await bot.telegram.sendDocument(userId, fileId, {
        caption: "Here is your picture!",
      });
      messageUserIfShould(userId);
    });
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
    imagesQueue.push({
      usersKeys: Array.from(selectedUsers),
      imagePath: filePath,
      filename,
    });
  } else {
    imagesQueue.push({
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
    Date.now() - userToMessageTimeMap.get(userId) > 60 * 1000
  );
};
