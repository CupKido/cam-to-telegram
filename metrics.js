const metrics = {
  imageUploadTimeSum: {
    value: 0,
    name: "Image Upload Time Sum",
    valueType: "ms",
  },
  imageUploadCount: {
    value: 0,
    name: "Image Upload Count",
    valueType: "count",
  },
  imageProcessTimeSum: {
    value: 0,
    name: "Image Process Time Sum",
    valueType: "ms",
  },
  imageProcessCount: {
    value: 0,
    name: "Image Process Count",
    valueType: "count",
  },
  imageReceiveTimeSum: {
    value: 0,
    name: "Image Receive Time Sum",
    valueType: "ms",
  },
  imageReceiveCount: {
    value: 0,
    name: "Image Receive Count",
    valueType: "count",
  },
  noUserSelectedCount: {
    value: 0,
    name: "No User Selected Count",
    valueType: "count",
  },
  imagesFailedProcessCount: {
    value: 0,
    name: "Images Failed Process Count",
    valueType: "count",
  },
  maxProcessTime: { value: 0, name: "Max Image Process Time", valueType: "ms" },
};

const recordImageReceiveTime = (startTime) => {
  const endTime = Date.now();
  const time = endTime - startTime;
  metrics.imageReceiveTimeSum.value += time;
  metrics.imageReceiveCount.value++;
};

const recordImageUploadTime = (startTime) => {
  const endTime = Date.now();
  const time = endTime - startTime;
  metrics.imageUploadTimeSum.value += time;
  metrics.imageUploadCount.value++;
};

const recordImageProcessTime = (startTime) => {
  const endTime = Date.now();
  const time = endTime - startTime;
  metrics.imageProcessTimeSum.value += time;
  metrics.imageProcessCount.value++;
  metrics.maxProcessTime.value = Math.max(metrics.maxProcessTime.value, time);
};

const onNoUserSelected = () => {
  metrics.noUserSelectedCount.value++;
};

const onImageProcessFailed = () => {
  metrics.imagesFailedProcessCount.value++;
};

const resetMetrics = () => {
  Object.keys(metrics).forEach((key) => {
    metrics[key].value = 0;
  });
};

const getMetricsReport = () => {
  const averageUploadTime =
    metrics.imageUploadCount.value > 0
      ? metrics.imageUploadTimeSum.value / metrics.imageUploadCount.value
      : 0;
  const averageProcessTime =
    metrics.imageProcessCount.value > 0
      ? metrics.imageProcessTimeSum.value / metrics.imageProcessCount.value
      : 0;
  const averageReceiveTime =
    metrics.imageReceiveCount.value > 0
      ? metrics.imageReceiveTimeSum.value / metrics.imageReceiveCount.value
      : 0;
  const averageImageHandlingTime =
    averageUploadTime + averageProcessTime + averageReceiveTime;
  return (
    `📊 Metrics Report:\n\n` +
    Object.values(metrics)
      .map(
        (metric) =>
          `- ${metric.name}: ${metric.value} ${metric.valueType ? metric.valueType : ""}`,
      )
      .join("\n") +
    `\n\n⏱️ Average Upload Time: ${averageUploadTime.toFixed(2)} ms` +
    `\n⏱️ Average Process Time: ${averageProcessTime.toFixed(2)} ms` +
    `\n⏱️ Average Receive Time: ${averageReceiveTime.toFixed(2)} ms` +
    `\n\n⏱️ Average Image Handling Time: ${averageImageHandlingTime.toFixed(2)} ms`
  );
};

module.exports = {
  recordImageUploadTime,
  recordImageProcessTime,
  recordImageReceiveTime,
  onNoUserSelected,
  onImageProcessFailed,
  resetMetrics,
  getMetricsReport,
};
