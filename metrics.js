let imageUploadTimeSum = 0;
let imageUploadCount = 0;
let imageProcessTimeSum = 0;
let imageProcessCount = 0;
let imageReceiveTimeSum = 0;
let imageReceiveCount = 0;
let noUserSelectedCount = 0;

const recordImageReceiveTime = (startTime) => {
  const endTime = Date.now();
  const time = endTime - startTime;
  imageReceiveTimeSum += time;
  imageReceiveCount++;
};

const recordImageUploadTime = (startTime) => {
  const endTime = Date.now();
  const time = endTime - startTime;
  imageUploadTimeSum += time;
  imageUploadCount++;
};

const recordImageProcessTime = (startTime) => {
  const endTime = Date.now();
  const time = endTime - startTime;
  imageProcessTimeSum += time;
  imageProcessCount++;
};

const onNoUserSelected = () => {
  noUserSelectedCount++;
};

const resetMetrics = () => {
  imageUploadTimeSum = 0;
  imageUploadCount = 0;
  imageProcessTimeSum = 0;
  imageProcessCount = 0;
  imageReceiveTimeSum = 0;
  imageReceiveCount = 0;
  noUserSelectedCount = 0;
};

const getMetricsReport = () => {
  const averageUploadTime =
    imageUploadCount > 0 ? imageUploadTimeSum / imageUploadCount : 0;
  const averageProcessTime =
    imageProcessCount > 0 ? imageProcessTimeSum / imageProcessCount : 0;
  const averageReceiveTime =
    imageReceiveCount > 0 ? imageReceiveTimeSum / imageReceiveCount : 0;
  return (
    `📊 Metrics Report:\n\n` +
    `Total Images Uploaded: ${imageUploadCount}\n` +
    `Average Upload Time: ${averageUploadTime.toFixed(2)} ms\n` +
    `Total Images Processed: ${imageProcessCount}\n` +
    `Average Process Time: ${averageProcessTime.toFixed(2)} ms\n` +
    `Total Images Received: ${imageReceiveCount}\n` +
    `Average Receive Time: ${averageReceiveTime.toFixed(2)} ms\n` +
    `Total Users Not Selected: ${noUserSelectedCount}\n`
  );
};

module.exports = {
  recordImageUploadTime,
  recordImageProcessTime,
  recordImageReceiveTime,
  onNoUserSelected,
  resetMetrics,
  getMetricsReport,
};
