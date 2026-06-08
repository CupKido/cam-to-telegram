const fs = require("fs");

const USERS_DATA_FILE = "signed_in_users.txt";

const saveUserData = (username, id) => {
  if (signedInUsers.has(username)) {
    console.log(`User ${username} is already signed in.`);
    return;
  }
  signedInUsers.set(username, id);
  const userData = `${username}|||${id}\n`;

  fs.appendFile(USERS_DATA_FILE, userData, (err) => {
    if (err) {
      console.error("Failed to save user data:", err);
    } else {
      console.log("User data saved successfully.");
    }
  });
};

const extractUsersData = () => {
  const users = new Map();
  const userData = fs.readFileSync(USERS_DATA_FILE, "utf-8");
  const lines = userData.split("\n");

  for (const line of lines) {
    const [user, id] = line.split("|||");
    users.set(user, id);
  }

  return users;
};

const signedInUsers = extractUsersData();

module.exports = {
  saveUserData,
  getUsers: () => signedInUsers,
  getUserId: (username) => signedInUsers.get(username),
};
