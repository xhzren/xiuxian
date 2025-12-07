// 📱 监听父页面的AI响应（postMessage通信）
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'MOBILE_AI_RESPONSE') {
        console.log('[📱手机通讯] 收到AI响应');
        
        const { loadingId, success, reply, error } = event.data;
        
        // 移除加载状态
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            loadingEl.parentElement.parentElement.parentElement.remove();
        }
        
        // 解析并显示回复
        if (success && reply) {
            // 使用提示词模块解析回复
            if (window.MobilePrompts && window.MobilePrompts.communication) {
                const replies = window.MobilePrompts.communication.parseAIReply(reply);
                replies.forEach(msg => {
                    // 根据sender.id渲染到对应聊天框（当前简化处理：直接显示）
                    window.commApi.addMsg('left', msg.content, msg.sender?.name);
                });
            } else {
                window.commApi.addMsg('left', reply);
            }
        } else {
            window.commApi.addMsg('left', `❌ ${error || '通讯失败'}`);
        }
        
        // 更新合并发送按钮状态
        window.commApi.updateBatchBtn();
    }
});

// 定义全局通讯功能
window.commApi = {
    searchMode: 'friend', // 当前搜索模式: 'friend' 或 'group'
    
    // 📨 待发送消息队列
    pendingMessages: [],
    
    // 当前聊天信息
    currentChat: {
        name: '',
        id: '',
        type: 'private', // 'private' 或 'group'
        groupInfo: null
    },
    
    // 💾 聊天记录存储 { chatId: { info: {...}, messages: [...], history: [...] } }
    chatStorage: {},
    
    // 联系人列表
    contacts: [],
    
    // 保存聊天记录到存储
    saveChatMessage: (chatId, message) => {
        if (!window.commApi.chatStorage[chatId]) {
            window.commApi.chatStorage[chatId] = {
                info: { ...window.commApi.currentChat },
                messages: [],  // UI显示的消息
                history: []    // 发给AI的历史上下文
            };
        }
        
        // 添加到消息列表
        window.commApi.chatStorage[chatId].messages.push({
            ...message,
            timestamp: Date.now()
        });
        
        // 如果是用户发送或AI回复，添加到历史上下文
        if (message.direction === 'outgoing' || message.direction === 'incoming') {
            window.commApi.chatStorage[chatId].history.push({
                role: message.direction === 'outgoing' ? 'user' : 'assistant',
                content: message.content,
                sender: message.sender
            });
            
            // 限制历史上下文长度（最多保留20条）
            if (window.commApi.chatStorage[chatId].history.length > 20) {
                window.commApi.chatStorage[chatId].history = 
                    window.commApi.chatStorage[chatId].history.slice(-20);
            }
        }
        
        // 自动保存到localStorage
        window.commApi.saveToStorage();
        console.log('[📱聊天存储] 已保存消息到', chatId);
    },
    
    // 获取当前聊天的历史上下文（发给AI用）
    getChatHistory: (chatId) => {
        const chat = window.commApi.chatStorage[chatId];
        if (!chat) return [];
        return chat.history || [];
    },
    
    // 获取聊天消息列表（UI显示用）
    getChatMessages: (chatId) => {
        const chat = window.commApi.chatStorage[chatId];
        if (!chat) return [];
        return chat.messages || [];
    },
    
    // 保存到localStorage
    saveToStorage: () => {
        try {
            const data = {
                chatStorage: window.commApi.chatStorage,
                contacts: window.commApi.contacts
            };
            localStorage.setItem('mobileChatData', JSON.stringify(data));
        } catch (e) {
            console.error('[📱聊天存储] 保存失败:', e);
        }
    },
    
    // 从localStorage加载
    loadFromStorage: () => {
        try {
            const saved = localStorage.getItem('mobileChatData');
            if (saved) {
                const data = JSON.parse(saved);
                window.commApi.chatStorage = data.chatStorage || {};
                window.commApi.contacts = data.contacts || [];
                console.log('[📱聊天存储] 已加载聊天记录');
            }
        } catch (e) {
            console.error('[📱聊天存储] 加载失败:', e);
        }
    },
    
    // 导出存档数据（供游戏存档使用）
    exportSaveData: () => {
        return {
            chatStorage: window.commApi.chatStorage,
            contacts: window.commApi.contacts
        };
    },
    
    // 导入存档数据（从游戏存档恢复）
    importSaveData: (data) => {
        if (data) {
            window.commApi.chatStorage = data.chatStorage || {};
            window.commApi.contacts = data.contacts || [];
            window.commApi.saveToStorage();
            console.log('[📱聊天存储] 已从存档恢复');
        }
    },
    
    // 清除所有聊天数据
    clearAllData: () => {
        window.commApi.chatStorage = {};
        window.commApi.contacts = [];
        window.commApi.currentChat = { name: '', id: '', type: 'private', groupInfo: null };
        window.commApi.pendingMessages = [];
        localStorage.removeItem('mobileChatData');
        console.log('[📱聊天存储] 数据已清除');
    },

    // Tab 切换
    switchTab: (el, mode) => {
        // 更新 active 状态
        const tabs = document.querySelectorAll('.add-tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        el.classList.add('active');
        
        // 更新搜索模式
        window.commApi.searchMode = mode;
        
        // 更新提示文本和输入框
        const input = document.getElementById('search-input');
        const hint = document.getElementById('search-hint');
        const results = document.getElementById('search-results');
        
        if (mode === 'friend') {
            input.placeholder = 'INPUT_USER_ID...';
            results.innerHTML = '<div class="search-hint" id="search-hint">// 输入用户ID或名称搜索好友</div>';
        } else {
            input.placeholder = 'INPUT_GROUP_NAME...';
            results.innerHTML = '<div class="search-hint" id="search-hint">// 输入群聊名称或ID搜索群组</div>';
        }
        input.value = '';
    },

    openChat: (name, type, id = null) => {
        const listView = document.getElementById('comm-list-view');
        const detailView = document.getElementById('comm-detail-view');
        const nameEl = document.getElementById('chat-detail-name');
        
        // 设置当前聊天信息
        const chatId = id || 'chat_' + name.replace(/\s+/g, '_');
        window.commApi.currentChat = {
            name: name,
            id: chatId,
            type: type === 'group' ? 'group' : 'private',
            groupInfo: type === 'group' ? { name: name, id: chatId } : null
        };
        
        // 清空待发送消息队列
        window.commApi.pendingMessages = [];
        
        // 获取主框架的 Header 并隐藏
        const appHeader = document.querySelector('.app-header');
        if (appHeader) appHeader.style.display = 'none';

        // 调整 app-body 的 padding 以适应全屏
        const appBody = document.getElementById('appContent');
        if (appBody) {
            appBody.style.padding = '0';
            appBody.style.display = 'flex';
            appBody.style.flexDirection = 'column';
            appBody.style.height = '100%';
        }
        
        if (listView && detailView && nameEl) {
            listView.classList.add('hidden');
            detailView.classList.remove('hidden');
            nameEl.textContent = name;
            
            // 清空消息容器
            const msgContainer = document.getElementById('chat-messages');
            msgContainer.innerHTML = '';
            
            // 加载已保存的聊天记录
            const savedMessages = window.commApi.getChatMessages(chatId);
            if (savedMessages.length > 0) {
                console.log('[📱聊天] 加载已保存的消息:', savedMessages.length, '条');
                savedMessages.forEach((msg, index) => {
                    const side = msg.direction === 'outgoing' ? 'right' : 'left';
                    window.commApi.addMsgToUI(side, msg.content, msg.sender?.name, index);
                });
            } else {
                // 首次聊天，显示欢迎消息
                window.commApi.addMsgToUI('left', `与 ${name} 的加密通道已建立`);
            }
            
            // 更新合并发送按钮状态
            window.commApi.updateBatchBtn();
        }
    },

    closeChat: () => {
        const listView = document.getElementById('comm-list-view');
        const detailView = document.getElementById('comm-detail-view');
        
        // 恢复主框架 Header
        const appHeader = document.querySelector('.app-header');
        if (appHeader) appHeader.style.display = 'flex';

        // 恢复 app-body 样式
        const appBody = document.getElementById('appContent');
        if (appBody) {
            appBody.style.padding = '';
            appBody.style.display = 'block';
            appBody.style.height = '';
        }
        
        if (listView && detailView) {
            detailView.classList.add('hidden');
            listView.classList.remove('hidden');
        }
    },

    // 发送消息（只渲染到UI，添加到待发送队列）
    sendMsg: () => {
        const input = document.getElementById('chat-input-box');
        if (input && input.value.trim()) {
            const text = input.value.trim();
            const chat = window.commApi.currentChat;
            
            // 渲染到UI
            window.commApi.addMsg('right', text);
            input.value = '';
            
            // 创建消息对象并添加到队列
            if (window.MobilePrompts && window.MobilePrompts.communication) {
                const msgObj = window.MobilePrompts.communication.createOutgoingMessage(
                    text,
                    chat.name,
                    chat.id,
                    chat.type,
                    chat.groupInfo
                );
                window.commApi.pendingMessages.push(msgObj);
                console.log('[📱手机通讯] 消息已加入队列:', msgObj);
            } else {
                // 如果提示词模块未加载，使用简单格式
                window.commApi.pendingMessages.push({
                    direction: "outgoing",
                    chatType: chat.type,
                    target: { name: chat.name, id: chat.id },
                    sender: { name: "我", id: "self" },
                    msgType: "text",
                    content: text
                });
            }
            
            // 更新合并发送按钮状态
            window.commApi.updateBatchBtn();
        }
    },
    
    // 📤 合并发送（将队列中的消息一次性发给AI）
    sendBatch: async () => {
        if (window.commApi.pendingMessages.length === 0) {
            console.log('[📱手机通讯] 没有待发送的消息');
            return;
        }
        
        const messages = [...window.commApi.pendingMessages];
        const chat = window.commApi.currentChat;
        
        console.log('[📱手机通讯] 合并发送 ' + messages.length + ' 条消息');
        
        // 获取当前聊天的历史上下文（只发送当前聊天对象的历史）
        const chatHistory = window.commApi.getChatHistory(chat.id);
        console.log('[📱手机通讯] 当前聊天历史:', chatHistory.length, '条');
        
        // 清空队列
        window.commApi.pendingMessages = [];
        window.commApi.updateBatchBtn();
        
        // 显示加载状态（不保存到存储）
        const loadingId = 'loading-' + Date.now();
        window.commApi.addMsgToUI('left', '<span id="' + loadingId + '" class="loading-dots">正在发送...</span>');
        
        // 构建用户消息JSON
        let userMessageJson;
        if (window.MobilePrompts && window.MobilePrompts.communication) {
            userMessageJson = window.MobilePrompts.communication.buildUserMessage(messages);
        } else {
            userMessageJson = JSON.stringify({ messages: messages }, null, 2);
        }
        
        // 通过 postMessage 向父页面发送请求
        try {
            console.log('[📱手机通讯] 发送合并消息到父页面...');
            console.log('[📱手机通讯] 聊天类型:', chat.type);
            window.parent.postMessage({
                type: 'MOBILE_AI_REQUEST',
                userMessage: userMessageJson,
                chatContext: chat.name,
                chatId: chat.id,
                chatType: chat.type,  // 添加聊天类型（private/group）
                chatHistory: chatHistory,  // 发送当前聊天的历史上下文
                loadingId: loadingId,
                isBatchMessage: true  // 标记为合并发送
            }, '*');
        } catch (error) {
            console.error('[📱手机通讯] postMessage失败:', error);
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) {
                loadingEl.parentElement.parentElement.parentElement.remove();
            }
            window.commApi.addMsg('left', `❌ 通讯失败: ${error.message}`);
        }
    },
    
    // 更新合并发送按钮状态
    updateBatchBtn: () => {
        const btn = document.getElementById('batch-send-btn');
        if (btn) {
            const count = window.commApi.pendingMessages.length;
            if (count > 0) {
                btn.textContent = `发送(${count})`;
                btn.classList.add('has-pending');
            } else {
                btn.textContent = '发送';
                btn.classList.remove('has-pending');
            }
        }
    },

    // 删除消息（从UI和存储中删除）
    deleteMessage: (msgElement, msgIndex = null) => {
        if (!msgElement) return;
        
        // 从UI中删除
        msgElement.remove();
        
        // 从存储中删除
        const chat = window.commApi.currentChat;
        if (chat.id && window.commApi.chatStorage[chat.id]) {
            const messages = window.commApi.chatStorage[chat.id].messages;
            // 同时删除对应的历史记录
            const history = window.commApi.chatStorage[chat.id].history;
            
            if (msgIndex !== null && msgIndex >= 0 && msgIndex < messages.length) {
                messages.splice(msgIndex, 1);
                // 同步删除history（索引可能不完全对应，但尽量保持一致）
                if (history && history.length > msgIndex) {
                    history.splice(msgIndex, 1);
                }
            } else {
                // 如果没有指定索引，删除最后一条消息
                messages.pop();
                if (history && history.length > 0) {
                    history.pop();
                }
            }
            window.commApi.saveToStorage();
            
            // 通知主游戏同步保存到IndexedDB
            window.commApi.notifyMainGameToSave();
            console.log('[📱聊天] 消息已删除（含IndexedDB同步）');
        }
    },
    
    // 清空当前聊天的所有消息
    clearCurrentChat: () => {
        const chat = window.commApi.currentChat;
        if (chat.id && window.commApi.chatStorage[chat.id]) {
            window.commApi.chatStorage[chat.id].messages = [];
            window.commApi.chatStorage[chat.id].history = [];
            window.commApi.saveToStorage();
            
            // 清空UI
            const container = document.getElementById('chat-messages');
            if (container) {
                container.innerHTML = '';
                window.commApi.addMsgToUI('left', `与 ${chat.name} 的聊天记录已清空`);
            }
            
            // 通知主游戏同步保存到IndexedDB
            window.commApi.notifyMainGameToSave();
            console.log('[📱聊天] 当前聊天已清空（含IndexedDB同步）');
        }
    },
    
    // 通知主游戏同步保存到IndexedDB
    notifyMainGameToSave: () => {
        try {
            window.parent.postMessage({
                type: 'MOBILE_DATA_CHANGED',
                action: 'save',
                data: window.commApi.exportSaveData()
            }, '*');
            console.log('[📱聊天] 已通知主游戏同步保存');
        } catch (e) {
            console.warn('[📱聊天] 通知主游戏失败:', e);
        }
    },
    
    // 只渲染消息到UI（不保存）
    addMsgToUI: (side, text, senderName = null, msgIndex = null) => {
        const container = document.getElementById('chat-messages');
        if (container) {
            const msgDiv = document.createElement('div');
            msgDiv.className = `msg-row ${side}`;
            if (msgIndex !== null) {
                msgDiv.dataset.msgIndex = msgIndex;
            }
            
            // 如果有发送者名称且是群聊左侧消息，显示发送者
            const senderHtml = (side === 'left' && senderName && window.commApi.currentChat.type === 'group') 
                ? `<div class="msg-sender">${senderName}</div>` 
                : '';
            
            // 删除按钮（长按或点击显示）
            const deleteBtn = `<button class="msg-delete-btn" onclick="event.stopPropagation(); window.commApi.deleteMessage(this.closest('.msg-row'), ${msgIndex})" title="删除消息">×</button>`;
            
            msgDiv.innerHTML = `
                <div class="msg-content">
                    ${senderHtml}
                    <div class="msg-bubble">${text}</div>
                    <div class="msg-meta">
                        ${new Date().toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute:'2-digit'})}
                        ${deleteBtn}
                    </div>
                </div>
            `;
            container.appendChild(msgDiv);
            container.scrollTop = container.scrollHeight;
        }
    },
    
    // 渲染消息到UI并保存到存储
    addMsg: (side, text, senderName = null) => {
        // 渲染到UI
        window.commApi.addMsgToUI(side, text, senderName);
        
        // 保存到存储
        const chat = window.commApi.currentChat;
        if (chat.id) {
            const message = {
                direction: side === 'right' ? 'outgoing' : 'incoming',
                chatType: chat.type,
                target: side === 'right' ? { name: chat.name, id: chat.id } : { name: '我', id: 'self' },
                sender: side === 'right' ? { name: '我', id: 'self' } : { name: senderName || chat.name, id: chat.id },
                msgType: 'text',
                content: text
            };
            window.commApi.saveChatMessage(chat.id, message);
        }
    },

    // 打开添加好友/群聊页面
    openAddView: () => {
        const listView = document.getElementById('comm-list-view');
        const addView = document.getElementById('comm-add-view');
        
        // 获取主框架的 Header 并隐藏
        const appHeader = document.querySelector('.app-header');
        if (appHeader) appHeader.style.display = 'none';

        // 调整 app-body 样式
        const appBody = document.getElementById('appContent');
        if (appBody) {
            appBody.style.padding = '0';
            appBody.style.display = 'flex';
            appBody.style.flexDirection = 'column';
            appBody.style.height = '100%';
        }
        
        if (listView && addView) {
            listView.classList.add('hidden');
            addView.classList.remove('hidden');
        }
    },

    // 关闭添加页面
    closeAddView: () => {
        const listView = document.getElementById('comm-list-view');
        const addView = document.getElementById('comm-add-view');
        
        // 恢复主框架 Header
        const appHeader = document.querySelector('.app-header');
        if (appHeader) appHeader.style.display = 'flex';

        // 恢复 app-body 样式
        const appBody = document.getElementById('appContent');
        if (appBody) {
            appBody.style.padding = '';
            appBody.style.display = 'block';
            appBody.style.height = '';
        }
        
        if (listView && addView) {
            addView.classList.add('hidden');
            listView.classList.remove('hidden');
        }
    },

    // 搜索功能
    searchTarget: () => {
        const input = document.getElementById('search-input');
        const resultArea = document.getElementById('search-results');
        const mode = window.commApi.searchMode;
        
        if (input && resultArea) {
            const query = input.value.trim();
            if (!query) {
                resultArea.innerHTML = mode === 'friend' 
                    ? '<div class="search-hint">// 输入用户ID或名称搜索好友</div>'
                    : '<div class="search-hint">// 输入群聊名称或ID搜索群组</div>';
                return;
            }
            
            // 模拟搜索结果
            resultArea.innerHTML = `
                <div class="search-loading">
                    <span class="loading-text">SCANNING_NEURAL_NET</span>
                    <span class="loading-dots">...</span>
                </div>
            `;
            
            setTimeout(() => {
                if (mode === 'friend') {
                    // 搜索好友结果 - 生成6位数ID
                    const userId = window.commApi.generateUniqueId(6, 'private');
                    resultArea.innerHTML = `
                        <div class="search-result-item" onclick="window.commApi.addContact('${query}', '${userId}', 'private')">
                            <div class="result-avatar">👤</div>
                            <div class="result-info">
                                <div class="result-name">${query}</div>
                                <div class="result-id">ID: ${userId}</div>
                            </div>
                            <div class="result-action">ADD</div>
                        </div>
                    `;
                } else {
                    // 搜索群聊结果 - 生成4位数ID
                    const groupId = window.commApi.generateUniqueId(4, 'group');
                    resultArea.innerHTML = `
                        <div class="search-result-item" onclick="window.commApi.addContact('${query}', '${groupId}', 'group')">
                            <div class="result-avatar">👥</div>
                            <div class="result-info">
                                <div class="result-name" style="color:#ff003c">${query}</div>
                                <div class="result-id">ID: ${groupId}</div>
                            </div>
                            <div class="result-action">JOIN</div>
                        </div>
                    `;
                }
            }, 800);
        }
    },
    
    // 生成不重复的ID
    generateUniqueId: (digits, type) => {
        const min = Math.pow(10, digits - 1);
        const max = Math.pow(10, digits) - 1;
        let id;
        let attempts = 0;
        
        do {
            id = Math.floor(Math.random() * (max - min + 1)) + min;
            attempts++;
        } while (window.commApi.contacts.some(c => c.id === String(id)) && attempts < 100);
        
        return String(id);
    },
    
    // 添加联系人到列表
    addContact: (name, id, type) => {
        // 检查是否已存在
        if (window.commApi.contacts.some(c => c.id === id || c.name === name)) {
            alert('该联系人已存在');
            return;
        }
        
        // 创建联系人对象
        const contact = {
            name: name,
            id: id,
            type: type, // 'private' 或 'group'
            avatar: type === 'group' ? '👥' : '👤',
            addedAt: Date.now()
        };
        
        // 添加到联系人列表
        window.commApi.contacts.push(contact);
        
        // 保存到存储
        window.commApi.saveToStorage();
        
        // 渲染到聊天列表
        window.commApi.renderContactToList(contact);
        
        // 关闭添加页面
        window.commApi.closeAddView();
        
        console.log('[📱联系人] 已添加:', contact);
    },
    
    // 渲染联系人到聊天列表
    renderContactToList: (contact) => {
        const container = document.querySelector('.comm-container');
        if (!container) return;
        
        // 隐藏空提示
        const emptyHint = document.getElementById('empty-contacts-hint');
        if (emptyHint) emptyHint.style.display = 'none';
        
        const chatId = `chat_${contact.id}`;
        const isGroup = contact.type === 'group';
        
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.setAttribute('data-contact-id', contact.id);
        chatItem.onclick = () => window.commApi.openChat(contact.name, contact.type, chatId);
        
        // 获取最后一条消息预览
        const lastMsg = window.commApi.getLastMessage(chatId);
        
        chatItem.innerHTML = `
            <div class="chat-avatar-wrapper">
                <div class="chat-avatar glitch-effect" data-text="${contact.avatar}">${contact.avatar}</div>
                ${!isGroup ? '<div class="status-indicator online"></div>' : ''}
            </div>
            <div class="chat-content">
                <div class="chat-header">
                    <span class="chat-name" ${isGroup ? 'style="color:#ff003c"' : ''}>${contact.name}</span>
                    <span class="chat-time">${lastMsg.time || 'NEW'}</span>
                </div>
                <div class="chat-msg">>> ${lastMsg.text || '点击开始聊天...'}</div>
            </div>
        `;
        
        // 插入到列表顶部
        container.insertBefore(chatItem, container.firstChild);
    },
    
    // 获取聊天的最后一条消息
    getLastMessage: (chatId) => {
        const chat = window.commApi.chatStorage[chatId];
        if (!chat || !chat.messages || chat.messages.length === 0) {
            return { text: null, time: null };
        }
        const lastMsg = chat.messages[chat.messages.length - 1];
        const time = new Date(lastMsg.timestamp);
        const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
        return { 
            text: lastMsg.content.length > 20 ? lastMsg.content.substring(0, 20) + '...' : lastMsg.content,
            time: timeStr 
        };
    },
    
    // 从存储加载联系人并渲染
    renderAllContacts: () => {
        const container = document.querySelector('.comm-container');
        if (!container) return;
        
        // 显示/隐藏空提示
        const emptyHint = document.getElementById('empty-contacts-hint');
        
        if (window.commApi.contacts.length === 0) {
            if (emptyHint) emptyHint.style.display = 'block';
            return;
        }
        
        if (emptyHint) emptyHint.style.display = 'none';
        
        // 清空现有联系人（保留空提示）
        const existingItems = container.querySelectorAll('.chat-item');
        existingItems.forEach(item => item.remove());
        
        // 渲染所有联系人
        window.commApi.contacts.forEach(contact => {
            window.commApi.renderContactToList(contact);
        });
    },
    
    // 初始化通讯App（打开时调用）
    initApp: () => {
        // 延迟渲染，确保DOM已加载
        setTimeout(() => {
            window.commApi.renderAllContacts();
        }, 50);
    }
};

const communicationApp = `
<div class="comm-wrapper">
    <!-- 列表视图 -->
    <div id="comm-list-view" class="comm-view">
        <div class="comm-top-bar">
            <div class="comm-status">SIGNAL_STRONG</div>
            <div class="comm-add-btn" onclick="window.commApi.openAddView()">+</div>
        </div>

        <div class="comm-container">
            <!-- 联系人列表由 JS 动态渲染 -->
            <div class="empty-hint" id="empty-contacts-hint" style="text-align:center; color:#666; padding:40px 20px; font-size:12px;">
                // 暂无联系人<br>
                点击右上角 + 添加好友或群聊
            </div>
        </div>
    </div>

    <!-- 详情视图 -->
    <div id="comm-detail-view" class="comm-view hidden">
        <div class="detail-header">
            <div class="detail-back" onclick="window.commApi.closeChat()">
                <span class="back-arrow">←</span>
            </div>
            <div class="detail-title-box">
                <div class="detail-name" id="chat-detail-name">UNKNOWN</div>
                <div class="detail-status">ENCRYPTED_CONNECTION</div>
            </div>
            <div class="clear-chat-btn" onclick="if(confirm('确定清空所有聊天记录？')) window.commApi.clearCurrentChat()">清空</div>
            <div class="batch-send-btn" id="batch-send-btn" onclick="window.commApi.sendBatch()">发送</div>
        </div>

        <div class="messages-area" id="chat-messages">
            <!-- 消息动态插入 -->
        </div>

        <div class="input-area">
            <div class="input-wrapper">
                <input type="text" id="chat-input-box" class="chat-input" placeholder="INPUT_DATA_STREAM..." onkeypress="if(event.keyCode==13) window.commApi.sendMsg()">
                <div class="input-deco"></div>
            </div>
            <button class="send-btn" onclick="window.commApi.sendMsg()">SEND</button>
        </div>
    </div>

    <!-- 添加好友/群聊视图 -->
    <div id="comm-add-view" class="comm-view hidden">
        <div class="detail-header">
            <div class="detail-back" onclick="window.commApi.closeAddView()">
                <span class="back-arrow">←</span>
            </div>
            <div class="detail-title-box">
                <div class="detail-name">ADD_TARGET</div>
                <div class="detail-status">SEARCH_NETWORK</div>
            </div>
        </div>

        <div class="add-content">
            <div class="add-tabs">
                <div class="add-tab active" onclick="window.commApi.switchTab(this, 'friend')">添加好友</div>
                <div class="add-tab" onclick="window.commApi.switchTab(this, 'group')">搜索群聊</div>
            </div>

            <div class="search-box">
                <input type="text" id="search-input" class="search-input" placeholder="INPUT_TARGET_ID..." onkeypress="if(event.keyCode==13) window.commApi.searchTarget()">
                <button class="search-btn" onclick="window.commApi.searchTarget()">SCAN</button>
            </div>

            <div class="search-results" id="search-results">
                <div class="search-hint" id="search-hint">// 输入名称进行搜索</div>
            </div>
        </div>
    </div>
</div>

<style>
.comm-wrapper {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* Prevent double scrollbars */
}

.comm-view {
    transition: all 0.3s ease;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.comm-view.hidden {
    display: none;
}

/* Top Bar for List */
.comm-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 10px 10px 10px;
    border-bottom: 1px solid rgba(0, 243, 255, 0.1);
    margin-bottom: 10px;
}

.comm-status {
    font-size: 10px;
    color: var(--primary);
    opacity: 0.7;
}

.comm-add-btn {
    width: 24px;
    height: 24px;
    border: 1px solid var(--primary);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
}

.comm-add-btn:hover {
    background: var(--primary);
    color: #000;
    box-shadow: 0 0 10px var(--primary);
}

/* List Styles */
.comm-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    padding-right: 5px; /* Space for scrollbar */
    flex: 1;
}

/* Cyberpunk scrollbar for comm-container */
.comm-container::-webkit-scrollbar {
    width: 6px;
}

.comm-container::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 3px;
    border: 1px solid rgba(0, 243, 255, 0.1);
}

.comm-container::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, var(--primary) 0%, rgba(157, 0, 255, 0.8) 100%);
    border-radius: 3px;
    border: 1px solid rgba(0, 243, 255, 0.3);
    box-shadow: 0 0 6px rgba(0, 243, 255, 0.4);
}

.comm-container::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, #fff 0%, var(--primary) 100%);
    box-shadow: 0 0 10px var(--primary);
}

.comm-container::-webkit-scrollbar-corner {
    background: rgba(0, 0, 0, 0.3);
}

.chat-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 15px;
    background: rgba(0, 20, 40, 0.6);
    border: 1px solid rgba(0, 243, 255, 0.1);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
    transition: all 0.2s;
    cursor: pointer;
    margin-right: 2px; /* Safety margin */
    flex-shrink: 0; /* Prevent shrinking */
}

.chat-item:hover {
    background: rgba(0, 243, 255, 0.1);
    border-color: var(--primary);
    transform: translateX(5px);
}

.chat-avatar-wrapper {
    position: relative;
    width: 48px;
    height: 48px;
    flex: 0 0 48px;
}

.chat-avatar {
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    border: 1px solid var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    position: relative;
    overflow: hidden;
}

.status-indicator {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 8px;
    height: 8px;
    background: #0f0;
    box-shadow: 0 0 5px #0f0;
    border: 1px solid #000;
}

.chat-content {
    flex: 1;
    font-family: 'Courier New', monospace;
    overflow: hidden;
}

.chat-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
}

.chat-name {
    color: var(--primary);
    font-weight: bold;
    font-size: 14px;
    text-shadow: 0 0 5px rgba(0, 243, 255, 0.5);
}

.chat-time {
    font-size: 10px;
    color: #666;
    background: rgba(0,0,0,0.5);
    padding: 2px 4px;
    border: 1px solid #333;
    position: absolute;
    top: 4px;
    right: 4px;
}

.chat-msg {
    font-size: 12px;
    color: #aaa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.unread-mark {
    background: var(--secondary);
    color: #000;
    font-weight: bold;
    font-size: 10px;
    padding: 2px 6px;
    clip-path: polygon(20% 0%, 100% 0, 100% 100%, 0% 100%);
    animation: pulse-red 1s infinite;
}

/* Detail View Styles */
.detail-header {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 15px 10px; /* Increased padding to replace app-header */
    border-bottom: 1px solid rgba(0, 243, 255, 0.3);
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(10px);
    z-index: 10;
    margin-bottom: 0; /* Remove margin, let content flow */
}

.detail-back {
    cursor: pointer;
    color: var(--primary);
    font-family: 'Courier New', monospace;
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid rgba(0, 243, 255, 0.2);
    border-radius: 8px;
    transition: all 0.2s;
    background: rgba(0, 243, 255, 0.1);
}

.detail-back:hover {
    background: var(--primary);
    color: #000;
}

.detail-title-box {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.detail-name {
    font-size: 16px;
    font-weight: bold;
    color: #fff;
    text-shadow: 0 0 10px var(--primary);
    line-height: 1.2;
}

.detail-status {
    font-size: 9px;
    color: #666;
    letter-spacing: 1px;
}

.batch-send-btn {
    font-size: 12px;
    color: var(--text-main);
    cursor: pointer;
    padding: 6px 12px;
    background: rgba(0, 243, 255, 0.1);
    border: 1px solid var(--primary);
    border-radius: 4px;
    transition: all 0.3s;
}

.batch-send-btn:hover {
    background: rgba(0, 243, 255, 0.2);
    box-shadow: 0 0 10px var(--primary-glow);
}

.batch-send-btn.has-pending {
    background: var(--primary);
    color: #000;
    font-weight: bold;
    animation: pulse 1s infinite;
}

@keyframes pulse {
    0%, 100% { box-shadow: 0 0 5px var(--primary-glow); }
    50% { box-shadow: 0 0 15px var(--primary-glow); }
}

.detail-menu {
    font-size: 20px;
    color: var(--primary);
    cursor: pointer;
    padding: 0 10px;
}

.messages-area {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 15px;
    padding: 15px 10px;
    background: rgba(0, 0, 0, 0.2);
}

/* Custom Scrollbar for messages */
.messages-area::-webkit-scrollbar {
    width: 4px;
}
.messages-area::-webkit-scrollbar-thumb {
    background: var(--primary);
    border-radius: 2px;
}
.messages-area::-webkit-scrollbar-track {
    background: rgba(0,0,0,0.1);
}

.msg-row {
    display: flex;
    width: 100%;
}

.msg-row.left {
    justify-content: flex-start;
}

.msg-row.right {
    justify-content: flex-end;
}

.msg-content {
    max-width: 80%;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.left .msg-content { align-items: flex-start; }
.right .msg-content { align-items: flex-end; }

.msg-bubble {
    padding: 10px 15px;
    font-size: 13px;
    line-height: 1.4;
    position: relative;
    word-break: break-word;
}

.left .msg-bubble {
    background: rgba(0, 243, 255, 0.1);
    border: 1px solid rgba(0, 243, 255, 0.3);
    border-radius: 0 10px 10px 10px;
    color: #fff;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 10px 100%, 0 calc(100% - 10px));
}

.right .msg-bubble {
    background: rgba(255, 0, 60, 0.1);
    border: 1px solid rgba(255, 0, 60, 0.3);
    border-radius: 10px 0 10px 10px;
    color: #fff;
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
}

.msg-meta {
    font-size: 8px;
    color: #555;
    font-family: 'Courier New', monospace;
    display: flex;
    align-items: center;
    gap: 8px;
}

/* 删除消息按钮 */
.msg-delete-btn {
    background: rgba(255, 0, 60, 0.2);
    border: 1px solid rgba(255, 0, 60, 0.3);
    color: #ff003c;
    font-size: 12px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    transition: all 0.2s;
    padding: 0;
    line-height: 1;
}

.msg-delete-btn:hover {
    opacity: 1;
    background: rgba(255, 0, 60, 0.4);
    box-shadow: 0 0 5px rgba(255, 0, 60, 0.5);
}

/* 清空聊天按钮 */
.clear-chat-btn {
    font-size: 10px;
    color: #ff003c;
    cursor: pointer;
    padding: 4px 8px;
    background: rgba(255, 0, 60, 0.1);
    border: 1px solid rgba(255, 0, 60, 0.3);
    border-radius: 4px;
    transition: all 0.2s;
}

.clear-chat-btn:hover {
    background: rgba(255, 0, 60, 0.3);
}

.input-area {
    display: flex;
    gap: 10px;
    padding: 15px 10px; /* Add padding for bottom spacing */
    background: rgba(0,0,0,0.8);
    border-top: 1px solid rgba(255,255,255,0.1);
    flex-shrink: 0; /* Prevent shrinking */
}

.input-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    height: 40px;
}

.chat-input {
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid #333;
    padding: 0 15px;
    color: #fff;
    font-family: 'Courier New', monospace;
    outline: none;
    transition: all 0.3s;
    border-radius: 4px;
}

.chat-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 10px rgba(0, 243, 255, 0.1);
}

.send-btn {
    width: 70px;
    height: 40px;
    background: var(--primary);
    border: none;
    color: #000;
    font-weight: bold;
    cursor: pointer;
    clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px);
    transition: all 0.2s;
}

.send-btn:active {
    transform: scale(0.95);
}

.glitch-effect::after {
    content: attr(data-text);
    position: absolute;
    left: 2px;
    text-shadow: -1px 0 red;
    top: 0;
    color: white;
    background: black;
    overflow: hidden;
    clip: rect(0, 900px, 0, 0);
    animation: glitch 2s infinite linear alternate-reverse;
}

.glitch-effect::before {
    content: attr(data-text);
    position: absolute;
    left: -2px;
    text-shadow: 1px 0 blue;
    top: 0;
    color: white;
    background: black;
    overflow: hidden;
    clip: rect(0, 900px, 0, 0);
    animation: glitch 3s infinite linear alternate-reverse;
}

/* 添加好友/群聊视图样式 */
.add-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 15px 10px;
    overflow-y: auto;
}

.add-tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
}

.add-tab {
    flex: 1;
    padding: 10px;
    text-align: center;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid #333;
    color: #666;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px);
}

.add-tab.active {
    background: rgba(0, 243, 255, 0.1);
    border-color: var(--primary);
    color: var(--primary);
}

.add-tab:hover {
    border-color: var(--primary);
    color: var(--primary);
}

.search-box {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
}

.search-input {
    flex: 1;
    height: 40px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid #333;
    padding: 0 15px;
    color: #fff;
    font-family: 'Courier New', monospace;
    outline: none;
    transition: all 0.3s;
}

.search-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 10px rgba(0, 243, 255, 0.1);
}

.search-btn {
    width: 70px;
    height: 40px;
    background: var(--primary);
    border: none;
    color: #000;
    font-weight: bold;
    cursor: pointer;
    clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px);
    transition: all 0.2s;
}

.search-btn:active {
    transform: scale(0.95);
}

.search-results {
    min-height: 80px;
    margin-bottom: 20px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255,255,255,0.05);
}

.search-hint {
    color: #555;
    font-size: 12px;
    font-style: italic;
}

.search-loading {
    color: var(--primary);
    font-size: 12px;
    animation: blink 0.5s infinite;
}

@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
}

.search-result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    background: rgba(0, 20, 40, 0.6);
    border: 1px solid rgba(0, 243, 255, 0.1);
    margin-bottom: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.search-result-item:hover {
    background: rgba(0, 243, 255, 0.1);
    border-color: var(--primary);
}

.result-avatar {
    width: 40px;
    height: 40px;
    background: rgba(0,0,0,0.5);
    border: 1px solid var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
}

.result-info {
    flex: 1;
}

.result-name {
    color: var(--primary);
    font-size: 13px;
    font-weight: bold;
}

.result-id {
    font-size: 10px;
    color: #666;
}

.result-action {
    padding: 5px 12px;
    background: rgba(0, 243, 255, 0.2);
    border: 1px solid var(--primary);
    color: var(--primary);
    font-size: 10px;
    font-weight: bold;
    cursor: pointer;
}

.recommend-section {
    margin-top: auto;
}

.recommend-title {
    color: #666;
    font-size: 11px;
    margin-bottom: 10px;
    padding-bottom: 5px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
}

.recommend-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.recommend-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba(0, 10, 20, 0.6);
    border: 1px solid rgba(255,255,255,0.05);
    cursor: pointer;
    transition: all 0.2s;
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
}

.recommend-item:hover {
    background: rgba(0, 243, 255, 0.05);
    border-color: rgba(0, 243, 255, 0.2);
    transform: translateX(3px);
}

.recommend-avatar {
    width: 45px;
    height: 45px;
    background: rgba(0,0,0,0.5);
    border: 1px solid #444;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
}

.recommend-info {
    flex: 1;
}

.recommend-name {
    color: var(--primary);
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 3px;
}

.recommend-tag {
    font-size: 10px;
    color: #888;
}

.msg-sender {
    font-size: 12px;
    color: var(--primary);
    margin-bottom: 2px;
    opacity: 0.8;
}
</style>
`;

// 📱 初始化：加载保存的聊天记录
(function initMobileChatStorage() {
    // 延迟加载，确保 commApi 已定义
    setTimeout(() => {
        if (window.commApi && window.commApi.loadFromStorage) {
            window.commApi.loadFromStorage();
            console.log('[📱手机通讯] 聊天存储已初始化');
        }
    }, 100);
})();

// 暴露给父页面的存档接口
window.getMobileSaveData = function() {
    if (window.commApi && window.commApi.exportSaveData) {
        return window.commApi.exportSaveData();
    }
    return null;
};

window.loadMobileSaveData = function(data) {
    if (window.commApi && window.commApi.importSaveData) {
        window.commApi.importSaveData(data);
    }
};

window.clearMobileData = function() {
    if (window.commApi && window.commApi.clearAllData) {
        window.commApi.clearAllData();
    }
};

// 📱 监听 storage 事件，当父页面修改 localStorage 时自动更新
// 注意：由于数据隔离脚本，实际存储的 key 是 game_mobileChatData
window.addEventListener('storage', function(event) {
    if (event.key === 'game_mobileChatData') {
        console.log('[📱手机通讯] 检测到外部存储变更');
        if (event.newValue === null) {
            // 数据被清除
            if (window.commApi) {
                window.commApi.chatStorage = {};
                window.commApi.contacts = [];
                window.commApi.currentChat = { name: '', id: '', type: 'private', groupInfo: null };
                window.commApi.pendingMessages = [];
                console.log('[📱手机通讯] 数据已被外部清除');
            }
        } else {
            // 数据被更新
            if (window.commApi && window.commApi.loadFromStorage) {
                window.commApi.loadFromStorage();
                console.log('[📱手机通讯] 数据已从外部更新');
            }
        }
    }
});
