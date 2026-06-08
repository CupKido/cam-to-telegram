const replySentences = [
  "That’s a pretty face if I’ve ever seen one!!! 😍👀❤️✨",
  "Wow youre HOT!!! 🥵🔥❤️‍🔥",
  "Oh my goodness, absolute PERFECTION right here!!! 🥹💖👑",
  "Seriously, how is it even possible to look THIS stunning?!?? 🥰💞",
  "Wow wow WOW, you are literally glowing!!! 🌟❤️‍🔥✨",
  "A literal angel walking among us!!! 😇💞😭❤️",
  "Excuse me?! This heat should be illegal!!! 🚨🔥😮‍💨",
  "Absolutely smoking hot!!! 🥵🌶️💥🔥",
  "Jaw = dropped 🤤❤️‍🔥💥",
  "You are completely UNREAL!!! 😱💖👑",
  "Someone call the fire department ASAP!!! 🧯🔥🥵",
  "You are blinding me with that beauty!!! 😎💖✨",
  "Looked up ‘flawless’ in the dictionary and there’s only this picture!!! 📖💘😍",
  "Showstopper energy right here!!! 🎭❤️‍🔥🙌",
  "Simply breathtaking!!! 😮‍💨💞💖",
  "Sending this straight to a museum because it’s a masterpiece!!! 🖼️🎨💕",
  "I am looking RESPECTFULLY but wow, stunning!!! 😍❤️‍🔥👑",
  "Head turned completely around!!! 🔄👀🥊💖",
  "My heart cannot take this level of gorgeousness!!! 💔❤️‍🔥🚑",
  "Simply unmatched!!! 🥇💞💅🔥",
  "YOOOO, what is target zero?! You look total shesek!!! 😱🍊🔥❤️‍🔥",
  "Listen to me and listen good, you are end of the world hot!!! 🌍💥🥵🔥",
  "No, truly, there are no such things like this beauty!!! 😮‍💨🙌💞👑",
  "Aba ve'Ima, what a face!!! 👨‍👩‍👧‍👦😍❤️‍🔥 validation 100 percent!!!",
  "Imale, what a stunning face if I ever seen one!!! 😱❤️‍🔥👑🔥",
  "SLAYYYY🔥💖❤️‍🔥",
  "Wawaweewa, this face is very nice, I like!!! 💥👍😍❤️‍🔥",
  "King of the castle, king of the castle, WOW!!! 🏰👑👀✨",
  "Kapara! what is this magic?? you look like a million shekels noder neder!!! 💰💎🤩💞",
];

module.exports = () => {
  const randomIndex = Math.floor(Math.random() * replySentences.length);
  return replySentences[randomIndex];
};
