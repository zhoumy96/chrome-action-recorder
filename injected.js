// 重写Storage方法
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
			type: '__EXTENSION_SAVE_LOG__',
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
// 劫持Fetch和XMLHttpRequest方法
class ErrorRequestMonitor {
	static ERROR_STATUS_CODES = [400, 401, 403, 404, 500, 502, 503];

	constructor() {
		this.parseBody = this.parseBody.bind(this);
		this.parseResponseBody = this.parseResponseBody.bind(this);
		this.wrapXHR();
		this.wrapFetch();
	}

	getStorageKey() {
		return `storage_${window.location.host}_request`;
	}

	isErrorStatus(status, responseBody) {
		const isHttpError = status >= 400 || ErrorRequestMonitor.ERROR_STATUS_CODES.includes(status);
		const isBusinessError = status === 200 && (
			(responseBody?.code !== undefined) &&
			(responseBody.code !== 200) ||
			responseBody?._parseError
		);
		return isHttpError || isBusinessError;
	}

	wrapXHR() {
		const originalXHR = window.XMLHttpRequest;
		const self = this;

		class ErrorMonitorXHR extends originalXHR {
			constructor() {
				super();
				this._request = {};
				this._response = {};
			}

			open(method, url) {
				this._request = { method, url, headers: {} };
				super.open(method, url);
			}

			setRequestHeader(name, value) {
				this._request.headers[name] = value;
				super.setRequestHeader(name, value);
			}

			send(body) {
				// 使用类实例的 parseBody 方法
				this._request.body = self.parseBody(body);

				this.addEventListener('loadend', () => {
					this._response.body = self.parseBody(this.response);
					if (self.isErrorStatus(this.status, this._response.body)) {
						self.reportError({
							type: 'xhr',
							...this._buildReportData()
						});
					}
				});

				super.send(body);
			}

			_buildReportData() {
				return {
					url: this._request.url,
					request: this._request.body,
					response: this._response.body,
					timestamp: Date.now(),
				};
			}

		}

		window.XMLHttpRequest = ErrorMonitorXHR;
	}

	wrapFetch() {
		const originalFetch = window.fetch;
		const self = this;

		window.fetch = async function(input, init = {}) {
			try {
				const response = await originalFetch(input, init);
				const clonedResponse = response.clone();
				const responseBody = await self.parseResponseBody(clonedResponse);

				if (!response.ok || self.isErrorStatus(response.status, responseBody)) {
					const reportData = {
						url: input.url || input,
						request: self.parseBody(init.body),
						response: responseBody,
						timestamp: Date.now(),
					};
					self.reportError(reportData);
				}

				return response;
			} catch (error) {
				throw error;
			}
		};
	}

	// 错误上报
	reportError(data) {
		const storageKey = this.getStorageKey();
		window.postMessage({
			type: '__EXTENSION_SAVE_LOG__',
			payload: {
				key: storageKey,
				value: data,
			}
		}, '*');
	}

	parseBody(body) {
		// 处理空值
		if (body === null || body === undefined) return null;

		let size;
		try {
			if (typeof body === 'string') {
				size = new Blob([body]).size;
			} else if (body instanceof Blob) {
				size = body.size;
			} else if (body instanceof ArrayBuffer) {
				size = body.byteLength;
			} else if (body instanceof FormData) {
				return Object.fromEntries(body.entries());
			} else {
				return body;
			}
		} catch (e) {
			console.warn('Parse body size failed:', e);
			return body;
		}

		// 大小限制1M
		if (size > 1e6) return '[BODY TOO LARGE]';

		if (typeof body === 'string') {
			try { return JSON.parse(body) }
			catch { return body }
		}
		return body;
	}

	async parseResponseBody(response) {
		try {
			const contentType = response.headers.get('content-type') || '';

			// 流式响应元数据
			if (contentType.includes('stream')) {
				return {
					_type: 'stream',
					contentLength: response.headers.get('content-length'),
					contentType
				};
			}

			// 文本类响应
			if (contentType.startsWith('text/')) {
				const text = await response.text();
				return text.length > 1e6 ? '[TEXT TOO LONG]' : text;
			}

			// JSON 响应
			if (contentType.includes('json')) {
				const text = await response.text();
				try {
					return text.length > 1e6 ? '[JSON TOO LARGE]' : JSON.parse(text);
				} catch {
					return { _parseError: true, raw: text.slice(0, 1000) }; // 截断过大数据
				}
			}

			// 二进制响应
			const blob = await response.blob();
			return {
				_type: 'blob',
				size: blob.size,
				type: blob.type
			};
		} catch (error) {
			return {
				_error: error.message,
				_status: response.status
			};
		}
	}
}
new ErrorRequestMonitor();