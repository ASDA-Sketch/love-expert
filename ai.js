/**
 * AI 客户端模块
 * 封装 DeepSeek API（OpenAI 兼容接口）的浏览器直连调用。
 * 通过 localStorage 存储 API Key 等配置，无后端代理。
 * 使用 window 全局导出，浏览器环境直接引用。
 */

// ============================================================
// 配置管理
// ============================================================

/**
 * 读取配置（从 localStorage）
 * @returns {{api_key:string, base_url:string, model:string}}
 */
function getConfig() {
  try {
    var cfg = JSON.parse(localStorage.getItem('aiConfig') || '{}');
    return {
      api_key: cfg.apiKey || localStorage.getItem('api_key') || '',
      base_url: cfg.baseUrl || localStorage.getItem('base_url') || 'https://api.deepseek.com/v1',
      model: cfg.model || localStorage.getItem('model') || 'deepseek-chat'
    };
  } catch (e) {
    return { api_key: '', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' };
  }
}

/**
 * 判断是否处于演示模式（无有效 API Key）
 * @returns {boolean}
 */
function isDemoMode() {
  var cfg = getConfig();
  var key = (cfg.api_key || '').trim();
  if (!key) return true;
  var placeholders = ['sk-your-api-key-here', 'sk-xxx', 'your-api-key', 'placeholder'];
  if (placeholders.indexOf(key) !== -1) return true;
  return false;
}

/**
 * 保存配置到 localStorage
 * @param {string} apiKey
 * @param {string} baseUrl
 * @param {string} model
 */
function saveConfig(apiKey, baseUrl, model) {
  localStorage.setItem('api_key', apiKey);
  localStorage.setItem('base_url', baseUrl);
  localStorage.setItem('model', model);
}

// ============================================================
// JSON 提取
// ============================================================

/**
 * 从 AI 返回文本中提取 JSON
 * 兼容 ```json 代码块、前后多余文字等情况。
 * @param {string} text - AI 返回的原始文本
 * @returns {object|array} 解析后的 JSON 对象
 */
function extractJSON(text) {
  // 尝试提取 ```json ... ``` 代码块
  var codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch (e) {
    // 继续尝试其他方式
  }

  // 尝试找到第一个 { 或 [ 到最后一个 } 或 ]
  var pairs = [['[', ']'], ['{', '}']];
  for (var i = 0; i < pairs.length; i++) {
    var startChar = pairs[i][0];
    var endChar = pairs[i][1];
    var start = text.indexOf(startChar);
    var end = text.lastIndexOf(endChar);
    if (start !== -1 && end !== -1 && end > start) {
      var fragment = text.substring(start, end + 1);
      try {
        return JSON.parse(fragment);
      } catch (e) {
        continue;
      }
    }
  }

  throw new Error('AI 返回内容无法解析为有效 JSON，请重试。');
}

// ============================================================
// AI 调用核心
// ============================================================

/**
 * 直接 fetch 调用 DeepSeek API
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userPrompt - 用户提示词
 * @returns {Promise<string>} AI 返回的文本内容
 */
async function callAI(systemPrompt, userPrompt) {
  var cfg = getConfig();
  var response = await fetch(cfg.base_url + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.api_key
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.8,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    var errText = await response.text();
    throw new Error('HTTP ' + response.status + ': ' + errText);
  }

  var data = await response.json();
  return data.choices[0].message.content;
}

// ============================================================
// 业务功能封装
// ============================================================

/**
 * 话题推荐
 * @param {string} scene - 场景
 * @param {string} background - 背景信息
 * @param {number} contactId - 联系人ID（可选，传入则带历史上下文）
 * @param {string[]} avoid - 之前已生成过的话题文本列表（可选）
 * @returns {Promise<array>} 话题列表 [{content, reason}, ...]
 */
async function recommendTopics(scene, background, contactId, avoid) {
  // 演示模式：直接返回预设数据
  if (isDemoMode()) {
    if (scene === '有趣开场白') {
      return window.DEMO_OPENING_LINES;
    }
    return window.DEMO_TOPICS;
  }

  // 如果有 contactId，从数据库获取上下文
  var context = '';
  if (contactId) {
    context = await window.db.buildContextSummary(contactId, 30);
  }

  try {
    var content = await callAI(
      window.TOPIC_SYSTEM_PROMPT,
      window.buildTopicUserPrompt(scene, background, context, avoid)
    );
    var result = extractJSON(content);
    if (Array.isArray(result)) {
      return result;
    }
    throw new Error('AI 返回格式不正确，请重试。');
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.indexOf('AI 返回') !== -1 || msg.indexOf('JSON') !== -1) {
      throw e;
    }
    throw wrapError(e);
  }
}

/**
 * 对话分析
 * @param {string} message - 用户粘贴的内容
 * @param {boolean} isConversation - 是否为双方对话记录
 * @param {number} contactId - 联系人ID（可选，传入则带历史上下文）
 * @returns {Promise<object>} 分析结果
 */
async function analyzeConversation(message, isConversation, contactId) {
  // 演示模式：直接返回预设数据
  if (isDemoMode()) {
    return window.DEMO_ANALYSIS;
  }

  // 如果有 contactId，从数据库获取上下文
  var context = '';
  if (contactId) {
    context = await window.db.buildContextSummary(contactId, 30);
  }

  try {
    var content = await callAI(
      window.ANALYSIS_SYSTEM_PROMPT,
      window.buildAnalysisUserPrompt(message, isConversation, context)
    );
    var result = extractJSON(content);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result;
    }
    throw new Error('AI 返回格式不正确，请重试。');
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.indexOf('AI 返回') !== -1 || msg.indexOf('JSON') !== -1) {
      throw e;
    }
    throw wrapError(e);
  }
}

/**
 * 引用回复生成
 * @param {string} quotedMessage - 用户引用的对方那句话/那段话
 * @param {string} style - 回复风格/意图
 * @param {string} customIntent - 当 style="guide_topic" 时，用户指定的目标话题（可选）
 * @param {number} contactId - 联系人ID（可选，传入则带历史上下文）
 * @returns {Promise<array>} 回复列表 [{content, reason}, ...]
 */
async function generateReplies(quotedMessage, style, customIntent, contactId) {
  // 演示模式：返回预设样例
  if (isDemoMode()) {
    return window.DEMO_REPLIES[style] || window.DEMO_REPLIES['humor'];
  }

  // 如果有 contactId，从数据库获取上下文
  var context = '';
  if (contactId) {
    context = await window.db.buildContextSummary(contactId, 30);
  }

  try {
    var content = await callAI(
      window.REPLY_SYSTEM_PROMPT,
      window.buildReplyUserPrompt(quotedMessage, style, customIntent, context)
    );
    var result = extractJSON(content);
    if (Array.isArray(result)) {
      return result;
    }
    throw new Error('AI 返回格式不正确，请重试。');
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.indexOf('AI 返回') !== -1 || msg.indexOf('JSON') !== -1) {
      throw e;
    }
    throw wrapError(e);
  }
}

/**
 * 关系推进提醒
 * @param {number} contactId - 联系人ID
 * @returns {Promise<object>} {reminder, reason}
 */
async function getProgressReminder(contactId) {
  // 演示模式：返回预设样例
  if (isDemoMode()) {
    return window.DEMO_PROGRESS_REMINDER;
  }

  var context = '';
  var daysSinceLastMessage = 0;
  if (contactId) {
    context = await window.db.buildContextSummary(contactId, 30);
    // 计算距离上次最后一条消息的天数
    var messages = await window.db.getMessages(contactId);
    if (messages && messages.length > 0) {
      var lastMsg = messages[messages.length - 1];
      try {
        var lastTime = new Date(lastMsg.created_at);
        var now = new Date();
        daysSinceLastMessage = Math.floor((now - lastTime) / (1000 * 60 * 60 * 24));
      } catch (e) {
        daysSinceLastMessage = 0;
      }
    }
  }

  try {
    var content = await callAI(
      window.PROGRESS_REMINDER_SYSTEM_PROMPT,
      window.buildProgressReminderPrompt(context, daysSinceLastMessage)
    );
    var result = extractJSON(content);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result;
    }
    throw new Error('AI 返回格式不正确，请重试。');
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.indexOf('AI 返回') !== -1 || msg.indexOf('JSON') !== -1) {
      throw e;
    }
    throw wrapError(e);
  }
}

// ============================================================
// 测试连接
// ============================================================

/**
 * 测试 API 连接（发一个最小 POST 请求）
 * @returns {Promise<string>} 成功信息
 */
async function testConnection(config) {
  var cfg = config || getConfig();
  if (!cfg || !cfg.api_key || !cfg.api_key.trim()) {
    throw new Error('请先填写 API Key');
  }

  var url = cfg.base_url.replace(/\/+$/, '') + '/chat/completions';

  var response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.api_key.trim()
    },
    body: JSON.stringify({
      model: cfg.model || 'deepseek-chat',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }]
    })
  });

  if (response.status === 401) {
    throw new Error('API Key 无效（401），请检查 Key 是否正确');
  }
  if (response.status === 405) {
    throw new Error('HTTP 405：请检查 Base URL 是否正确（应为 https://api.deepseek.com/v1，不要带 /chat/completions）');
  }
  if (response.status === 404) {
    throw new Error('HTTP 404：地址不存在，请检查 Base URL（应为 https://api.deepseek.com/v1）');
  }
  if (!response.ok) {
    var errText = await response.text();
    throw new Error('HTTP ' + response.status + ': ' + errText.substring(0, 200));
  }

  // 200 OK — try to read model name, don't fail if body is unreadable
  try {
    var data = await response.json();
    return '连接成功！模型：' + (data.model || cfg.model);
  } catch (e) {
    return '连接成功！API 可正常使用。';
  }
}

// ============================================================
// 错误处理
// ============================================================

/**
 * 将底层异常转换为用户友好的错误信息
 * @param {Error} e - 原始异常
 * @returns {Error} 用户友好的错误
 */
function wrapError(e) {
  var errStr = String(e.message || e).toLowerCase();

  // API Key 无效
  if (errStr.indexOf('api key') !== -1 || errStr.indexOf('authentication') !== -1 || errStr.indexOf('401') !== -1) {
    return new Error('API Key 无效或未授权，请检查设置中的 API Key 配置。');
  }

  // 限流
  if (errStr.indexOf('rate limit') !== -1 || errStr.indexOf('429') !== -1) {
    return new Error('请求过于频繁，已被限流，请稍后再试。');
  }

  // 额度不足
  if (errStr.indexOf('quota') !== -1 || errStr.indexOf('billing') !== -1 || errStr.indexOf('insufficient') !== -1) {
    return new Error('API 额度不足或账户余额不够，请检查对应平台的账户状态。');
  }

  // 模型不存在
  if (errStr.indexOf('model') !== -1 && (errStr.indexOf('not found') !== -1 || errStr.indexOf('does not exist') !== -1)) {
    var cfg = getConfig();
    return new Error('模型名称可能有误，请检查设置中的模型名。当前模型：' + cfg.model);
  }

  // 网络错误
  if (errStr.indexOf('connection') !== -1 || errStr.indexOf('timeout') !== -1 || errStr.indexOf('timed out') !== -1 || errStr.indexOf('failed to fetch') !== -1) {
    return new Error('网络连接失败，请检查网络或 Base URL 配置是否正确。');
  }

  // 其他
  return new Error('AI 调用出错：' + (e.message || e));
}

// 导出到 window 全局
window.ai = {
  getConfig: getConfig,
  isDemoMode: isDemoMode,
  saveConfig: saveConfig,
  extractJSON: extractJSON,
  callAI: callAI,
  testConnection: testConnection,
  recommendTopics: recommendTopics,
  analyzeConversation: analyzeConversation,
  generateReplies: generateReplies,
  getProgressReminder: getProgressReminder,
  wrapError: wrapError
};
