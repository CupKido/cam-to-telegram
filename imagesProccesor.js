const path = require("path");
const gm = require("gm").subClass({ imageMagick: "7+" });

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

module.exports = {
  applyAutoExposure,
};
