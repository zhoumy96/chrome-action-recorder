class UserActionRecorder {
  static MAX_ACTIONS = 100;
  static EVENTS = ['click', 'input', 'change', 'submit'];

  constructor() {
    this.hasEventListeners = false;
    this.boundHandleEvent = this.handleEvent.bind(this);
    this.initialize();
  }

  getStorageKey() {
    return `userActions_${window.location.host}`;
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
    const storageKey = this.getStorageKey();

    chrome.storage.local.get([storageKey], result => {
      const currentActions = result[storageKey] || [];
      const updatedActions = [...currentActions, action].slice(-UserActionRecorder.MAX_ACTIONS);

      chrome.storage.local.set({ [storageKey]: updatedActions }, () => {
        // console.log(`Actions saved for ${window.location.host}, total: ${updatedActions.length}`);
      });
    });
  }
}

new UserActionRecorder();