// 捕获最近操作和截图
document.getElementById('captureButton').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = '正在捕获...';

  try {
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

    if (!tab) {
      console.log('无法获取当前标签页');
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, {action: 'getActions'}, {frameId: 0});

    if (response && response.actions) {
      if (response.actions.length === 0) {
        statusDiv.textContent = '未检测到任何操作记录';
        return;
      }

      // 发送消息给background script进行截图和下载
      chrome.runtime.sendMessage({
          action: "captureAndDownload",
          actions: response.actions,
          key: response.key,
      });

      statusDiv.textContent = `捕获完成！共记录了 ${response.actions.length} 个操作，文件已开始下载。`;

    } else {
      statusDiv.textContent = '未能获取操作记录';
    }
  } catch (error) {
    statusDiv.textContent = '发生错误：' + error.message;
  }
});
// 下载Avaya日志
document.getElementById('avayaButton').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.id) {
      console.log('未找到活动标签页');
      return;
    }

    // 先检查函数是否存在
    const checkResult = await chrome.scripting.executeScript({
      target: {tabId: tab.id}, world: 'MAIN', // 主环境
      func: () => typeof window.myDBExport === 'function'
    });

    if (!checkResult[0]?.result) {
      // chrome.runtime.sendMessage({ action: 'showLog', message: 'myDBExport 未定义或不是函数'});
      console.log('myDBExport 未定义或不是函数');
      return;
    }

    // 实际调用
    const execResult = await chrome.scripting.executeScript({
      target: {tabId: tab.id}, world: 'MAIN', args: ['avaya'], func: (param) => {
        try {
          return window.myDBExport(param);
        } catch (e) {
          return {error: e.message};
        }
      }
    });

    if (execResult[0]?.result?.error) {
      console.error('函数执行错误:', execResult[0].result.error);
    } else {
      console.log('成功结果:', execResult[0]?.result);
    }
  } catch (error) {
    console.error('扩展错误:', error.message);
  }
});
// 下载Storage错误日志
document.getElementById('storageButton').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.id) {
      console.log('未找到活动标签页');
      return;
    }

  } catch (error) {
    console.error('扩展错误:', error.message);
  }
});