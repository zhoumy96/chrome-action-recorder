class UserActionRecorder {
  static MAX_ACTIONS = 100;
  static EVENTS = ['click', 'input', 'change', 'submit'];

  constructor() {
    this.hasEventListeners = false;
    this.boundHandleEvent = this.handleEvent.bind(this);
    this.initialize();
    window.addEventListener('message', this.handleExtensionMessage.bind(this));
  }

  getActionsKey() {
    return `storage_${window.location.host}_actions`;
  }

  initialize() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      this.addEventListeners();
    } else {
      document.addEventListener('DOMContentLoaded', () => this.addEventListeners());
    }
  }

  // 添加事件监听
  addEventListeners() {
    if (this.hasEventListeners) return;

    UserActionRecorder.EVENTS.forEach(eventType => {
      document.addEventListener(eventType, this.boundHandleEvent, true);
    });

    this.hasEventListeners = true;
  }

  handleExtensionMessage(event) {
    if (event.source !== window || !event.data || event.data.type !== '__EXTENSION_SAVE_LOG__') {
      return;
    }
    const { key, value } = event.data.payload;
    this.saveToStorage(key, value);
  }

  // 事件处理入口
  handleEvent(event) {
    this.recordAction(event);
  }

  // 记录操作核心方法
  recordAction(event) {
    try {
      const action = {
        timestamp: new Date().toLocaleString(), // '2025/8/5 10:19:21'
        type: event.type,
        target: this.getElementDescriptor(event.target),
        x: event.clientX || 0,
        y: event.clientY || 0,
        url: window.location.href
      };

      // 处理特殊事件类型
      if (event.type === 'input' || event.type === 'change') {
        action.value = event.target.value;
      }

      this.saveToStorage(this.getActionsKey(), action);
    } catch (error) {
      console.error('Error recording action:', error);
    }
  }

  // 获取元素特征描述
  getElementDescriptor(element) {
    return {
      tagName: element.tagName || '',
      id: element.id || '',
      className: element.className || '',
      innerText: (element.innerText || '').slice(0, 50),
      value: element.value || '',
      href: element.href || '',
      nodeName: element.nodeName || '',
      path: this.getElementPath(element)
    };
  }

  // 生成元素层级路径
  getElementPath(element) {
    try {
      const path = [];
      let currentElement = element;

      while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
        const selector = this.getElementSelector(currentElement);
        path.unshift(selector);
        currentElement = currentElement.parentNode;
      }

      return path.join(' > ');
    } catch (error) {
      console.error('Error getting element path:', error);
      return '';
    }
  }

  // 生成元素选择器
  getElementSelector(element) {
    let selector = element.nodeName.toLowerCase();
    if (element.id) {
      selector += `#${element.id}`;
    } else if (element.className) {
      selector += `.${Array.from(element.classList).join('.')}`;
    }
    return selector;
  }

  async saveToStorage(storageKey, value) {
    const isFull = this.checkStorage();
    if (isFull) {
      await this.batchCleanData();
    }
    chrome.storage.local.get([storageKey], result => {
      const currentErrorInfos = result[storageKey] || [];
      let updatedErrorInfos = [...currentErrorInfos, value];
      // 只记录100条
      updatedErrorInfos = updatedErrorInfos.slice(-UserActionRecorder.MAX_ACTIONS);

      chrome.storage.local.set({ [storageKey]: updatedErrorInfos });
    });
  }

  async checkStorage() {
    return new Promise(resolve => {
      chrome.storage.local.getBytesInUse(bytesInUse => {
        resolve(bytesInUse >= 4.5 * 1024 * 1024); // 4.5MB阈值
      });
    });
  }

  // 清理插件缓存
  async batchCleanData() {
    // 获取所有域名 key
    const allItems = await chrome.storage.local.get(null);
    const domainKeys = Object.keys(allItems).filter(k => k.startsWith("storage_"));

    // 按域名清理数据
    const today = new Date().toDateString();
    const cleanupTasks = domainKeys.map(key => {
      const data = allItems[key];
      const hasTodayData = data.some(item =>
        new Date(item.timestamp).toDateString() === today
      );

      // 动态清理策略
      if (!hasTodayData) {
        return { [key]: [] }; // 当天无数据的，删除全部数据
      } else {
        return {
          [key]: data.slice(-80) // 保留最新80条（删旧20条）
        };
      }
    });

    // 批量写入更新
    await chrome.storage.local.set(Object.assign({}, ...cleanupTasks));
  }
}
function injectMainThreadCode() {
  const script = document.createElement('script');
  // 使用 chrome.runtime.getURL 获取扩展内文件的绝对路径
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove(); // 加载完成后移除 script 标签
  };
  document.documentElement.appendChild(script);
}

// 在页面加载完成后注入
if (['interactive', 'complete'].includes(document.readyState)) {
  document.addEventListener('DOMContentLoaded', injectMainThreadCode);
} else {
  new UserActionRecorder();
  injectMainThreadCode();
}