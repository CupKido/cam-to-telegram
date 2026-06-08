const { Telegraf, Markup } = require("telegraf");
const dotenv = require("dotenv");
dotenv.config();
const FTPServer = require("./ftp");
const randonReplySentence = require("./replySentences");
const { saveUserData, getUsers, getUserId } = require("./usersData");
const path = require("path");
const fs = require("fs");
const gm = require("gm").subClass({ imageMagick: "7+" });

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
let selectedUser = null;

bot.command("myID", (ctx) => {
  ctx.reply(`its ${ctx.from.id}`);
});

bot.command("start", (ctx) => {
  if (ctx.from.id.toString() === process.env.OWNER_TELEGRAM_ID) {
    ctx.reply(
      "Welcome back, owner! Use /selectUser to choose a recipient for the photos.",
    );
    return;
  }

  if (getUsers().has(getUserKey(ctx.from))) {
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
    process.env.OWNER_TELEGRAM_ID,
    `New user signed in: ${getUserKey(ctx.from)} (${ctx.from.id})`,
  );
});

bot.command("selectUser", async (ctx) => {
  if (ctx.from.id.toString() !== process.env.OWNER_TELEGRAM_ID) {
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

bot.action(/select:(.+)/, (ctx) => {
  selectedUser = ctx.match[1];
  ctx.reply(`You have selected: ${selectedUser}`);
  console.log(`Selected user for photo delivery: ${selectedUser}`);
});

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

FTPServer(async (filePath, filename) => {
  await applyAutoExposure(filePath, filename, async (processedImagePath) => {
    if (!selectedUser) {
      console.warn(
        "No user selected. Please use /selectUser to choose a recipient.",
      );
      return;
    }

    console.log("sending to telegram", processedImagePath);

    sendImageToUser(
      getUserId(selectedUser),
      processedImagePath,
      randonReplySentence(),
    );

    deleteImageAfterDelay(filePath, 10000);
    deleteImageAfterDelay(processedImagePath, 30000);
  });
});

const getUserKey = (from) => {
  return `${from.first_name}_${from.last_name}_${from.username}`;
};

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
      .level("5%", "90%", 1.05)
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

async function deleteImageAfterDelay(imagePath, delay) {
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

async function sendImageToUser(userId, imagePath, caption) {
  try {
    await bot.telegram.sendDocument(userId, {
      source: imagePath,
    });
    await bot.telegram.sendMessage(userId, caption);
  } catch (error) {
    console.error("Failed to send image to user:", error);
  }
}
