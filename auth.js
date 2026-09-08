/**
 * 激活码认证模块 v27
 * 激活码存储在 Vercel 环境变量中，前端不暴露 API Key
 * 前端只发送激活码到 Vercel 代理验证，验证通过后存储激活码（不存 Key）
 */

// Vercel API 代理地址（部署后替换为实际地址）
var API_PROXY_URL = 'https://ai-ddadsa.vercel.app';

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
 * 应用激活码：发送到 Vercel 代理验证
 * @param {string} code - 激活码
 * @returns {Promise<boolean>} 是否激活成功
 */
async function applyActivation(code) {
    try {
        var response = await fetch(API_PROXY_URL + '/api/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code })
        });

        var data = await response.json();

        if (data.success) {
            localStorage.setItem(AUTH_STORAGE_KEY, code);
            // 清除旧的 aiConfig（不再在前端存储 API Key）
            localStorage.removeItem('aiConfig');
            return true;
        }

        return false;
    } catch (e) {
        console.error('[Auth] Activation error:', e);
        throw new Error('无法连接验证服务器，请检查网络或稍后重试');
    }
}

// 导出到 window 全局
window.auth = {
    getStoredCode: getStoredCode,
    isActivated: isActivated,
    applyActivation: applyActivation,
    API_PROXY_URL: API_PROXY_URL
};
