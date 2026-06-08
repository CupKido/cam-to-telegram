const { Telegraf, Markup } = require("telegraf");
const dotenv = require("dotenv");
dotenv.config();
const FTPServer = require("./ftp");
const { saveUserData, getUsers, getUserId } = require("./usersData");

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
let selectedUser = null;

bot.command("myID", (ctx) => {
  ctx.reply(`its ${ctx.from.id}`);
});

bot.command("start", (ctx) => {
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
});

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

FTPServer(async (processedImagePath, filename) => {
  console.log("sending to telegram", processedImagePath);
  if (!selectedUser) {
    console.warn(
      "No user selected. Please use /selectUser to choose a recipient.",
    );
    return;
  }

  const selectedUserId = getUserId(selectedUser);
  await bot.telegram.sendDocument(selectedUserId, {
    source: processedImagePath,
    caption: `Processed image: ${filename}`,
  });
  await bot.telegram.sendMessage(
    selectedUserId,
    `That's a pretty face if I've ever seen one!`,
  );

  setTimeout(() => {
    // Clean up the processed image after sending
    const fs = require("fs");
    fs.unlink(processedImagePath, (err) => {
      if (err) {
        console.error("Failed to delete processed image:", err);
      } else {
        console.log(`Deleted processed image: ${processedImagePath}`);
      }
    });
  }, 5000); // Adjust the delay as needed (e.g., 10 seconds)
});

const getUserKey = (from) => {
  return `${from.first_name}_${from.last_name}_${from.username}`;
};
