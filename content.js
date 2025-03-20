class UserActionRecorder {
  static MAX_ACTIONS = 100;
  static EVENTS = ['click', 'input', 'change', 'submit'];

  constructor() {
    this.hasEventListeners = false;
    this.boundHandleEvent = this.handleEvent.bind(this);
    this.initialize();
    this.wrapStorage(localStorage, 'localstorage');
    this.wrapStorage(sessionStorage, 'sessionStorage');
  }

  getStorageKey() {
    return `storage_${window.location.host}`;
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

  // 事件处理入口
  handleEvent(event) {
    this.recordAction(event);
  }

  // 记录操作核心方法
  recordAction(event) {
    try {
      const action = {
        timestamp: new Date().toLocaleString(),
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

      this.saveToStorage(action);
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

  // 保存到chrome.storage
  saveToStorage(action) {
    const storageKey = this.getActionsKey();

    chrome.storage.local.get([storageKey], result => {
      const currentActions = result[storageKey] || [];
      const updatedActions = [...currentActions, action].slice(-UserActionRecorder.MAX_ACTIONS);

      chrome.storage.local.set({ [storageKey]: updatedActions }, () => {
        console.log(`Actions saved for ${window.location.host}, total: ${updatedActions.length}`);
      });
    });
  }

  // 重写Storage方法
  wrapStorage(storage, type) {
    const self = this;
    const originalSetItem = storage.setItem;
    const originalRemoveItem = storage.removeItem;
    const originalClear = storage.clear;
    storage.setItem = function(key, value) {
      try {
        originalSetItem.call(this, key, value);
      } catch (e) {
        self.handleStorageError(e, type, { key, value });
      }
    };

    storage.removeItem = function(key) {
      try {
        originalRemoveItem.call(this, key);
      } catch (e) {
        self.handleStorageError(e, type, { key });
      }
    };

    storage.clear = function() {
      try {
        originalClear.call(this);
      } catch (e) {
        self.handleStorageError(e, type);
      }
    };
  }

  handleStorageError(error, storageType, details = {}) {
    const errorInfo = {
      // type: 'storageError',
      storageType,
      error: {
        name: error.name,
        message: error.message,
        ...details
      },
      timestamp: new Date().toISOString()
    };

    const storageKey = this.getStorageKey();

    chrome.storage.local.get([storageKey], result => {
      const currentErrorInfos = result[storageKey] || [];
      const updatedErrorInfos = [...currentErrorInfos, errorInfo];

      chrome.storage.local.set({ [storageKey]: updatedErrorInfos }, () => {
        // console.log(`Actions saved for ${window.location.host}, total: ${updatedActions.length}`);
      });
    });
    console.error('Storage Error:', errorInfo);
  }
}

new UserActionRecorder();