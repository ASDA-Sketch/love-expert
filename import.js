/**
 * 批量导入聊天记录解析模块
 * 支持三种微信复制格式：
 *   格式1：名字 + 时间标记行，内容在下一行
 *   格式2：名字: 内容（冒号分隔）
 *   格式3：纯对话无名字（交替分配）
 * 使用 window 全局导出。
 */

/**
 * 主解析函数
 * @param {string} text - 用户粘贴的原始文本
 * @param {string} contactName - 当前联系人名字（用于识别"对方说的"）
 * @returns {{role:'them'|'me', content:string, timestamp?:string}[]}
 */
function parseChatHistory(text, contactName) {
  // 统一换行
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return [];

  var lines = text.split('\n');
  var messages = [];

  // 格式1正则：名字 + 日期时间
  // 匹配：张三  2024-09-04 11:30  或  张三  2024/9/4 11:30  或  张三  11:30
  var format1Pattern = /^(.+?)\s+(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}[\s]+\d{1,2}:\d{2}(:\d{2})?|\d{1,2}:\d{2})\s*$/;

  // 格式2正则：名字: 内容 或 名字：内容
  var format2Pattern = /^(.+?)[：:]\s*(.+)$/;

  // 检测使用哪种格式
  var hasFormat1 = false;
  var hasFormat2 = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    if (format1Pattern.test(line)) {
      hasFormat1 = true;
      break;
    }

    // 检查格式2：冒号/冒号前部分较短（可能是名字）
    var m2 = line.match(format2Pattern);
    if (m2 && m2[1].trim().length <= 10 && m2[2].trim().length > 0) {
      // 排除是格式1的内容行被误判
      if (!format1Pattern.test(line)) {
        hasFormat2 = true;
        break;
      }
    }
  }

  if (hasFormat1) {
    messages = parseFormat1(lines, format1Pattern, contactName);
  } else if (hasFormat2) {
    messages = parseFormat2(lines, format2Pattern, contactName);
  } else {
    messages = parseFormat3(lines);
  }

  return messages;
}

/**
 * 识别说话人角色
 * @param {string} name - 说话人名字
 * @param {string} contactName - 联系人名字
 * @returns {'me'|'them'}
 */
function identifyRole(name, contactName) {
  name = name.trim();
  var lower = name.toLowerCase();

  // "我"系列 → me
  if (lower === '我' || lower === 'i' || lower === 'me' || lower === '自己' || name === '本人') {
    return 'me';
  }

  // "对方"系列 → them
  if (name === '对方' || lower === 'ta' || name === '他' || name === '她' || name === '对方说') {
    return 'them';
  }

  // 如果有联系人名字，检查是否匹配
  if (contactName) {
    var cn = contactName.trim().toLowerCase();
    if (lower === cn || cn.indexOf(lower) !== -1 || lower.indexOf(cn) !== -1) {
      return 'them';
    }
  }

  // 默认：不是"我"的都是"对方"
  return 'them';
}

/**
 * 解析格式1：名字 + 时间在单独行，内容在后续行
 * 示例：
 *   张三  2024-09-04 11:30
 *   你今天干嘛了
 *
 *   我  2024-09-04 11:31
 *   没干嘛
 */
function parseFormat1(lines, pattern, contactName) {
  var messages = [];
  var currentRole = null;
  var currentContent = [];
  var currentTimestamp = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var match = line.match(pattern);

    if (match) {
      // 保存上一条消息
      if (currentRole && currentContent.length > 0) {
        messages.push({
          role: currentRole,
          content: currentContent.join('\n').trim(),
          timestamp: currentTimestamp
        });
      }

      var name = match[1].trim();
      currentTimestamp = match[2].trim();
      currentRole = identifyRole(name, contactName);
      currentContent = [];
    } else {
      // 内容行
      currentContent.push(line);
    }
  }

  // 保存最后一条
  if (currentRole && currentContent.length > 0) {
    messages.push({
      role: currentRole,
      content: currentContent.join('\n').trim(),
      timestamp: currentTimestamp
    });
  }

  return messages;
}

/**
 * 解析格式2：名字: 内容
 * 示例：张三: 你今天干嘛了
 */
function parseFormat2(lines, pattern, contactName) {
  var messages = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var match = line.match(pattern);
    if (match) {
      var name = match[1].trim();
      var content = match[2].trim();
      if (content) {
        messages.push({
          role: identifyRole(name, contactName),
          content: content
        });
      }
    }
  }

  return messages;
}

/**
 * 解析格式3：纯对话无名字，交替分配
 * 第1句对方，第2句我，第3句对方...
 */
function parseFormat3(lines) {
  var messages = [];
  var role = 'them'; // 从对方开始

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    messages.push({
      role: role,
      content: line
    });
    role = role === 'them' ? 'me' : 'them';
  }

  return messages;
}

// 导出到 window 全局
window.parseChatHistory = parseChatHistory;
