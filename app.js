/**
 * 恋爱聊天助手 PWA - Main Application Logic
 * Depends on: db.js, prompts.js, demo_data.js, ai.js (loaded via <script> tags)
 */

/* ===== State ===== */
var currentContactId = null;
var currentPanel = 'contacts';
var generatedTopics = [];
var replyState = { quotedMessage: '', style: '', customIntent: '' };
var selectedScene = '刚认识';
var editingContactId = null;

/* ===== Constants ===== */
var PRESETS = {
    deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    kimi: { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
    doubao: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-pro-32k' },
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-3.5-turbo' }
};

var SCENES = [
    { key: '刚认识', label: '🌱 刚认识' },
    { key: '暧昧期', label: '💕 暧昧期' },
    { key: '邀约', label: '📅 邀约' },
    { key: '日常闲聊', label: '☕ 日常闲聊' },
    { key: '关心安慰', label: '🤗 关心安慰' },
    { key: '化解冷场', label: '🛡️ 化解冷场' },
    { key: '有趣开场白', label: '✨ 有趣开场白' }
];

/* ===== Utility Functions ===== */

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
}

function copyText(text, btn) {
    var done = function() {
        if (btn) {
            var original = btn.textContent;
            btn.textContent = '已复制✓';
            setTimeout(function() { btn.textContent = original; }, 1500);
        }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function() {
            fallbackCopy(text);
            done();
        });
    } else {
        fallbackCopy(text);
        done();
    }
}

function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
}

function showLoading(el) {
    if (!el) return;
    el.innerHTML = '<div class="spinner"></div>';
}

function hideLoading(el) {
    if (!el) return;
    el.innerHTML = '';
}

function showError(el, msg) {
    if (!el) return;
    el.innerHTML = '<div class="error-msg">⚠️ ' + escapeHtml(msg) + '</div>';
}

function getConfig() {
    try {
        var cfg = JSON.parse(localStorage.getItem('aiConfig') || '{}');
        return {
            apiKey: cfg.apiKey || '',
            baseUrl: cfg.baseUrl || '',
            model: cfg.model || ''
        };
    } catch (e) {
        return { apiKey: '', baseUrl: '', model: '' };
    }
}

/* ===== Init ===== */

function init() {
    initDB().then(function() {
        return loadDemoDataIfNeeded();
    }).then(function() {
        loadContacts();
        setupEventListeners();
        updateModeBadge();
    }).catch(function(err) {
        console.error('Init error:', err);
        loadContacts();
        setupEventListeners();
        updateModeBadge();
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function(err) {
            console.log('Service Worker registration failed:', err);
        });
    }
}

function initDB() {
    if (window.db.initDB) return window.db.initDB();
    return Promise.resolve();
}

function loadDemoDataIfNeeded() {
    if (!window.db.getContacts) return Promise.resolve();
    return window.db.getContacts().then(function(contacts) {
        if (contacts && contacts.length > 0) return;
        if (!window.demoContacts || !window.db.createContact) return;
        var promises = [];
        for (var i = 0; i < window.demoContacts.length; i++) {
            var c = window.demoContacts[i];
            promises.push(window.db.createContact(c.name, c.stage, c.tags, c.channel, c.note));
        }
        return Promise.all(promises).then(function() {
            if (window.demoMessages && window.db.addMessage) {
                var msgPromises = [];
                for (var cid in window.demoMessages) {
                    var msgs = window.demoMessages[cid];
                    for (var j = 0; j < msgs.length; j++) {
                        msgPromises.push(window.db.addMessage(cid, msgs[j].role, msgs[j].content));
                    }
                }
                return Promise.all(msgPromises);
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', init);

/* ===== Event Listeners ===== */

function setupEventListeners() {
    // Tab buttons
    var tabs = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabs.length; i++) {
        (function(tab) {
            tab.addEventListener('click', function() {
                switchPanel(tab.dataset.panel);
            });
        })(tabs[i]);
    }

    // New contact button
    $('newContactBtn').addEventListener('click', function() { openContactModal(); });

    // Edit contact button
    $('editContactBtn').addEventListener('click', function() {
        if (currentContactId) openContactModal(currentContactId);
    });

    // Send buttons
    $('sendThemBtn').addEventListener('click', function() { sendMessage('them'); });
    $('sendMeBtn').addEventListener('click', function() { sendMessage('me'); });

    // Enter key to send as 'me'
    $('messageInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage('me');
        }
    });

    // Chat toolbar
    $('analyzeBtn').addEventListener('click', analyzeConversation);
    $('topicsBtn').addEventListener('click', recommendTopics);
    $('batchPasteBtn').addEventListener('click', batchPaste);
    $('clearChatBtn').addEventListener('click', function() { clearMessages(currentContactId); });

    // Contact modal
    $('saveContactBtn').addEventListener('click', saveContact);
    $('deleteContactBtn').addEventListener('click', function() {
        if (editingContactId) deleteContact(editingContactId);
    });

    // Modal close buttons
    var closeBtns = document.querySelectorAll('.modal-close');
    for (var j = 0; j < closeBtns.length; j++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                var target = $(btn.dataset.close);
                if (target) target.classList.add('hidden');
            });
        })(closeBtns[j]);
    }

    // Modal overlay click to close
    var overlays = document.querySelectorAll('.modal-overlay');
    for (var k = 0; k < overlays.length; k++) {
        (function(overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) overlay.classList.add('hidden');
            });
        })(overlays[k]);
    }

    // Batch paste
    $('importBatchBtn').addEventListener('click', importBatch);

    // Settings
    $('settingsBtn').addEventListener('click', openSettings);
    $('saveConfigBtn').addEventListener('click', saveConfig);
    $('testConnBtn').addEventListener('click', testConnection);

    // Preset buttons
    var presets = document.querySelectorAll('.preset-btn');
    for (var p = 0; p < presets.length; p++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                applyPreset(btn.dataset.preset);
            });
        })(presets[p]);
    }

    // Style buttons in reply panel
    var styleBtns = document.querySelectorAll('.style-btn');
    for (var s = 0; s < styleBtns.length; s++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                var allBtns = document.querySelectorAll('.style-btn');
                for (var a = 0; a < allBtns.length; a++) {
                    allBtns[a].classList.remove('selected');
                }
                btn.classList.add('selected');
                replyState.style = btn.dataset.style;
                if (btn.dataset.style === 'guide_topic') {
                    $('customIntentGroup').classList.remove('hidden');
                } else {
                    $('customIntentGroup').classList.add('hidden');
                }
            });
        })(styleBtns[s]);
    }

    // Generate replies
    $('generateRepliesBtn').addEventListener('click', generateReplies);

    // Progress reminder refresh
    $('refreshReminderBtn').addEventListener('click', refreshProgressReminder);

    // Mobile access button
    $('mobileAccessBtn').addEventListener('click', function() {
        alert('📱 恋爱聊天助手 PWA\n\n1. 在浏览器菜单中选择"添加到主屏幕"\n2. 安装后可像原生App一样使用\n3. 支持离线访问已保存的数据');
    });
}

/* ===== Navigation ===== */

function switchPanel(panel) {
    currentPanel = panel;
    var panels = document.querySelectorAll('.panel');
    for (var i = 0; i < panels.length; i++) {
        panels[i].classList.remove('active');
    }
    var target = $(panel + 'Panel');
    if (target) target.classList.add('active');

    var tabs = document.querySelectorAll('.tab-btn');
    for (var t = 0; t < tabs.length; t++) {
        tabs[t].classList.remove('active');
    }
    var tabId = 'tab' + panel.charAt(0).toUpperCase() + panel.slice(1);
    var activeTab = $(tabId);
    if (activeTab) activeTab.classList.add('active');
}

/* ===== Contacts ===== */

function loadContacts() {
    var list = $('contactsList');
    if (!list) return;

    if (!window.db.getContacts) {
        list.innerHTML = '<div class="empty-hint">数据库未初始化</div>';
        return;
    }

    window.db.getContacts().then(function(contacts) {
        if (!contacts || contacts.length === 0) {
            list.innerHTML = '<div class="empty-hint">还没有联系人，点击右上角新建</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < contacts.length; i++) {
            (function(contact) {
                var isActive = contact.id === currentContactId;
                // Get preview asynchronously
                var preview = '暂无对话';
                if (window.db.getMessages) {
                    window.db.getMessages(contact.id).then(function(msgs) {
                        if (msgs && msgs.length > 0) {
                            var last = msgs[msgs.length - 1];
                            var role = last.role === 'them' ? '对方: ' : '我: ';
                            var content = (last.content || '').slice(0, 30);
                            var item = list.querySelector('[data-contact-id="' + contact.id + '"] .contact-preview');
                            if (item) item.textContent = role + content;
                        }
                    });
                }
                html += '<div class="contact-item' + (isActive ? ' active' : '') + '" data-contact-id="' + contact.id + '">';
                html += '<div class="contact-info">';
                html += '<div class="contact-name">' + escapeHtml(contact.name) + '</div>';
                html += '<div class="contact-meta">';
                html += '<span class="contact-stage">' + escapeHtml(contact.stage || '刚认识') + '</span>';
                html += '<span class="contact-preview">' + escapeHtml(preview) + '</span>';
                html += '</div></div></div>';
            })(contacts[i]);
        }
        list.innerHTML = html;

        // Bind click events
        var items = list.querySelectorAll('.contact-item');
        for (var j = 0; j < items.length; j++) {
            (function(item) {
                item.addEventListener('click', function() {
                    var cid = item.dataset.contactId;
                    var parsedId = isNaN(Number(cid)) ? cid : Number(cid);
                    selectContact(parsedId);
                });
            })(items[j]);
        }
    }).catch(function(err) {
        list.innerHTML = '<div class="empty-hint">加载失败: ' + escapeHtml(err.message || '') + '</div>';
    });
}

function selectContact(id) {
    currentContactId = id;
    loadContacts();
    loadMessages(id);
    loadProgressReminder(id);
    switchPanel('chat');
}

function setSelectValue(selectEl, value, fallback) {
    selectEl.value = value;
    if (selectEl.value !== value) {
        selectEl.value = fallback;
    }
}

function openContactModal(id) {
    editingContactId = id || null;
    var modal = $('contactModal');
    var title = $('contactModalTitle');
    var deleteBtn = $('deleteContactBtn');

    // Always clear form first to prevent stale data from previous edit
    $('contactName').value = '';
    $('contactStage').value = '刚认识';
    $('contactTags').value = '';
    $('contactChannel').value = '微信';
    $('contactNote').value = '';

    if (id) {
        title.textContent = '编辑联系人';
        deleteBtn.classList.remove('hidden');
        if (window.getContact) {
            window.getContact(id).then(function(contact) {
                // Race condition guard: if user clicked another button, abort
                if (editingContactId !== id) return;
                if (contact) {
                    $('contactName').value = contact.name || '';
                    setSelectValue($('contactStage'), contact.stage || '刚认识', '刚认识');
                    $('contactTags').value = contact.tags || '';
                    setSelectValue($('contactChannel'), contact.channel || '微信', '其他');
                    $('contactNote').value = contact.note || '';
                }
                modal.classList.remove('hidden');
            }).catch(function() {
                if (editingContactId !== id) return;
                modal.classList.remove('hidden');
            });
        } else {
            modal.classList.remove('hidden');
        }
    } else {
        title.textContent = '新建联系人';
        deleteBtn.classList.add('hidden');
        modal.classList.remove('hidden');
    }
}

function saveContact() {
    var name = $('contactName').value.trim();
    if (!name) {
        alert('请输入姓名');
        return;
    }

    var contact = {
        name: name,
        stage: $('contactStage').value,
        tags: $('contactTags').value.trim(),
        channel: $('contactChannel').value,
        note: $('contactNote').value.trim()
    };

    if (editingContactId) {
        contact.id = editingContactId;
    }

    if (!window.db.createContact) {
        alert('数据库未初始化');
        return;
    }

    var savePromise;
    if (editingContactId) {
        savePromise = window.db.updateContact(editingContactId, contact);
    } else {
        savePromise = window.db.createContact(contact.name, contact.stage, contact.tags, contact.channel, contact.note);
    }
    savePromise.then(function() {
        $('contactModal').classList.add('hidden');
        editingContactId = null;
        loadContacts();
        if (currentContactId) {
            loadMessages(currentContactId);
        }
    }).catch(function(err) {
        alert('保存失败: ' + (err.message || ''));
    });
}

function deleteContact(id) {
    if (!id) return;
    if (!confirm('确认删除该联系人及其所有对话？此操作不可撤销。')) return;

    var tasks = [];
    if (window.db.clearMessages) tasks.push(window.db.clearMessages(id));
    if (window.db.deleteContact) tasks.push(window.db.deleteContact(id));

    Promise.all(tasks).then(function() {
        $('contactModal').classList.add('hidden');
        editingContactId = null;
        if (currentContactId === id) {
            currentContactId = null;
            loadMessages(null);
            $('progressCard').classList.add('hidden');
        }
        loadContacts();
    }).catch(function(err) {
        alert('删除失败: ' + (err.message || ''));
    });
}

/* ===== Chat ===== */

function loadMessages(contactId) {
    var area = $('messagesArea');
    if (!area) return;
    area.innerHTML = '';

    if (!contactId) {
        area.innerHTML = '<p class="empty-hint">请从联系人列表选择一位</p>';
        $('chatContactName').textContent = '选择联系人';
        $('chatStageTag').textContent = '';
        return;
    }

    if (window.getContact) {
        window.getContact(contactId).then(function(contact) {
            if (contact) {
                $('chatContactName').textContent = contact.name;
                $('chatStageTag').textContent = contact.stage || '';
            }
        });
    }

    if (!window.db.getMessages) {
        area.innerHTML = '<p class="empty-hint">数据库未初始化</p>';
        return;
    }

    window.db.getMessages(contactId).then(function(messages) {
        if (!messages || messages.length === 0) {
            area.innerHTML = '<p class="empty-hint">暂无对话，点击下方按钮添加</p>';
            return;
        }
        for (var i = 0; i < messages.length; i++) {
            renderMessage(messages[i]);
        }
        area.scrollTop = area.scrollHeight;
    }).catch(function(err) {
        area.innerHTML = '<p class="empty-hint">加载失败: ' + escapeHtml(err.message || '') + '</p>';
    });
}

function renderMessage(msg) {
    var area = $('messagesArea');
    var bubble = document.createElement('div');
    bubble.className = 'message-bubble ' + (msg.role === 'them' ? 'them' : 'me');
    bubble.dataset.msgId = msg.id;

    var html = '<div class="message-text">' + escapeHtml(msg.content) + '</div>';
    html += '<div class="message-time">' + formatTime(msg.timestamp) + '</div>';

    if (msg.role === 'them') {
        html += '<div class="message-actions">';
        html += '<button class="msg-action reply-action" title="智能回复">💬</button>';
        html += '<button class="msg-action edit-action" title="编辑">✏️</button>';
        html += '<button class="msg-action delete-action" title="删除">🗑️</button>';
        html += '</div>';
    }

    bubble.innerHTML = html;

    if (msg.role === 'them') {
        var replyBtn = bubble.querySelector('.reply-action');
        if (replyBtn) {
            replyBtn.addEventListener('click', function() {
                openReplyPanel(msg.content);
            });
        }
        var editBtn = bubble.querySelector('.edit-action');
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                editMessage(msg.id);
            });
        }
        var deleteBtn = bubble.querySelector('.delete-action');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
                deleteMessage(msg.id);
            });
        }
    }

    area.appendChild(bubble);
}

function sendMessage(role) {
    var input = $('messageInput');
    var content = input.value.trim();
    if (!content) return;

    if (!currentContactId) {
        alert('请先选择联系人');
        return;
    }

    if (!window.db.addMessage) {
        alert('数据库未初始化');
        return;
    }

    window.db.addMessage(currentContactId, role, content).then(function() {
        input.value = '';
        loadMessages(currentContactId);
        loadContacts();
    }).catch(function(err) {
        alert('发送失败: ' + (err.message || ''));
    });
}

function editMessage(id) {
    var bubble = document.querySelector('[data-msg-id="' + id + '"]');
    if (!bubble) return;

    var contentEl = bubble.querySelector('.message-text');
    if (!contentEl) return;

    var originalContent = contentEl.textContent;
    var actionsEl = bubble.querySelector('.message-actions');
    if (actionsEl) actionsEl.style.display = 'none';

    // Create textarea
    var textarea = document.createElement('textarea');
    textarea.className = 'edit-textarea';
    textarea.value = originalContent;
    contentEl.style.display = 'none';
    contentEl.parentNode.insertBefore(textarea, contentEl.nextSibling);

    // Create buttons
    var btnContainer = document.createElement('div');
    btnContainer.className = 'edit-buttons';
    var saveBtn = document.createElement('button');
    saveBtn.className = 'edit-save-btn';
    saveBtn.textContent = '保存';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'edit-cancel-btn';
    cancelBtn.textContent = '取消';
    btnContainer.appendChild(saveBtn);
    btnContainer.appendChild(cancelBtn);
    textarea.parentNode.insertBefore(btnContainer, textarea.nextSibling);
    textarea.focus();

    saveBtn.addEventListener('click', function() {
        var newContent = textarea.value.trim();
        if (newContent && window.db.updateMessage) {
            window.db.updateMessage(id, newContent).then(function() {
                loadMessages(currentContactId);
            }).catch(function(err) {
                alert('保存失败: ' + (err.message || ''));
                loadMessages(currentContactId);
            });
        } else {
            loadMessages(currentContactId);
        }
    });

    cancelBtn.addEventListener('click', function() {
        loadMessages(currentContactId);
    });
}

function deleteMessage(id) {
    if (!confirm('确认删除这条消息？')) return;
    if (!window.db.deleteMessage) return;

    window.db.deleteMessage(id).then(function() {
        loadMessages(currentContactId);
        loadContacts();
    }).catch(function(err) {
        alert('删除失败: ' + (err.message || ''));
    });
}

function clearMessages(contactId) {
    if (!contactId) {
        alert('请先选择联系人');
        return;
    }
    if (!confirm('确认清空与该联系人的所有对话？此操作不可撤销。')) return;
    if (!window.db.clearMessages) return;

    window.db.clearMessages(contactId).then(function() {
        loadMessages(contactId);
        loadContacts();
    }).catch(function(err) {
        alert('清空失败: ' + (err.message || ''));
    });
}

function batchPaste() {
    if (!currentContactId) {
        alert('请先选择联系人');
        return;
    }
    $('batchText').value = '';
    $('batchModal').classList.remove('hidden');
}

function importBatch() {
    var text = $('batchText').value.trim();
    if (!text) {
        alert('请输入对话内容');
        return;
    }
    if (!currentContactId) {
        alert('请先选择联系人');
        return;
    }
    if (!window.db.addMessage) {
        alert('数据库未初始化');
        return;
    }

    var lines = text.split('\n');
    var promises = [];

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var role, content;
        if (line.indexOf('对方：') === 0 || line.indexOf('对方:') === 0) {
            role = 'them';
            content = line.replace(/^对方[：:]\s*/, '');
        } else if (line.indexOf('我：') === 0 || line.indexOf('我:') === 0) {
            role = 'me';
            content = line.replace(/^我[：:]\s*/, '');
        } else {
            continue;
        }

        promises.push(window.db.addMessage(currentContactId, role, content));
    }

    if (promises.length === 0) {
        alert('未解析到有效对话，请检查格式');
        return;
    }

    Promise.all(promises).then(function() {
        $('batchModal').classList.add('hidden');
        loadMessages(currentContactId);
        loadContacts();
    }).catch(function(err) {
        alert('导入失败: ' + (err.message || ''));
    });
}

/* ===== Analysis ===== */

function analyzeConversation() {
    if (!currentContactId) {
        alert('请先选择联系人');
        return;
    }

    var content = $('analysisContent');
    showLoading(content);
    switchPanel('analysis');

    if (!window.ai || !window.ai.analyzeConversation) {
        showError(content, 'AI模块未加载，请检查ai.js');
        return;
    }

    window.db.getMessages(currentContactId).then(function(messages) {
        if (!messages || messages.length === 0) {
            showError(content, '暂无对话记录，请先添加对话');
            return;
        }

        var convText = messages.map(function(m) {
            return (m.role === 'them' ? '对方：' : '我：') + m.content;
        }).join('\n');

        return window.ai.analyzeConversation(convText, true, currentContactId).then(function(result) {
            renderAnalysis(result);
        });
    }).catch(function(err) {
        showError(content, err.message || '分析失败，请检查API配置');
    });
}

function renderAnalysis(data) {
    var content = $('analysisContent');
    if (!data) {
        showError(content, '分析结果为空');
        return;
    }

    var fields = [
        { key: 'attitude', icon: '🎯', title: '对方态度' },
        { key: 'basis', icon: '📋', title: '分析依据' },
        { key: 'subtext', icon: '💬', title: '潜台词解读' },
        { key: 'replies', icon: '✨', title: '推荐回复' },
        { key: 'progress', icon: '📈', title: '关系进度' },
        { key: 'pacing', icon: '⏱️', title: '节奏建议' },
        { key: 'next_step', icon: '👉', title: '下一步建议' },
        { key: 'overall_advice', icon: '💡', title: '总体建议' }
    ];

    var html = '<div class="analysis-cards">';
    for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var val = data[f.key];
        if (val !== undefined && val !== null && val !== '') {
            if (Array.isArray(val)) {
                val = val.join('\n');
            }
            html += '<div class="analysis-card">';
            html += '<div class="card-title">' + f.icon + ' ' + f.title + '</div>';
            html += '<div class="card-content">' + escapeHtml(String(val)) + '</div>';
            html += '</div>';
        }
    }
    html += '</div>';

    if (html === '<div class="analysis-cards"></div>') {
        html = '<div class="empty-hint">分析结果为空</div>';
    }

    content.innerHTML = html;
}

function recommendTopics() {
    if (!currentContactId) {
        alert('请先选择联系人');
        return;
    }

    var content = $('analysisContent');
    content.innerHTML = '';

    // Scene selector
    var sceneHtml = '<div class="scene-selector">';
    sceneHtml += '<div class="scene-label">选择场景</div>';
    sceneHtml += '<div class="scene-buttons">';
    for (var i = 0; i < SCENES.length; i++) {
        var sc = SCENES[i];
        sceneHtml += '<button class="scene-btn' + (sc.key === selectedScene ? ' active' : '') + '" data-scene="' + sc.key + '">' + sc.label + '</button>';
    }
    sceneHtml += '</div></div>';
    sceneHtml += '<div id="topicsResults" class="topics-results"></div>';
    content.innerHTML = sceneHtml;

    // Bind scene buttons
    var sceneBtns = content.querySelectorAll('.scene-btn');
    for (var j = 0; j < sceneBtns.length; j++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                selectedScene = btn.dataset.scene;
                var allBtns = content.querySelectorAll('.scene-btn');
                for (var a = 0; a < allBtns.length; a++) {
                    allBtns[a].classList.remove('active');
                }
                btn.classList.add('active');
                loadTopics(selectedScene);
            });
        })(sceneBtns[j]);
    }

    switchPanel('analysis');
    loadTopics(selectedScene);
}

function loadTopics(scene) {
    var resultsDiv = $('topicsResults');
    if (!resultsDiv) return;
    showLoading(resultsDiv);

    if (!window.ai || !window.ai.recommendTopics) {
        showError(resultsDiv, 'AI模块未加载，请检查ai.js');
        return;
    }

    var avoid = generatedTopics.slice();
    window.ai.recommendTopics(scene, '', currentContactId, avoid).then(function(topics) {
        renderTopics(topics);
    }).catch(function(err) {
        showError(resultsDiv, err.message || '获取话题失败');
    });
}

function renderTopics(topics) {
    var resultsDiv = $('topicsResults');
    if (!resultsDiv) return;

    if (!topics || topics.length === 0) {
        resultsDiv.innerHTML = '<div class="empty-hint">暂无推荐话题</div>';
        return;
    }

    // Track for 避重
    for (var i = 0; i < topics.length; i++) {
        if (topics[i].content) generatedTopics.push(topics[i].content);
    }

    var html = '<div class="topic-cards">';
    for (var j = 0; j < topics.length; j++) {
        var topic = topics[j];
        html += '<div class="topic-card">';
        html += '<div class="topic-number">#' + (j + 1) + '</div>';
        html += '<div class="topic-content">' + escapeHtml(topic.content) + '</div>';
        if (topic.reason) {
            html += '<div class="topic-reason">💡 ' + escapeHtml(topic.reason) + '</div>';
        }
        html += '<button class="copy-btn" data-copy="' + encodeURIComponent(topic.content) + '">📋 复制</button>';
        html += '</div>';
    }
    html += '</div>';
    html += '<button id="refreshTopicsBtn" class="refresh-topics-btn">🔄 换一批</button>';

    resultsDiv.innerHTML = html;

    // Bind copy buttons
    var copyBtns = resultsDiv.querySelectorAll('.copy-btn');
    for (var c = 0; c < copyBtns.length; c++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                copyText(decodeURIComponent(btn.dataset.copy), btn);
            });
        })(copyBtns[c]);
    }

    // Bind refresh button
    var refreshBtn = $('refreshTopicsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshTopics);
    }
}

function refreshTopics() {
    loadTopics(selectedScene);
}

/* ===== Quote Reply ===== */

function openReplyPanel(quotedMessage) {
    if (!currentContactId) {
        alert('请先选择联系人');
        return;
    }

    replyState.quotedMessage = quotedMessage;
    replyState.style = '';
    replyState.customIntent = '';

    $('quotedMessageBlock').textContent = quotedMessage;
    $('customIntentGroup').classList.add('hidden');
    $('customIntent').value = '';
    $('repliesContent').innerHTML = '';

    var styleBtns = document.querySelectorAll('.style-btn');
    for (var i = 0; i < styleBtns.length; i++) {
        styleBtns[i].classList.remove('selected');
    }

    $('replyModal').classList.remove('hidden');
}

function generateReplies() {
    if (!replyState.style) {
        alert('请选择回复风格');
        return;
    }

    var resultsDiv = $('repliesContent');
    showLoading(resultsDiv);

    if (!window.ai || !window.ai.generateReplies) {
        showError(resultsDiv, 'AI模块未加载，请检查ai.js');
        return;
    }

    replyState.customIntent = $('customIntent').value.trim();
    window.ai.generateReplies(
        replyState.quotedMessage,
        replyState.style,
        replyState.customIntent,
        currentContactId
    ).then(function(replies) {
        renderReplies(replies);
    }).catch(function(err) {
        showError(resultsDiv, err.message || '生成回复失败');
    });
}

function renderReplies(replies) {
    var resultsDiv = $('repliesContent');

    if (!replies || replies.length === 0) {
        resultsDiv.innerHTML = '<div class="empty-hint">暂无推荐回复</div>';
        return;
    }

    var html = '<div class="reply-cards">';
    for (var i = 0; i < replies.length; i++) {
        var reply = replies[i];
        html += '<div class="reply-card">';
        html += '<div class="reply-number">#' + (i + 1) + '</div>';
        html += '<div class="reply-content">' + escapeHtml(reply.content) + '</div>';
        if (reply.reason) {
            html += '<div class="reply-reason">💡 ' + escapeHtml(reply.reason) + '</div>';
        }
        html += '<div class="reply-actions">';
        html += '<button class="copy-btn" data-copy="' + encodeURIComponent(reply.content) + '">📋 复制</button>';
        html += '<button class="fill-btn" data-fill="' + encodeURIComponent(reply.content) + '">✏️ 填入我说</button>';
        html += '</div>';
        html += '</div>';
    }
    html += '</div>';

    resultsDiv.innerHTML = html;

    // Bind copy buttons
    var copyBtns = resultsDiv.querySelectorAll('.copy-btn');
    for (var c = 0; c < copyBtns.length; c++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                copyText(decodeURIComponent(btn.dataset.copy), btn);
            });
        })(copyBtns[c]);
    }

    // Bind fill buttons
    var fillBtns = resultsDiv.querySelectorAll('.fill-btn');
    for (var f = 0; f < fillBtns.length; f++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                fillIntoChat(decodeURIComponent(btn.dataset.fill));
            });
        })(fillBtns[f]);
    }
}

function fillIntoChat(content) {
    if (!window.db.addMessage || !currentContactId) return;

    window.db.addMessage(currentContactId, 'me', content).then(function() {
        $('replyModal').classList.add('hidden');
        loadMessages(currentContactId);
        loadContacts();
        switchPanel('chat');
    }).catch(function(err) {
        alert('填入失败: ' + (err.message || ''));
    });
}

/* ===== Progress Reminder ===== */

function loadProgressReminder(contactId) {
    var card = $('progressCard');
    if (!contactId) {
        card.classList.add('hidden');
        return;
    }

    if (!window.ai || !window.ai.getProgressReminder) {
        card.classList.add('hidden');
        return;
    }

    $('progressText').textContent = '加载中...';
    card.classList.remove('hidden');

    window.ai.getProgressReminder(contactId).then(function(reminder) {
        if (reminder && reminder.reminder) {
            $('progressText').textContent = reminder.reminder;
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    }).catch(function() {
        card.classList.add('hidden');
    });
}

function refreshProgressReminder() {
    if (currentContactId) {
        loadProgressReminder(currentContactId);
    }
}

/* ===== Settings ===== */

function openSettings() {
    var config = getConfig();
    $('apiKey').value = config.apiKey || '';
    $('baseUrl').value = config.baseUrl || '';
    $('model').value = config.model || '';
    $('settingsModal').classList.remove('hidden');
}

function applyPreset(key) {
    var preset = PRESETS[key];
    if (preset) {
        $('baseUrl').value = preset.baseUrl;
        $('model').value = preset.model;
    }
}

function saveConfig() {
    var config = {
        apiKey: $('apiKey').value.trim(),
        baseUrl: $('baseUrl').value.trim(),
        model: $('model').value.trim()
    };
    localStorage.setItem('aiConfig', JSON.stringify(config));
    updateModeBadge();
    $('settingsModal').classList.add('hidden');
}

function updateModeBadge() {
    var config = getConfig();
    var badge = $('modeBadge');
    if (config.apiKey) {
        badge.textContent = 'Live';
        badge.classList.add('live');
    } else {
        badge.textContent = 'Demo';
        badge.classList.remove('live');
    }
}

function testConnection() {
    var config = {
        apiKey: $('apiKey').value.trim(),
        baseUrl: $('baseUrl').value.trim(),
        model: $('model').value.trim()
    };

    if (!config.apiKey) {
        alert('请输入 API Key');
        return;
    }

    // 先保存到 localStorage，让 callAI 能读到
    localStorage.setItem('aiConfig', JSON.stringify(config));

    var btn = $('testConnBtn');
    var original = btn.textContent;
    btn.textContent = '测试中...';
    btn.disabled = true;

    if (!window.ai || !window.ai.testConnection) {
        alert('⚠️ AI模块未加载，请强制刷新页面（Ctrl+F5）');
        btn.textContent = original;
        btn.disabled = false;
        return;
    }

    window.ai.testConnection({
        api_key: config.apiKey,
        base_url: config.baseUrl,
        model: config.model
    }).then(function(result) {
        alert('✅ ' + result);
    }).catch(function(err) {
        alert('❌ 连接失败：' + (err.message || '未知错误'));
    }).then(function() {
        btn.textContent = original;
        btn.disabled = false;
    });
}
