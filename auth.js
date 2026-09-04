/**
 * 激活码认证模块
 * 激活码 (1~5) → DeepSeek API Key 映射
 * 激活后自动配置 config，用户无需手动填 key
 */

// 激活码 → API Key 映射表
var ACTIVATION_KEYS = {
    'LOVE2024ME': 'sk-8606f02053274262bb6051f955e0f1ea',
    'LOVE-B7X9': 'sk-2f98e08d50804b6fadf819ac4f9650b3',
    'LOVE-C3K8': 'sk-529f0155de4d41efb93232f09246fe6c',
    'LOVE-D5M2': 'sk-c707e7c318634a288eaf54586e84e72f',
    'LOVE-E8Q4': 'sk-3eb51685cc8e424d8c8eafa0b0ebcc39'
};

var AUTH_STORAGE_KEY = 'act_code';

/**
 * 检查激活码是否有效
 * @param {string} code - 激活码 (1~5)
 * @returns {{success:boolean, apiKey?:string}}
 */
function checkActivation(code) {
    if (code && ACTIVATION_KEYS[code]) {
        return { success: true, apiKey: ACTIVATION_KEYS[code] };
    }
    return { success: false };
}

/**
 * 从 localStorage 读取已存储的激活码，验证是否仍然有效
 * @returns {{success:boolean, apiKey?:string, code?:string}}
 */
function getStoredActivation() {
    var code = localStorage.getItem(AUTH_STORAGE_KEY);
    if (code && ACTIVATION_KEYS[code]) {
        return { success: true, apiKey: ACTIVATION_KEYS[code], code: code };
    }
    return { success: false };
}

/**
 * 应用激活码：存储到 localStorage + 自动写入 aiConfig
 * @param {string} code - 激活码
 * @returns {boolean} 是否激活成功
 */
function applyActivation(code) {
    var result = checkActivation(code);
    if (result.success) {
        localStorage.setItem(AUTH_STORAGE_KEY, code);
        // 自动配置：apiKey、base_url、model 一并写入
        var config = {
            apiKey: result.apiKey,
            baseUrl: 'https://api.deepseek.com/v1',
            model: 'deepseek-chat'
        };
        localStorage.setItem('aiConfig', JSON.stringify(config));
        return true;
    }
    return false;
}

/**
 * 检查是否已激活（localStorage 有有效激活码）
 * 如果已激活，确保 config 已正确填充
 * @returns {boolean}
 */
function isActivated() {
    var stored = getStoredActivation();
    if (stored.success) {
        // 确保 config 始终与激活码同步
        var config = {
            apiKey: stored.apiKey,
            baseUrl: 'https://api.deepseek.com/v1',
            model: 'deepseek-chat'
        };
        localStorage.setItem('aiConfig', JSON.stringify(config));
        return true;
    }
    return false;
}

// 导出到 window 全局
window.auth = {
    checkActivation: checkActivation,
    getStoredActivation: getStoredActivation,
    applyActivation: applyActivation,
    isActivated: isActivated
};
