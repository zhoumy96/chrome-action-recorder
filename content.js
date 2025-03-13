// 用于存储用户操作的数组
const MAX_ACTIONS = 100; // 每个标签页最多保存100个操作

// 获取存储键名
function getStorageKey() {
  const location = window.location;
  // // 处理iframe
  // if (location?.ancestorOrigins[0]) {
  //     const url = location?.ancestorOrigins[0];
  //     const parsedUrl = new URL(url);
  //     const hostname = parsedUrl.hostname;
  //     return 'userActions_' + hostname;
  // }
  return 'userActions_' + window.location.host;
}

// 记录操作的函数
function recordAction(event) {
  try {
    // 创建基本的操作记录
    const action = {
      timestamp: new Date().toLocaleString(),
      type: event.type,
      target: {
        tagName: event.target.tagName || '',
        id: event.target.id || '',
        className: event.target.className || '',
        innerText: (event.target.innerText || '').slice(0, 50),
        value: event.target.value || '',
        href: event.target.href || '',
        nodeName: event.target.nodeName || '',
        path: getElementPath(event.target)
      },
      x: event.clientX || 0,
      y: event.clientY || 0,
      url: window.location.href
    };

    // 添加特定事件类型的额外信息
    if (event.type === 'input' || event.type === 'change') {
      action.value = event.target.value;
    }

    // 获取当前标签页的操作记录
    const storageKey = getStorageKey();
    chrome.storage.local.get([storageKey], function (result) {
      let currentActions = result[storageKey] || [];

      // 添加新操作
      currentActions.push(action);

      // 如果超过100个操作，移除最早的操作
      if (currentActions.length > MAX_ACTIONS) {
        currentActions = currentActions.slice(-MAX_ACTIONS);
      }

      // 保存更新后的操作记录
      chrome.storage.local.set({[storageKey]: currentActions}, function () {
        // console.log('storageKey::', storageKey);
        // console.log(`Actions saved to storage for ${window.location.host}, total: ${currentActions.length}`);
      });
    });
  } catch (error) {
    console.error('Error recording action:', error);
  }
}

// 获取元素的路径
function getElementPath(element) {
  try {
    const path = [];
    let currentElement = element;
    while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
      let selector = currentElement.nodeName.toLowerCase();
      if (currentElement.id) {
        selector += '#' + currentElement.id;
      } else if (currentElement.className) {
        selector += '.' + Array.from(currentElement.classList).join('.');
      }
      path.unshift(selector);
      currentElement = currentElement.parentNode;
    }
    return path.join(' > ');
  } catch (error) {
    console.error('Error getting element path:', error);
    return '';
  }
}

// 监听各种用户操作
const events = [
  'click',
  // 'dblclick',
  'input',
  'change',
  'submit',
  // 'mousedown'
];

// 添加事件监听器
function addEventListeners() {
  events.forEach(eventType => {
    document.addEventListener(eventType, recordAction, true);
  });
}

// 确保文档加载完成后也添加监听器
document.addEventListener('DOMContentLoaded', () => {
  if (!document.hasEventListeners) {
    addEventListeners();
    document.hasEventListeners = true;
  }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getActions') {
    const storageKey = getStorageKey();
    chrome.storage.local.get([storageKey], function (result) {
      const actions = result[storageKey] || [];
      sendResponse({
        actions: actions,
        key: storageKey,
      });
    });
    return true;
  }
});