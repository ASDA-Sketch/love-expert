/**
 * IndexedDB 数据层
 * 管理联系人（contacts）和聊天记录（messages）两个 object store。
 * 所有方法返回 Promise，使用原生 IndexedDB API，无外部依赖。
 */

const DB_NAME = 'love_expert';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * 当前时间 ISO 格式字符串
 */
function nowStr() {
  return new Date().toISOString();
}

/**
 * 初始化数据库（打开/创建）
 * 创建 contacts 和 messages 两个 store，messages 上有 contact_id 索引。
 */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('contacts')) {
        db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('messages')) {
        const messageStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
        messageStore.createIndex('contact_id', 'contact_id', { unique: false });
      }
    };
  });
}

/**
 * 获取数据库实例（如未初始化则先初始化）
 */
function getDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return initDB();
}

// ============================================================
// 联系人 CRUD
// ============================================================

/**
 * 获取所有联系人，按 created_at 倒序
 */
function getContacts() {
  return getDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('contacts', 'readonly');
      const store = tx.objectStore('contacts');
      const req = store.getAll();
      req.onsuccess = () => {
        const result = req.result || [];
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * 获取单个联系人
 */
function getContact(id) {
  return getDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('contacts', 'readonly');
      const store = tx.objectStore('contacts');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * 新建联系人
 */
function createContact(name, stage, tags, channel, note) {
  return getDB().then(db => {
    const ts = nowStr();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('contacts', 'readwrite');
      const store = tx.objectStore('contacts');
      const req = store.add({
        name: name,
        stage: stage || '',
        tags: tags || '',
        channel: channel || '',
        note: note || '',
        created_at: ts,
        updated_at: ts
      });
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * 更新联系人字段（只更新 fields 中提供的字段）
 */
function updateContact(id, fields) {
  return getDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('contacts', 'readwrite');
      const store = tx.objectStore('contacts');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const contact = getReq.result;
        if (!contact) {
          resolve(null);
          return;
        }
        Object.assign(contact, fields);
        contact.updated_at = nowStr();
        const putReq = store.put(contact);
        putReq.onsuccess = () => {
          const newGetReq = store.get(id);
          newGetReq.onsuccess = () => resolve(newGetReq.result);
          newGetReq.onerror = () => reject(newGetReq.error);
        };
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

/**
 * 删除联系人（同时删除该联系人所有消息）
 */
function deleteContact(id) {
  return getDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['contacts', 'messages'], 'readwrite');
      const contactStore = tx.objectStore('contacts');
      const messageStore = tx.objectStore('messages');
      const messageIndex = messageStore.index('contact_id');

      // 删除该联系人的所有消息
      const msgReq = messageIndex.openCursor(IDBKeyRange.only(id));
      msgReq.onsuccess = () => {
        const cursor = msgReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      msgReq.onerror = () => reject(msgReq.error);

      // 删除联系人
      contactStore.delete(id);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

// ============================================================
// 消息 CRUD
// ============================================================

/**
 * 获取某联系人的所有消息，按 created_at 正序
 */
function getMessages(contactId) {
  return getDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('contact_id');
      const req = index.getAll(IDBKeyRange.only(contactId));
      req.onsuccess = () => {
        const result = req.result || [];
        result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * 添加一条消息（role='them' 或 'me'），同时更新联系人 updated_at
 * @param {number} contactId
 * @param {string} role - 'them' 或 'me'
 * @param {string} content
 * @param {string} [customTimestamp] - 可选自定义时间戳（ISO 格式），用于批量导入
 */
function addMessage(contactId, role, content, customTimestamp) {
  return getDB().then(db => {
    const ts = customTimestamp || nowStr();
    let messageId = null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['messages', 'contacts'], 'readwrite');
      const messageStore = tx.objectStore('messages');
      const contactStore = tx.objectStore('contacts');

      const req = messageStore.add({
        contact_id: contactId,
        role: role,
        content: content,
        created_at: ts
      });
      req.onsuccess = () => {
        messageId = req.result;
      };
      req.onerror = () => reject(req.error);

      // 更新联系人 updated_at
      const getContactReq = contactStore.get(contactId);
      getContactReq.onsuccess = () => {
        const contact = getContactReq.result;
        if (contact) {
          contact.updated_at = ts;
          contactStore.put(contact);
        }
      };
      getContactReq.onerror = () => reject(getContactReq.error);

      tx.oncomplete = () => {
        resolve({
          id: messageId,
          contact_id: contactId,
          role: role,
          content: content,
          created_at: ts
        });
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

/**
 * 更新单条消息内容
 */
function updateMessage(id, content) {
  return getDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const msg = getReq.result;
        if (!msg) {
          resolve(null);
          return;
        }
        msg.content = content;
        const putReq = store.put(msg);
        putReq.onsuccess = () => resolve(msg);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

/**
 * 删除单条消息
 */
function deleteMessage(id) {
  return getDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * 清空某联系人的所有消息
 */
function clearMessages(contactId) {
  return getDB().then(db => {
    const ts = nowStr();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['messages', 'contacts'], 'readwrite');
      const messageStore = tx.objectStore('messages');
      const contactStore = tx.objectStore('contacts');
      const index = messageStore.index('contact_id');

      const req = index.openCursor(IDBKeyRange.only(contactId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      req.onerror = () => reject(req.error);

      // 更新联系人 updated_at
      const getContactReq = contactStore.get(contactId);
      getContactReq.onsuccess = () => {
        const contact = getContactReq.result;
        if (contact) {
          contact.updated_at = ts;
          contactStore.put(contact);
        }
      };
      getContactReq.onerror = () => reject(getContactReq.error);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

// ============================================================
// AI 上下文构建
// ============================================================

/**
 * 构建 AI 上下文摘要：联系人资料 + 最近对话记录
 * 格式：
 *   联系人：小美
 *   关系阶段：暧昧期
 *   性格标签：活泼/开朗
 *   认识渠道：朋友介绍
 *   备注：超级吃货
 *   最近对话：
 *   [对方]：哈哈哈你也太搞笑了吧
 *   [我]：那是，我可是朋友圈最搞笑的人
 *
 * 无消息时只返回联系人信息部分。
 * 最后一条消息距今超过3天时，追加"（注意：距上次聊天已过X天）"
 */
function buildContextSummary(contactId, limit) {
  limit = limit || 30;
  return getDB().then(db => {
    // 获取联系人
    return new Promise((resolve, reject) => {
      const tx = db.transaction('contacts', 'readonly');
      const store = tx.objectStore('contacts');
      const req = store.get(contactId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }).then(contact => {
    if (!contact) return '';

    const parts = [];
    parts.push('联系人：' + contact.name);
    if (contact.stage) parts.push('关系阶段：' + contact.stage);
    if (contact.tags) parts.push('性格标签：' + contact.tags);
    if (contact.channel) parts.push('认识渠道：' + contact.channel);
    if (contact.note) parts.push('备注：' + contact.note);

    // 获取最近消息
    return getMessages(contactId).then(messages => {
      const recentMessages = messages.slice(-limit);

      if (recentMessages.length > 0) {
        parts.push('最近对话：');
        for (const msg of recentMessages) {
          const speaker = msg.role === 'them' ? '对方' : '我';
          parts.push('[' + speaker + ']：' + msg.content);
        }

        // 检查最后一条消息距今是否超过3天
        const lastMsg = recentMessages[recentMessages.length - 1];
        const lastTime = new Date(lastMsg.created_at);
        const now = new Date();
        const daysDiff = Math.floor((now - lastTime) / (1000 * 60 * 60 * 24));
        if (daysDiff > 3) {
          parts.push('（注意：距上次聊天已过' + daysDiff + '天）');
        }
      }

      return parts.join('\n');
    });
  });
}

// 导出到 window 全局
window.db = {
  initDB: initDB,
  getContacts: getContacts,
  getContact: getContact,
  createContact: createContact,
  updateContact: updateContact,
  deleteContact: deleteContact,
  getMessages: getMessages,
  addMessage: addMessage,
  updateMessage: updateMessage,
  deleteMessage: deleteMessage,
  clearMessages: clearMessages,
  buildContextSummary: buildContextSummary
};

window.getContact = getContact;
