class StorageRecorder {
	getStorageKey() {
		return `storage_${window.location.host}`;
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
				self.handleStorageError(e, type, key);
			}
		};

		storage.removeItem = function(key) {
			try {
				originalRemoveItem.call(this, key);
			} catch (e) {
				self.handleStorageError(e, type, key);
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

	handleStorageError(error, storageType, key = '') {
		const errorInfo = {
			storageType,
			error: {
				name: error.name,
				message: error.message,
				key
			},
			timestamp: new Date().toISOString()
		};

		const storageKey = this.getStorageKey();

		window.postMessage({
			type: '__EXTENSION_SAVE_ACTION__', // 自定义消息类型
			payload: {
				key: storageKey,
				value: errorInfo,
			}
		}, '*');
	}
}
const storageRecorder = new StorageRecorder();
storageRecorder.wrapStorage(window.localStorage, 'localStorage');
storageRecorder.wrapStorage(window.sessionStorage, 'sessionStorage');