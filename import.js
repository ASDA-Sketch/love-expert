/**
 * 批量导入聊天记录解析模块 v3
 * 支持微信真实复制格式 + 多种常见格式
 *
 * 支持格式（按优先级）：
 *   0. 微信真实格式：名字行 + 时间行 + 内容行（3行一组）
 *   A. 名字+日期时间 同一行，内容在下一行
 *   B. 名字单独一行，内容在下一行（无时间行）
 *   C. 名字: 内容（冒号分隔）
 *   D. 纯对话无名字（交替分配）
 */

// 时间正则：支持 11:30 / 11:30:25 / 11:30 AM / 2:51 PM
var TIME_RE = '\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM|上午|下午)?';
// 日期正则：支持 2024-09-04 / 2024/9/4 / 2024年9月4日 / 2026年09月04日
var DATE_RE = '\\d{4}[-/\\u5e74]\\d{1,2}[-/\\u6708]\\d{1,2}\\u65e5?';
// 日期+时间组合
var DATETIME_RE = DATE_RE + '\\s+' + TIME_RE;
// 单独的时间行正则（用于格式0：名字行 + 时间行）
var TIME_LINE_RE = new RegExp('^(' + DATETIME_RE + '|' + TIME_RE + '|' + DATE_RE + ')\\s*$', 'i');
// 名字+时间同一行（格式A）
var NAME_TIME_RE = new RegExp('^(.+?)\\s+(' + DATETIME_RE + '|' + TIME_RE + ')\\s*$', 'i');

/**
 * 清除不可见字符（零宽空格、BOM等）并将 Unicode 行分隔符转为 \n
 * @param {string} text
 * @returns {string}
 */
function stripInvisible(text) {
  // Remove zero-width characters and BOM
  text = text.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
  // Convert Unicode line/paragraph separators to \n
  text = text.replace(/[\u2028\u2029]/g, '\n');
  // Convert various Unicode spaces to regular space
  text = text.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  return text;
}

/**
 * 主解析函数
 * @param {string} text - 用户粘贴的原始文本
 * @param {string} contactName - 当前联系人名字
 * @returns {{role:'them'|'me', content:string, timestamp?:string}[]}
 */
function parseChatHistory(text, contactName) {
  // 统一换行符（\r\n → \n, \r → \n）
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // 清除不可见字符（零宽空格、BOM等），将 Unicode 行分隔符转为 \n
  text = stripInvisible(text);
  text = text.trim();
  if (!text) return [];

  var lines = text.split('\n');
  var messages = [];

  // 清理每一行的不可见字符和首尾空白
  for (var k = 0; k < lines.length; k++) {
    lines[k] = stripInvisible(lines[k]).trim();
  }

  // 清理 contactName 的不可见字符
  if (contactName) contactName = stripInvisible(contactName).trim();

  // 统计每行出现的次数（用于名字识别：名字会重复出现）
  var lineCounts = {};
  for (var lc = 0; lc < lines.length; lc++) {
    if (lines[lc]) lineCounts[lines[lc]] = (lineCounts[lines[lc]] || 0) + 1;
  }

  // ===== 格式检测 =====

  // 格式C: 名字: 内容（冒号分隔），排除时间被误判
  var fmtC_RE = /^([^\d:：]{1,10}?)[：:]\s*(.+)$/;

  // 检测各格式
  var hasFmt0 = false; // 微信真实格式：名字行+时间行+内容行
  var hasFmtA = false; // 名字+时间同一行
  var hasFmtC = false;
  var nameOnlyLines = []; // 名字独占行（格式B）

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line) continue;

    // 检测格式0：名字行 + 下一行是时间行
    if (!hasFmt0 && i + 1 < lines.length) {
      var nextLine = lines[i + 1];
      if (isPossibleName(line, contactName) && TIME_LINE_RE.test(nextLine)) {
        hasFmt0 = true;
      }
    }

    // 检测格式A：名字+时间同一行
    if (NAME_TIME_RE.test(line)) {
      hasFmtA = true;
    }

    // 检测格式C（冒号分隔）
    var colonMatch = line.match(fmtC_RE);
    if (colonMatch) {
      var beforeColon = colonMatch[1].trim();
      if (!/^\d{1,2}$/.test(beforeColon)) {
        hasFmtC = true;
      }
    }

    // 检测名字独占行（格式B）：短文本，不是时间，不含冒号，下一行有内容且不是时间
    if (line.length <= 10 && !NAME_TIME_RE.test(line) && !TIME_LINE_RE.test(line) && !line.match(/^\d/) && !/[：:]/.test(line)) {
      var nextForName = (i + 1 < lines.length) ? lines[i + 1] : '';
      if (nextForName && !TIME_LINE_RE.test(nextForName) && !NAME_TIME_RE.test(nextForName)) {
        if (isLikelyName(line, contactName, lineCounts)) {
          nameOnlyLines.push({ lineIdx: i, name: line });
        }
      }
    }
  }

  // ===== 解析（按优先级）=====

  if (hasFmt0) {
    // 格式0优先：微信真实格式（名字行+时间行+内容行）
    messages = parseWeChatFormat(lines, contactName);
  } else if (hasFmtA) {
    // 格式A：名字+时间同一行
    messages = parseNameTimeFormat(lines, NAME_TIME_RE, contactName);
  } else if (nameOnlyLines.length >= 2) {
    // 格式B：名字独占行
    messages = parseNameOnlyFormat(lines, nameOnlyLines, contactName);
  } else if (hasFmtC) {
    // 格式C：冒号分隔
    messages = parseColonFormat(lines, fmtC_RE, contactName);
  } else {
    // 格式D：纯对话交替
    messages = parseAlternatingFormat(lines);
  }

  // 过滤空内容
  messages = messages.filter(function(m) {
    return m.content && m.content.trim().length > 0;
  });

  // v21: 如果按换行分割后只解析出0-1条，尝试单行拆分（手机粘贴可能丢失换行符）
  if (messages.length <= 1 && text.length > 20) {
    var singleLineParsed = parseSingleLineFallback(text, contactName);
    if (singleLineParsed.length > messages.length) {
      messages = singleLineParsed;
    }
  }

  return messages;
}

/**
 * 判断是否可能是说话人名字
 */
function isPossibleName(text, contactName) {
  var lower = text.toLowerCase().trim();
  if (lower === '我' || lower === 'i' || lower === 'me' || lower === '自己' || text === '本人') return true;
  if (text === '对方' || lower === 'ta' || text === '他' || text === '她' || text === '对方说') return true;
  if (contactName) {
    var cn = contactName.trim().toLowerCase();
    if (lower === cn || cn.indexOf(lower) !== -1 || lower.indexOf(cn) !== -1) return true;
  }
  // 1-10个字符的中文名字
  if (/^[\u4e00-\u9fa5a-zA-Z]{1,10}$/.test(text)) return true;
  return false;
}

/**
 * 更严格的名字判断（用于格式B名字独占行检测）
 * 只有满足以下条件之一才认为是名字：
 * 1. 常见代词（我、对方、ta等）
 * 2. 匹配联系人名字
 * 3. 在文本中出现多次且较短（名字会重复出现）
 */
function isLikelyName(text, contactName, lineCounts) {
  var lower = text.toLowerCase().trim();
  if (lower === '我' || lower === 'i' || lower === 'me' || lower === '自己' || text === '本人') return true;
  if (text === '对方' || lower === 'ta' || text === '他' || text === '她' || text === '对方说') return true;
  if (contactName) {
    var cn = contactName.trim().toLowerCase();
    if (lower === cn || cn.indexOf(lower) !== -1 || lower.indexOf(cn) !== -1) return true;
  }
  if (lineCounts && lineCounts[text] >= 2 && text.length <= 4) return true;
  return false;
}

/**
 * 识别角色
 */
function identifyRole(name, contactName) {
  name = name.trim();
  var lower = name.toLowerCase();
  if (lower === '我' || lower === 'i' || lower === 'me' || lower === '自己' || name === '本人') return 'me';
  if (name === '对方' || lower === 'ta' || name === '他' || name === '她' || name === '对方说') return 'them';
  if (contactName) {
    var cn = contactName.trim().toLowerCase();
    if (lower === cn || cn.indexOf(lower) !== -1 || lower.indexOf(cn) !== -1) return 'them';
  }
  return 'them';
}

// ============================================================
// 格式0：微信真实格式（名字行 + 时间行 + 内容行）
// ============================================================
// 示例：
// 啼
// 2026年09月04日 16:17
// 不喜欢其它男人
//
// 我
// 2026年09月04日 16:18
// 那挺好的
function parseWeChatFormat(lines, contactName) {
  var messages = [];
  var i = 0;

  while (i < lines.length) {
    var line = lines[i].trim();

    // 跳过空行
    if (!line) {
      i++;
      continue;
    }

    // 尝试匹配：名字行 + 时间行 + 内容行
    if (i + 2 < lines.length && isPossibleName(line, contactName) && TIME_LINE_RE.test(lines[i + 1].trim())) {
      var name = line;
      var timestamp = lines[i + 1].trim();
      var contentLines = [];
      var j = i + 2;

      // 收集内容行，直到遇到下一个名字+时间对或空行后的名字+时间对
      while (j < lines.length) {
        var contentLine = lines[j].trim();

        // 空行：可能是消息结束
        if (!contentLine) {
          // 检查空行后是否是新消息（名字+时间）
          if (j + 2 < lines.length && isPossibleName(lines[j + 1].trim(), contactName) && TIME_LINE_RE.test(lines[j + 2].trim())) {
            break;
          }
          // 否则继续收集（内容中的空行）
          j++;
          continue;
        }

        // 检查是否到了下一个名字+时间对
        if (isPossibleName(contentLine, contactName) && j + 1 < lines.length && TIME_LINE_RE.test(lines[j + 1].trim())) {
          break;
        }

        contentLines.push(contentLine);
        j++;
      }

      var content = contentLines.join('\n').trim();
      if (content) {
        messages.push({
          role: identifyRole(name, contactName),
          content: content,
          timestamp: timestamp
        });
      }

      i = j;
    } else {
      // 不是名字+时间格式，跳过
      i++;
    }
  }

  return messages;
}

// ============================================================
// 格式A：名字+时间同一行，内容在下一行
// ============================================================
function parseNameTimeFormat(lines, pattern, contactName) {
  var messages = [];
  var currentRole = null;
  var currentContent = [];
  var currentTimestamp = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var match = line.match(pattern);

    if (match) {
      if (currentRole && currentContent.length > 0) {
        messages.push({
          role: currentRole,
          content: currentContent.join('\n').trim(),
          timestamp: currentTimestamp
        });
      }
      currentRole = identifyRole(match[1].trim(), contactName);
      currentTimestamp = match[2].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentRole && currentContent.length > 0) {
    messages.push({
      role: currentRole,
      content: currentContent.join('\n').trim(),
      timestamp: currentTimestamp
    });
  }

  return messages;
}

// ============================================================
// 格式B：名字独占一行，内容在下一行（无时间行）
// ============================================================
function parseNameOnlyFormat(lines, nameLines, contactName) {
  var messages = [];
  var nameLineIdxSet = {};
  for (var n = 0; n < nameLines.length; n++) {
    nameLineIdxSet[nameLines[n].lineIdx] = nameLines[n].name;
  }

  var currentRole = null;
  var currentContent = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();

    if (!line) {
      if (currentRole && currentContent.length > 0) {
        messages.push({
          role: currentRole,
          content: currentContent.join('\n').trim()
        });
        currentRole = null;
        currentContent = [];
      }
      continue;
    }

    if (nameLineIdxSet[i]) {
      if (currentRole && currentContent.length > 0) {
        messages.push({
          role: currentRole,
          content: currentContent.join('\n').trim()
        });
      }
      currentRole = identifyRole(nameLineIdxSet[i], contactName);
      currentContent = [];
    } else {
      if (currentRole) {
        currentContent.push(line);
      } else {
        currentRole = 'them';
        currentContent.push(line);
      }
    }
  }

  if (currentRole && currentContent.length > 0) {
    messages.push({
      role: currentRole,
      content: currentContent.join('\n').trim()
    });
  }

  return messages;
}

// ============================================================
// 格式C：名字: 内容（冒号分隔）
// ============================================================
function parseColonFormat(lines, pattern, contactName) {
  var messages = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var match = line.match(pattern);
    if (match) {
      var name = match[1].trim();
      var content = match[2].trim();
      if (/^\d{1,2}$/.test(name)) continue;
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

// ============================================================
// 格式D：纯对话交替
// ============================================================
function parseAlternatingFormat(lines) {
  var messages = [];
  var role = 'them';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    messages.push({ role: role, content: line });
    role = role === 'them' ? 'me' : 'them';
  }
  return messages;
}

// 导出到 window 全局
window.parseChatHistory = parseChatHistory;

/**
 * v21: 单行文本兜底解析
 * 当手机端粘贴丢失换行符，多行内容被合并成一行时，尝试用以下模式拆分：
 * 1. 时间戳作为分隔点（如 "小美 2024-09-04 11:30 你今天干嘛了 我 2024-09-04 11:31 没干嘛"）
 * 2. 名字+冒号作为分隔点（如 "小美：你好 我：在吗"）
 * 3. 名字+空格+内容模式
 */
function parseSingleLineFallback(text, contactName) {
  text = stripInvisible(text).trim();
  if (!text) return [];

  if (contactName) contactName = stripInvisible(contactName).trim();

  // 方案1: 用时间戳作为分割点
  // 匹配模式：名字 + 日期时间 + 内容（内容到下一个名字+日期时间为止）
  var DATETIME_PATTERN = new RegExp(
    '(' + DATE_RE + '\\s+' + TIME_RE + '|' + TIME_RE + '|' + DATE_RE + ')',
    'gi'
  );

  // 找出所有时间戳位置
  var timeMatches = [];
  var m;
  while ((m = DATETIME_PATTERN.exec(text)) !== null) {
    timeMatches.push({ index: m.index, text: m[0] });
  }

  if (timeMatches.length >= 2) {
    // 有多个时间戳，按时间戳拆分
    var segments = [];
    for (var t = 0; t < timeMatches.length; t++) {
      var segStart = timeMatches[t].index;
      var segEnd = (t + 1 < timeMatches.length) ? timeMatches[t + 1].index : text.length;
      var segText = text.substring(segStart, segEnd).trim();
      if (segText) segments.push(segText);
    }

    if (segments.length >= 2) {
      var messages1 = [];
      for (var s = 0; s < segments.length; s++) {
        var seg = segments[s];
        // 每段开头是 时间戳，前面可能有名字
        // 尝试提取名字（在时间戳之前的短文本）
        var dtMatch = seg.match(new RegExp('^' + DATETIME_PATTERN.source, 'i'));
        var namePart = '';
        var contentPart = seg;

        if (dtMatch) {
          // 时间戳在开头
          var afterTime = seg.substring(dtMatch[0].length).trim();
          contentPart = afterTime;
        } else {
          // 可能有名字在时间戳前
          var nameTimeMatch = seg.match(new RegExp('^(.+?)\\s+(' + DATETIME_RE + '|' + TIME_RE + ')', 'i'));
          if (nameTimeMatch) {
            namePart = nameTimeMatch[1].trim();
            contentPart = seg.substring(nameTimeMatch[0].length).trim();
          }
        }

        if (contentPart) {
          // 如果contentPart里还有名字，尝试用名字分割
          var role = namePart ? identifyRole(namePart, contactName) : (messages1.length > 0 && messages1[0].role === 'them' ? 'me' : 'them');
          messages1.push({ role: role, content: contentPart });
        }
      }
      if (messages1.length >= 2) return messages1;
    }
  }

  // 方案2: 用"名字+冒号"作为分割点
  // 模式: 小美：你好 我：在吗 -> ["小美：你好", "我：在吗"]
  var colonNameRE = /([^\s:：]{1,10})[：:]\s*/g;
  var colonMatches = [];
  while ((m = colonNameRE.exec(text)) !== null) {
    colonMatches.push({ index: m.index, name: m[1] });
  }

  if (colonMatches.length >= 2) {
    var messages2 = [];
    for (var c = 0; c < colonMatches.length; c++) {
      var contentStart = colonMatches[c].index + colonMatches[c].name.length + 1;
      // 跳过冒号和空格
      while (contentStart < text.length && /[：:\s]/.test(text[contentStart])) contentStart++;
      var contentEnd = (c + 1 < colonMatches.length) ? colonMatches[c + 1].index : text.length;
      var content = text.substring(contentStart, contentEnd).trim();
      if (content) {
        messages2.push({
          role: identifyRole(colonMatches[c].name, contactName),
          content: content
        });
      }
    }
    if (messages2.length >= 2) return messages2;
  }

  // 方案3: 用已知名字（"我"、contactName等）作为分割点
  if (contactName) {
    var nameSplitRE = new RegExp(
      '(?=(?:我|' + contactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\s)',
      'g'
    );
    var nameSplits = text.split(nameSplitRE).filter(function(s) { return s.trim(); });
    if (nameSplits.length >= 2) {
      var messages3 = [];
      for (var ns = 0; ns < nameSplits.length; ns++) {
        var nsSeg = nameSplits[ns].trim();
        var nsMatch = nsSeg.match(/^(我|[^:：\s]{1,10})\s+(.+)/);
        if (nsMatch) {
          messages3.push({
            role: identifyRole(nsMatch[1], contactName),
            content: nsMatch[2].trim()
          });
        } else {
          // 没有名字前缀，交替分配
          messages3.push({
            role: messages3.length % 2 === 0 ? 'them' : 'me',
            content: nsSeg
          });
        }
      }
      if (messages3.length >= 2) return messages3;
    }
  }

  // 方案4: 用"我"作为分割点（最简单的中文对话）
  var woSplitRE = /(?=我\s)/g;
  var woSplits = text.split(woSplitRE).filter(function(s) { return s.trim(); });
  if (woSplits.length >= 2) {
    var messages4 = [];
    for (var w = 0; w < woSplits.length; w++) {
      var wSeg = woSplits[w].trim();
      if (wSeg.indexOf('我') === 0) {
        // "我"开头的是我的消息
        var wContent = wSeg.replace(/^我\s*/, '').trim();
        if (wContent) messages4.push({ role: 'me', content: wContent });
      } else {
        // 其他的是对方的消息
        if (wSeg) messages4.push({ role: 'them', content: wSeg });
      }
    }
    if (messages4.length >= 2) return messages4;
  }

  // 所有方案都失败，返回单条
  return [{ role: 'them', content: text }];
}
