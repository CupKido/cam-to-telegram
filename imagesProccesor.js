const path = require("path");
const gm = require("gm").subClass({ imageMagick: "7+" });
const { recordImageProcessTime } = require("./metrics");

async function applyAutoExposure(inputPath, filename, callback) {
  // if directory doesn't exist, create it
  const startTime = Date.now();
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

    await new Promise((resolve, reject) => {
      gm(inputPath)
        .autoOrient()
        .modulate(110, 90)
        .level("5%", "90%", 1.05)
        .quality(100)
        .write(outputPath, function (err) {
          if (err) {
            console.error("Error applying auto exposure:", err);
            return reject(err); // This rejects the promise and throws an error to the outer try/catch
          }

          console.log("Tonal values adjusted!");
          recordImageProcessTime(startTime);

          resolve(); // This tells 'await' that the processing is officially finished
        });
    });

    // Now this callback will only execute AFTER the file is completely written
    await callback(outputPath);

    return outputPath;
  } catch (err) {
    console.error("Failed to process auto exposure:", err);
  }
}

module.exports = {
  applyAutoExposure,
};
