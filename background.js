const errorUrls = new Set();

/**
 * 生成操作分析报告
 * 该函数处理给定的原始数据，生成一个详细的操作报告，描述用户在界面上的操作序列
 *
 * @param {Array} rawData - 包含用户操作原始数据的数组，每个元素代表一个操作事件
 * @param {String} actionsText - 原始数据的文本表示，用于在报告末尾显示
 * @returns {String} - 返回一个字符串，包含操作分析报告和原始数据文本
 */
function generateOperationReport(rawData, actionsText) {
  // 预处理：按时间排序 + 合并连续输入事件
  // 这一步是为了确保事件按时间顺序处理，并且合并连续的输入事件以避免重复报告
  const processedData = rawData
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .reduce((acc, curr) => {
      const last = acc[acc.length - 1];

      // 合并连续输入
      // 当前后两个事件都是输入事件且针对同一目标时，用当前事件的值更新最后一个事件的值
      if (last?.type === 'input' &&
        curr.type === 'input' &&
        last.target.id === curr.target.id) {
        last.value = curr.value;
        return acc;
      }

      // 合并change事件
      // 当一个输入事件后面紧跟一个change事件且它们针对同一目标时，标记最后一个事件为确认
      if (last?.type === 'input' &&
        curr.type === 'change' &&
        last.target.id === curr.target.id) {
        last.isConfirmed = true;
        return acc;
      }

      // 将当前事件添加到累积数组中，初始状态为未确认
      acc.push({...curr, isConfirmed: false});
      return acc;
    }, []);

  // 生成描述
  // 遍历处理后的数据，生成每个事件的描述性文本
  const descriptions = [];

  processedData.forEach(event => {
    const time = event.timestamp.split(' ')[1];
    const target = event.target;

    // 输入事件处理
    // 对于输入和change事件，根据事件是否被确认，生成相应的描述文本
    if (['input', 'change'].includes(event.type)) {
      const status = event.isConfirmed ? '完成输入' : '正在输入';
      descriptions.push(
        `[${time}] ${status}「${target.id}」值：${event.value}`
      );
      return;
    }

    // 点击事件处理
    // 对于点击事件，生成描述文本，优先使用元素的innerText，并根据情况添加坐标信息
    if (event.type === 'click') {
      let desc = `点击「${target.id}」`;

      // 优先使用元素文本
      if (target.innerText?.trim()) {
        desc = `点击「${target.innerText.trim()}」`;
      }

      // 如果是链接跳转
      if (target.tagName === 'A') {
        desc = `点击切换到「${target.innerText.trim()}」`;
      }

      // 添加坐标信息
      desc += ` (位置 X:${event.x}, Y:${event.y})`;

      descriptions.push(`[${time}] ${desc}`);
    }
  });

  // 返回操作分析报告，包含操作记录和原始数据文本
  return `
  === 操作分析报告 ===
  操作记录：
  ${descriptions.join('\n')}
  === 报告结束 ===
  === 原始数据 ===
  ${actionsText}
    `;
}

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureAndDownload') {
    // 截图
    chrome.tabs.captureVisibleTab(null, {format: 'png'}, function (screenshotUrl) {
      // 生成时间戳
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // 下载截图
      chrome.downloads.download({
        url: screenshotUrl,
        filename: `screenshot-${timestamp}.png`
      });

      // 创建操作记录文本内容
      const actionsText = JSON.stringify(request.actions, null, 2);
      const reportText = generateOperationReport(request.actions, actionsText);

      // 创建 Data URL
      const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(reportText);

      // 下载操作记录文件
      chrome.downloads.download({
        url: dataUrl,
        filename: `分析报告-${timestamp}.txt`,
        saveAs: false
      });


      // 清除之前的操作记录
      chrome.storage.local.remove(request.key, function () {
        console.log('Previous actions cleared');
      });
    });
  }
  if (request.action === 'showLog') {
    console.log('message.log::', request.message);
  }
  return true;
});