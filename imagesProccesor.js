const path = require("path");
const gm = require("gm").subClass({ imageMagick: "7+" });
const { recordImageProcessTime, onImageProcessFailed } = require("./metrics");
const fs = require("fs");

const PROCESSED_DIR = path.join(__dirname, "processed_photos");
if (!fs.existsSync(PROCESSED_DIR)) {
  fs.mkdirSync(PROCESSED_DIR);
}

const DEFAULT_PRESET_KEY = "autoExposure";
const PRESET_OPTIONS = [
  { key: "autoExposure", label: "Auto Exposure" },
  { key: "vivid", label: "Vivid" },
  { key: "blackAndWhite", label: "Black & White" },
  { key: "original", label: "Original (No Edit)" },
];

const isPresetSupported = (presetKey) => {
  return PRESET_OPTIONS.some((option) => option.key === presetKey);
};

const buildOutputPath = (filename, presetKey) => {
  return path.join(__dirname, "processed_photos", `${presetKey}_${filename}`);
};

async function applyPreset(inputPath, filename, presetKey = DEFAULT_PRESET_KEY) {
  const activePreset = isPresetSupported(presetKey)
    ? presetKey
    : DEFAULT_PRESET_KEY;

  if (activePreset === "original") {
    return inputPath;
  }

  const startTime = Date.now();
  const outputPath = buildOutputPath(filename, activePreset);

  try {
    await new Promise((resolve, reject) => {
      let imagePipeline = gm(inputPath).autoOrient();

      if (activePreset === "autoExposure") {
        imagePipeline = imagePipeline.modulate(110, 90).level("5%", "90%", 1.05);
      } else if (activePreset === "vivid") {
        imagePipeline = imagePipeline.modulate(120, 120).contrast(1);
      } else if (activePreset === "blackAndWhite") {
        imagePipeline = imagePipeline.colorspace("GRAY").contrast(1);
      }

      imagePipeline.quality(100).write(outputPath, function (err) {
        if (err) {
          console.error(`Error applying preset ${activePreset}:`, err);
          return reject(err);
        }

        console.log(`Preset ${activePreset} applied.`);
        recordImageProcessTime(startTime);

        resolve();
      });
    });

    return outputPath;
  } catch (err) {
    console.error(`Failed to process preset ${activePreset}, returning original:`, err);
    onImageProcessFailed();

    return inputPath;
  }
}

module.exports = {
  DEFAULT_PRESET_KEY,
  PRESET_OPTIONS,
  isPresetSupported,
  applyPreset,
};
