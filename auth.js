/**
 * 激活码认证模块（纯前端离线版 v29-standalone）
 *
 * 本版本不依赖任何后端服务器：激活码在浏览器本地校验，
 * 校验通过后把该码对应的 DeepSeek Key 写入本地配置，
 * 之后由 ai.js 直接在浏览器调用 DeepSeek（DeepSeek 已允许跨域）。
 *
 * ⚠️ 安全说明：纯前端方案下，激活码与 Key 的映射写在前端代码里，
 *    技术上能被查看网页源码的人看到。此版本用于先跑通/自用；
 *    后续接入 Cloudflare 后端代理后，Key 将移到服务端，前端不再暴露。
 */

// 激活码 -> DeepSeek Key 映射（5 组）
var ACTIVATION_MAP = {
    'ROSE-7K2M9': 'sk-a6271c823fbf4b6c8956d60762277e9d',
    'ROSE-4R8X3': 'sk-56d518a9f2d143c6942fa6e569706b79',
    'ROSE-3N6W7': 'sk-b779b4e94cf6450db9965a1aba1b02a2',
    'ROSE-5Y2L8': 'sk-f2c96603ba07493a88a549b1753a8c33',
    'ROSE-2J8F4': 'sk-acdb51225ff5428abcd88718a68aa0a2'
};

// 默认直连 DeepSeek 官方接口
var DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
var DEFAULT_MODEL = 'deepseek-chat';

var AUTH_STORAGE_KEY = 'act_code';

/**
 * 获取已存储的激活码
 * @returns {string} 激活码或空字符串
 */
function getStoredCode() {
    return localStorage.getItem(AUTH_STORAGE_KEY) || '';
}

/**
 * 检查是否已激活（localStorage 有激活码）
 * @returns {boolean}
 */
function isActivated() {
    return !!getStoredCode();
}

/**
 * 应用激活码：本地校验，并写入对应的 API Key 配置
 * @param {string} code - 激活码
 * @returns {Promise<boolean>} 是否激活成功
 */
async function applyActivation(code) {
    var normalized = String(code || '').trim().toUpperCase();
    var key = ACTIVATION_MAP[normalized];

    if (!key) {
        return false;
    }

    // 记录激活码
    localStorage.setItem(AUTH_STORAGE_KEY, normalized);

    // 写入对应的 API Key（ai.js 直连模式读取这份配置）
    var config = {
        apiKey: key,
        baseUrl: DEFAULT_BASE_URL,
        model: DEFAULT_MODEL
    };
    localStorage.setItem('aiConfig', JSON.stringify(config));
    // 兼容旧字段
    localStorage.setItem('api_key', key);
    localStorage.setItem('base_url', DEFAULT_BASE_URL);
    localStorage.setItem('model', DEFAULT_MODEL);

    return true;
}

// 导出到 window 全局（保留 API_PROXY_URL 字段以兼容 app.js / ai.js 引用，此版本不再使用代理）
window.auth = {
    getStoredCode: getStoredCode,
    isActivated: isActivated,
    applyActivation: applyActivation,
    API_PROXY_URL: ''
};
