// 常量定义
const STORAGE_PREFIX = 'storage_';
const getStorageKey = (host, suffix = '') => `${STORAGE_PREFIX}${host}${suffix}`;

// 工具函数
const generateTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// 报告生成模块
const ReportGenerator = {
  processEvents: (rawData) => {
    const sortedData = rawData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return sortedData.reduce((acc, curr) => {
      const last = acc[acc.length - 1];

      // 合并连续输入事件
      if (last?.type === 'input' && curr.type === 'input' && last.target.id === curr.target.id) {
        last.value = curr.value;
        return acc;
      }

      // 标记确认的change事件
      if (last?.type === 'input' && curr.type === 'change' && last.target.id === curr.target.id) {
        last.isConfirmed = true;
        return acc;
      }

      return [...acc, { ...curr, isConfirmed: false }];
    }, []);
  },

  generateDescriptions: (processedData) => {
    return processedData.map(event => {
      const time = event.timestamp.split(' ')[1];
      const { target } = event;

      switch (event.type) {
        case 'input':
        case 'change':
          const status = event.isConfirmed ? '完成输入' : '正在输入';
          return `[${time}] ${status}「${target.id}」值：${event.value}`;

        case 'click':
          let desc = target.innerText?.trim() || `点击「${target.id}」`;
          if (target.tagName === 'A') desc = `点击切换到「${target.innerText.trim()}」`;
          return `[${time}] ${desc} (位置 X:${event.x}, Y:${event.y})`;

        default:
          return `[${time}] 未识别操作类型：${event.type}`;
      }
    });
  },

  formatReport: (descriptions, rawText) => {
    return [
      '=== 操作分析报告 ===',
      '操作记录：',
      descriptions.join('\n'),
      '=== 报告结束 ===',
      '=== 原始数据 ===',
      rawText
    ].join('\n');
  }
};

// 下载模块
const DownloadManager = {
  async screenshot() {
    try {
      const screenshotUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      chrome.downloads.download({
        url: screenshotUrl,
        filename: `screenshot-${generateTimestamp()}.png`
      });
    } catch (error) {
      console.error('截图下载失败:', error);
    }
  },

  textFile(content, filenamePrefix) {
    try {
      const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
      chrome.downloads.download({
        url: dataUrl,
        filename: `${filenamePrefix}-${generateTimestamp()}.txt`,
        saveAs: false
      });
    } catch (error) {
      console.error('文件生成失败:', error);
    }
  }
};

// Storage模块
const StorageManager = {
// 获取详细存储信息（分项统计）
  async getDetailedStorageSizes() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const calculateItemSize = (storage) => {
          const details = {};
          let total = 0;
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            const value = storage.getItem(key);
            // 计算单个项目的字节数（UTF-16编码）
            const size = (key.length + value.length) * 2;
            details[key] = parseFloat((size / 1024).toFixed(2)); // KB单位
            total += size;
          }
          return {
            details,
            total: parseFloat((total / (1024 * 1024)).toFixed(2)) // MB单位
          };
        };

        return {
          sessionStorage: calculateItemSize(sessionStorage),
          localStorage: calculateItemSize(localStorage)
        };
      }
    });

    return results[0]?.result || {
      sessionStorage: { details: {}, total: 0 },
      localStorage: { details: {}, total: 0 }
    };
  },

  // 生成可读的报告文本
  formatStorageDetails(data) {
    const format = (storageType, { details, total }) => {
      const items = Object.entries(details)
        .map(([key, size]) => `  [${key}]: ${size}KB`)
        .join('\n');
      return `${storageType} (总计: ${total}MB):\n${items}`;
    };

    return [
      '=== SessionStorage 详情 ===',
      format('SessionStorage', data.sessionStorage),
      '\n=== LocalStorage 详情 ===',
      format('LocalStorage', data.localStorage)
    ].join('\n');
  },

  // 生成完整报告
  formatReport(errorText, storageData) {
    return [
      '=== Storage错误报告 ===',
      errorText.split(),
      '\n=== Storage大小详情 ===',
      this.formatStorageDetails(storageData),
    ].join('\n');
  }

};

// 消息处理器
const MessageHandler = {
  getActions: (host, sendResponse) => {
    const storageKey = getStorageKey(host, '_actions');
    chrome.storage.local.get([storageKey], result => {
      sendResponse({
        value: result[storageKey] || [],
        key: storageKey
      });
    });
  },

  handleDownloadActions: async (request) => {
    await DownloadManager.screenshot();
    const rawText = JSON.stringify(request.value);
    const processedData = ReportGenerator.processEvents(request.value);
    const descriptions = ReportGenerator.generateDescriptions(processedData);
    const report = ReportGenerator.formatReport(descriptions, rawText);

    DownloadManager.textFile(report, '分析报告');
    chrome.storage.local.remove(request.key);
  },

  getStorageErrors: (host, sendResponse) => {
    const storageKey = getStorageKey(host);
    chrome.storage.local.get([storageKey], result => {
      sendResponse({
        value: result[storageKey] || [],
        key: storageKey
      });
    });
  },

  handleDownloadStorageErrors: async (request) => {
    await DownloadManager.screenshot();
    const errorText = JSON.stringify(request.value);
    const storageData = await StorageManager.getDetailedStorageSizes();
    const report = StorageManager.formatReport(errorText, storageData);
    DownloadManager.textFile(report, 'Storage错误报告');
    chrome.storage.local.remove(request.key);
  },
};

// 主消息监听
chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
  try {
    const host = request?.host;
    const action = request.action;

    switch (action) {
      case 'getActions':
        MessageHandler.getActions(host, sendResponse);
        return true; // 保持异步响应

      case 'downloadActions':
        MessageHandler.handleDownloadActions(request);
        break;

      case 'getStorageError':
        MessageHandler.getStorageErrors(host, sendResponse);
        return true;

      case 'downloadStorageError':
        MessageHandler.handleDownloadStorageErrors(request);
        break;

      case 'showLog':
        console.log('[EXTENSION LOG]', request.message);
        break;
    }
  } catch (error) {
    console.error('[消息处理异常]', error);
    sendResponse({ error: error.message });
  }
  return true;
});