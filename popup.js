// 公共工具方法
const utils = {
  // 获取当前活动标签页
  fetchCurrentTab: async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    return tab?.id ? tab : Promise.reject('未找到活动标签页');
  },

  // 获取当前域名
  getCurrentHost: async () => {
    const tab = await utils.fetchCurrentTab();
    return new URL(tab.url).host;
  },

  // 统一更新状态
  updateStatus: (element, text, isError = false) => {
    element.textContent = text;
    if (isError) {
      element.style.color = '#dc3545';
    } else {
      element.style.color = '';
    }
  },

  // 统一错误处理
  handleError: (error, statusElement) => {
    utils.updateStatus(statusElement, `发生错误：${error.message}`, true);
    chrome.runtime.sendMessage({
      action: 'showLog',
      message: error.stack || error.toString()
    });
  }
};

// 通用操作处理器
const actionHandler = {
  // 通用数据获取方法
  fetchData: async (suffix = '') => {
    const host = await utils.getCurrentHost();
    const response = await chrome.runtime.sendMessage({
      action: 'getErrorData',
      host,
      suffix
    });

    if (!response?.value) {
      throw new Error('未能获取有效响应数据');
    }

    return {
      data: response.value,
      storageKey: response.key
    };
  },

  // 通用下载处理器
  handleDownload: (params, statusElement) => {
    chrome.runtime.sendMessage({
      action: params.action,
      value: params.data,
      key: params.storageKey
    });

    utils.updateStatus(
      statusElement,
      `共记录 ${params.data.length} 条${params.type}，文件开始下载`
    );
  }
};

// 事件监听器初始化
function initListeners() {
  const statusDiv = document.getElementById('status');

  // 捕获操作事件
  document.getElementById('captureButton').addEventListener('click', async () => {
    try {
      utils.updateStatus(statusDiv, '正在捕获操作记录...');

      const { data, storageKey } = await actionHandler.fetchData( '_actions');

      if (data.length === 0) {
        utils.updateStatus(statusDiv, '未检测到任何操作记录');
        return;
      }

      actionHandler.handleDownload({
        action: 'downloadActions',
        data,
        storageKey,
        type: '操作记录'
      }, statusDiv);

    } catch (error) {
      utils.handleError(error, statusDiv);
    }
  });

  // Avaya 日志下载
  document.getElementById('avayaButton').addEventListener('click', async () => {
    try {
      utils.updateStatus(statusDiv, '正在获取Avaya日志...');

      const tab = await utils.fetchCurrentTab();
      const checkResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => ({
          exists: typeof window.myDBExport === 'function',
          isAvailable: 'myDBExport' in window
        })
      });

      if (!checkResult[0]?.result?.exists) {
        throw new Error('myDBExport 函数不可用');
      }

      const execResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        args: ['avaya'],
        func: (param) => {
          try {
            return window.myDBExport(param);
          } catch (e) {
            throw new Error(`函数执行失败: ${e.message}`);
          }
        }
      });

      if (execResult[0]?.result?.error) {
        throw new Error(execResult[0].result.error);
      }

      utils.updateStatus(statusDiv, 'Avaya日志下载成功');

    } catch (error) {
      utils.handleError(error, statusDiv);
    }
  });

  // 存储错误日志下载
  document.getElementById('storageButton').addEventListener('click', async () => {
    try {
      utils.updateStatus(statusDiv, '正在获取存储错误...');

      const { data, storageKey } = await actionHandler.fetchData();

      if (data.length === 0) {
        utils.updateStatus(statusDiv, '未检测到错误记录');
        return;
      }

      actionHandler.handleDownload({
        action: 'downloadStorageError',
        data,
        storageKey,
        type: '错误记录'
      }, statusDiv);

    } catch (error) {
      utils.handleError(error, statusDiv);
    }
  });

  // 错误网络请求下载
  document.getElementById('urlButton').addEventListener('click', async () => {
    try {
      utils.updateStatus(statusDiv, '正在获取错误网络请求...');

      const { data, storageKey } = await actionHandler.fetchData('_request');

      if (data.length === 0) {
        utils.updateStatus(statusDiv, '未检测到错误记录');
        return;
      }

      actionHandler.handleDownload({
        action: 'downloadErrorRequest',
        data,
        storageKey,
        type: '错误记录'
      }, statusDiv);

    } catch (error) {
      utils.handleError(error, statusDiv);
    }
  });
}

// 初始化执行
document.addEventListener('DOMContentLoaded', initListeners);
