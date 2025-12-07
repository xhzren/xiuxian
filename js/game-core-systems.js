/**
 * 游戏核心系统模块
 * 包含：数据持久化、存档管理、AI交互、游戏设置等
 * 从 game.html 中提取的核心功能模块
 */

// ==================== 全局变量声明 ====================
// 这些变量在 game.html 中已定义，这里仅作声明
// window.gameState
// window.apiConfig
// window.extraApiConfig
// window.contextVectorManager

// ==================== IndexedDB 数据库配置 ====================
// 根据游戏配置使用不同的数据库名称
// game-bhz.html 使用 BHZ_CONFIG, game.html 使用 GAME_CONFIG
const gameConfig = window.BHZ_CONFIG || window.GAME_CONFIG || {};
const DB_NAME = gameConfig.DB_NAME ? gameConfig.DB_NAME.replace('_dlc_db', '_game_db') : 'xiuxian_game_db';
const DB_VERSION = 2;
const STORE_NAME = 'game_saves';
const AUTO_SAVE_NAME = 'game_history';
let db = null;
console.log('[GameCore] 使用数据库:', DB_NAME);

// ==================== 数据持久化系统 ====================

/**
 * 📱 获取手机聊天数据（用于存档）
 */
function getMobileChatDataForSave() {
    // 尝试从 iframe 获取（需要单独 try-catch 因为跨域检查会抛异常）
    try {
        const mobileFrame = document.getElementById('mobileFrame');
        if (mobileFrame && mobileFrame.contentWindow) {
            // 单独 try-catch 跨域访问
            try {
                const getMobileSaveData = mobileFrame.contentWindow.getMobileSaveData;
                if (typeof getMobileSaveData === 'function') {
                    return getMobileSaveData();
                }
            } catch (crossOriginError) {
                // 跨域错误，静默忽略，尝试 localStorage
            }
        }
    } catch (e) {
        // iframe 不存在或其他错误
    }
    
    // 尝试从 localStorage 获取
    try {
        const saved = localStorage.getItem('mobileChatData');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.warn('[存档] 从 localStorage 获取手机聊天数据失败:', e);
    }
    return null;
}

/**
 * 📱 恢复手机聊天数据（从存档加载）
 * @param {Object|null} data - 手机聊天数据，如果为空则清除现有数据
 */
function restoreMobileChatData(data) {
    try {
        if (!data) {
            // 如果存档没有手机数据，清除现有的手机聊天
            clearMobileChatData();
            return;
        }
        
        // 保存到 localStorage（供 iframe 加载）
        localStorage.setItem('mobileChatData', JSON.stringify(data));
        
        // 尝试直接通知 iframe（单独 try-catch 处理跨域）
        try {
            const mobileFrame = document.getElementById('mobileFrame');
            if (mobileFrame && mobileFrame.contentWindow) {
                const loadMobileSaveData = mobileFrame.contentWindow.loadMobileSaveData;
                if (typeof loadMobileSaveData === 'function') {
                    loadMobileSaveData(data);
                }
            }
        } catch (crossOriginError) {
            // 跨域错误，静默忽略，数据已保存到 localStorage
        }
        console.log('[存档] 手机聊天数据已恢复');
    } catch (e) {
        console.warn('[存档] 恢复手机聊天数据失败:', e);
    }
}

/**
 * 📱 获取指定人物的私聊记录（用于主API人物图谱关联）
 * @param {string} characterName - 人物名称
 * @param {number} limit - 最大条数限制
 * @returns {Array} - 私聊记录数组
 */
function getMobileChatHistoryForCharacter(characterName, limit = 50) {
    try {
        // 获取手机聊天数据
        let mobileChatData = null;
        
        // 尝试从 iframe 获取（单独 try-catch 处理跨域）
        try {
            const mobileFrame = document.getElementById('mobileFrame');
            if (mobileFrame && mobileFrame.contentWindow) {
                const getMobileSaveData = mobileFrame.contentWindow.getMobileSaveData;
                if (typeof getMobileSaveData === 'function') {
                    mobileChatData = getMobileSaveData();
                }
            }
        } catch (crossOriginError) {
            // 跨域错误，静默忽略
        }
        
        // 如果 iframe 获取失败，尝试 localStorage
        if (!mobileChatData) {
            const saved = localStorage.getItem('mobileChatData');
            if (saved) mobileChatData = JSON.parse(saved);
        }
        
        if (!mobileChatData || !mobileChatData.chatStorage) {
            return [];
        }
        
        // 查找匹配的聊天记录
        const chatStorage = mobileChatData.chatStorage;
        for (const chatId of Object.keys(chatStorage)) {
            const chat = chatStorage[chatId];
            // 检查聊天名称是否包含人物名称（模糊匹配）
            if (chat.info && chat.info.name && chat.info.type === 'private') {
                const chatName = chat.info.name;
                // 模糊匹配：聊天名称包含人物名，或人物名包含聊天名称
                if (chatName.includes(characterName) || characterName.includes(chatName)) {
                    const messages = chat.messages || [];
                    // 取最近的 limit 条
                    const recentMsgs = messages.slice(-limit);
                    console.log(`[📱私聊关联] 找到 ${chatName} 的私聊记录: ${recentMsgs.length} 条`);
                    return recentMsgs.map(msg => ({
                        direction: msg.direction,
                        content: msg.content,
                        sender: msg.sender?.name || (msg.direction === 'outgoing' ? '我' : chatName),
                        timestamp: msg.timestamp
                    }));
                }
            }
        }
        
        return [];
    } catch (e) {
        console.warn('[📱私聊关联] 获取私聊记录失败:', e);
        return [];
    }
}

/**
 * 初始化 IndexedDB
 */
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => {
            console.error('IndexedDB 打开失败:', request.error);
            reject(request.error);
        };
        request.onsuccess = () => {
            db = request.result;
            console.log('IndexedDB 打开成功');
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (db.objectStoreNames.contains('game_history')) {
                db.deleteObjectStore('game_history');
            }
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                objectStore.createIndex('saveName', 'saveName', { unique: false });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                console.log('IndexedDB 对象存储创建成功');
            }
        };
    });
}

async function saveGameHistory() {
    return await saveGameToSlot(AUTO_SAVE_NAME);
}

async function saveGameToSlot(saveName, saveData = null) {
    if (!db) {
        try {
            await initDB();
        } catch (error) {
            console.error('无法初始化数据库:', error);
            return;
        }
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // 🔧 支持直接传入存档数据（用于导入备份）
        const gameData = saveData ? {
            ...saveData,
            saveName: saveName,
            timestamp: saveData.timestamp || Date.now()
        } : {
            saveName: saveName,
            timestamp: Date.now(),
            variables: JSON.parse(JSON.stringify(gameState.variables)),
            conversationHistory: JSON.parse(JSON.stringify(gameState.conversationHistory)),
            variableSnapshots: JSON.parse(JSON.stringify(gameState.variableSnapshots)),
            isGameStarted: gameState.isGameStarted,
            characterInfo: gameState.characterInfo,
            vectorEmbeddings: window.contextVectorManager ? 
                JSON.parse(JSON.stringify(window.contextVectorManager.conversationEmbeddings)) : [],
            // 🆕 保存history向量库
            historyEmbeddings: window.contextVectorManager ? 
                JSON.parse(JSON.stringify(window.contextVectorManager.historyEmbeddings)) : [],
            // 🆕 保存矩阵数据
            matrixData: window.matrixManager ? window.matrixManager.export() : null,
            // 🆕 保存人物图谱数据
            characterGraphData: window.characterGraphManager ? {
                characters: Array.from(window.characterGraphManager.characters.entries()),
                stats: window.characterGraphManager.stats
            } : null,
            // 📱 保存手机聊天数据
            mobileChatData: getMobileChatDataForSave(),
            // 📰 保存手机论坛数据
            mobileForumData: getMobileForumDataForSave(),
            dynamicWorld: JSON.parse(JSON.stringify(gameState.dynamicWorld))
        };
        const index = store.index('saveName');
        const getRequest = index.get(saveName);
        getRequest.onsuccess = () => {
            const existingSave = getRequest.result;
            if (existingSave) {
                gameData.id = existingSave.id;
                const updateRequest = store.put(gameData);
                updateRequest.onsuccess = () => {
                    console.log('存档已更新:', saveName);
                    resolve();
                };
                updateRequest.onerror = () => {
                    console.error('更新存档失败:', updateRequest.error);
                    reject(updateRequest.error);
                };
            } else {
                const addRequest = store.add(gameData);
                addRequest.onsuccess = () => {
                    console.log('新存档已保存:', saveName);
                    resolve();
                };
                addRequest.onerror = () => {
                    console.error('保存存档失败:', addRequest.error);
                    reject(addRequest.error);
                };
            }
        };
        getRequest.onerror = () => {
            console.error('查询存档失败:', getRequest.error);
            reject(getRequest.error);
        };
    });
}

async function loadGameHistory() {
    return await loadGameFromSlot(AUTO_SAVE_NAME);
}

async function loadGameFromSlot(saveName) {
    if (!db) {
        try {
            await initDB();
        } catch (error) {
            console.error('无法初始化数据库:', error);
            return null;
        }
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('saveName');
        const request = index.get(saveName);
        request.onsuccess = () => {
            const data = request.result;
            if (data) {
                console.log('从 IndexedDB 加载存档:', saveName);
                resolve(data);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => {
            console.error('加载存档失败:', request.error);
            reject(request.error);
        };
    });
}

async function getAllSaves() {
    if (!db) {
        try {
            await initDB();
        } catch (error) {
            console.error('无法初始化数据库:', error);
            return [];
        }
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const saves = request.result.filter(save => save.saveName !== AUTO_SAVE_NAME);
            resolve(saves);
        };
        request.onerror = () => {
            console.error('获取存档列表失败:', request.error);
            reject(request.error);
        };
    });
}

async function deleteSave(saveId) {
    if (!db) {
        try {
            await initDB();
        } catch (error) {
            console.error('无法初始化数据库:', error);
            return;
        }
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(saveId);
        request.onsuccess = () => {
            console.log('存档已删除');
            resolve();
        };
        request.onerror = () => {
            console.error('删除存档失败:', request.error);
            reject(request.error);
        };
    });
}

async function clearGameHistory() {
    if (!db) {
        try {
            await initDB();
        } catch (error) {
            console.error('无法初始化数据库:', error);
            return;
        }
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => {
            console.log('游戏历史已清除');
            // 📱 同时清除手机聊天数据
            clearMobileChatData();
            // 📰 同时清除手机论坛数据
            clearMobileForumData();
            resolve();
        };
        request.onerror = () => {
            console.error('清除游戏历史失败:', request.error);
            reject(request.error);
        };
    });
}

/**
 * 📱 清除手机聊天数据
 */
function clearMobileChatData() {
    try {
        // 清除 localStorage 中的手机聊天数据
        localStorage.removeItem('mobileChatData');
        
        // 尝试通知 iframe 清除数据
        try {
            const mobileFrame = document.getElementById('mobileFrame');
            if (mobileFrame && mobileFrame.contentWindow) {
                const clearMobileData = mobileFrame.contentWindow.clearMobileData;
                if (typeof clearMobileData === 'function') {
                    clearMobileData();
                }
            }
        } catch (crossOriginError) {
            // 跨域错误，静默忽略
        }
        console.log('[存档] 手机聊天数据已清除');
    } catch (e) {
        console.warn('[存档] 清除手机聊天数据失败:', e);
    }
}

/**
 * 📰 获取手机论坛数据（用于存档）
 */
function getMobileForumDataForSave() {
    // 尝试从 iframe 获取
    try {
        const mobileFrame = document.getElementById('mobileFrame');
        if (mobileFrame && mobileFrame.contentWindow) {
            try {
                const forumApi = mobileFrame.contentWindow.forumApi;
                if (forumApi && typeof forumApi.exportSaveData === 'function') {
                    return forumApi.exportSaveData();
                }
            } catch (crossOriginError) {
                // 跨域错误，静默忽略
            }
        }
    } catch (e) {
        // iframe 不存在或其他错误
    }
    
    // 尝试从 localStorage 获取
    try {
        const saved = localStorage.getItem('mobileForumData');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.warn('[存档] 从 localStorage 获取手机论坛数据失败:', e);
    }
    return null;
}

/**
 * 📰 恢复手机论坛数据（从存档加载）
 */
function restoreMobileForumData(data) {
    try {
        if (!data) {
            // 如果存档没有论坛数据，清除现有的论坛数据
            clearMobileForumData();
            return;
        }
        
        // 保存到 localStorage（供 iframe 加载）
        localStorage.setItem('mobileForumData', JSON.stringify(data));
        
        // 尝试直接通知 iframe
        try {
            const mobileFrame = document.getElementById('mobileFrame');
            if (mobileFrame && mobileFrame.contentWindow) {
                const forumApi = mobileFrame.contentWindow.forumApi;
                if (forumApi && typeof forumApi.importSaveData === 'function') {
                    forumApi.importSaveData(data);
                }
            }
        } catch (crossOriginError) {
            // 跨域错误，静默忽略
        }
        console.log('[存档] 手机论坛数据已恢复');
    } catch (e) {
        console.warn('[存档] 恢复手机论坛数据失败:', e);
    }
}

/**
 * 📰 清除手机论坛数据
 */
function clearMobileForumData() {
    try {
        localStorage.removeItem('mobileForumData');
        
        try {
            const mobileFrame = document.getElementById('mobileFrame');
            if (mobileFrame && mobileFrame.contentWindow) {
                // 方法1：发送消息通知论坛清除数据
                mobileFrame.contentWindow.postMessage({
                    type: 'MOBILE_FORUM_CLEAR'
                }, '*');
                
                // 方法2：直接调用论坛的清空函数
                const forumApi = mobileFrame.contentWindow.forumApi;
                if (forumApi && forumApi.clearAll) {
                    forumApi.clearAll();
                } else if (forumApi) {
                    // 备用：直接清空属性
                    forumApi.forumStorage = { 
                        myPosts: [], 
                        myComments: [], 
                        favorites: [], 
                        history: [],
                        postsCache: {},
                        commentsCache: {}
                    };
                    forumApi.postsCache = {};
                    forumApi.commentsCache = {};
                    forumApi.currentPost = null;
                    forumApi.currentTag = null;
                }
                console.log('[存档] 已清空论坛内存缓存');
            }
        } catch (crossOriginError) {
            // 跨域错误，静默忽略
        }
        console.log('[存档] 手机论坛数据已清除');
    } catch (e) {
        console.warn('[存档] 清除手机论坛数据失败:', e);
    }
}

// ==================== 存档管理系统 ====================

function exportSaveToFile(saveData, fileName) {
    const dataStr = JSON.stringify(saveData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || `修仙存档_${new Date().toLocaleString('zh-CN').replace(/[/:]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function exportCurrentGame() {
    const saveName = prompt('请为导出的存档命名：', gameState.variables.name || '我的存档');
    if (!saveName) return;
    const saveData = {
        saveName: saveName,
        timestamp: Date.now(),
        variables: JSON.parse(JSON.stringify(gameState.variables)),
        conversationHistory: JSON.parse(JSON.stringify(gameState.conversationHistory)),
        variableSnapshots: JSON.parse(JSON.stringify(gameState.variableSnapshots)),
        isGameStarted: gameState.isGameStarted,
        characterInfo: gameState.characterInfo,
        vectorEmbeddings: window.contextVectorManager ? 
            JSON.parse(JSON.stringify(window.contextVectorManager.conversationEmbeddings)) : [],
        // 🆕 导出history向量库
        historyEmbeddings: window.contextVectorManager ? 
            JSON.parse(JSON.stringify(window.contextVectorManager.historyEmbeddings)) : [],
        // 🆕 导出矩阵数据
        matrixData: window.matrixManager ? window.matrixManager.export() : null,
        // 🆕 导出人物图谱数据
        characterGraphData: window.characterGraphManager ? {
            characters: Array.from(window.characterGraphManager.characters.entries()),
            stats: window.characterGraphManager.stats
        } : null,
        dynamicWorld: JSON.parse(JSON.stringify(gameState.dynamicWorld)),
        // 📱 导出手机聊天数据
        mobileChatData: getMobileChatDataForSave(),
        // 📰 导出手机论坛数据
        mobileForumData: getMobileForumDataForSave()
    };
    exportSaveToFile(saveData, `${saveName}.json`);
    
    // 统计导出内容
    const vectorCount = saveData.vectorEmbeddings.length;
    const historyCount = saveData.historyEmbeddings.length;
    const matrixLayers = saveData.matrixData ? 
        (saveData.matrixData.conversationMatrix?.layers?.length || 0) + (saveData.matrixData.historyMatrix?.layers?.length || 0) : 0;
    const characterCount = saveData.characterGraphData ? saveData.characterGraphData.characters.length : 0;
    // 📱 统计手机数据
    const chatCount = saveData.mobileChatData?.chatStorage ? Object.keys(saveData.mobileChatData.chatStorage).length : 0;
    const forumPostCount = saveData.mobileForumData?.postsCache ? Object.keys(saveData.mobileForumData.postsCache).length : 0;
    
    alert(`✅ 存档已导出！\n\n包含内容：\n` +
          `• 对话向量：${vectorCount} 条\n` +
          `• History向量：${historyCount} 条\n` +
          `• 矩阵层数：${matrixLayers} 层\n` +
          `• 人物图谱：${characterCount} 人\n` +
          `• 📱 手机聊天：${chatCount} 个对话\n` +
          `• 📰 论坛帖子：${forumPostCount} 篇`);
}

function importSaveFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const saveData = JSON.parse(event.target.result);
                if (!saveData.variables || !saveData.conversationHistory) {
                    throw new Error('存档格式不正确');
                }
                
                // 🔧 统计存档内容
                const vectorCount = saveData.vectorEmbeddings?.length || 0;
                const historyCount = saveData.historyEmbeddings?.length || 0;
                const matrixLayers = saveData.matrixData ? 
                    (saveData.matrixData.conversationMatrix?.layers?.length || 0) + (saveData.matrixData.historyMatrix?.layers?.length || 0) : 0;
                const characterCount = saveData.characterGraphData?.characters?.length || 0;
                // 📱 统计手机数据
                const chatCount = saveData.mobileChatData?.chatStorage ? Object.keys(saveData.mobileChatData.chatStorage).length : 0;
                const forumPostCount = saveData.mobileForumData?.postsCache ? Object.keys(saveData.mobileForumData.postsCache).length : 0;
                
                let confirmMessage = `确定要导入存档"${saveData.saveName || file.name}"吗？\n\n包含内容：\n`;
                confirmMessage += `• 对话向量：${vectorCount} 条\n`;
                confirmMessage += `• History向量：${historyCount} 条\n`;
                confirmMessage += `• 矩阵层数：${matrixLayers} 层\n`;
                confirmMessage += `• 人物图谱：${characterCount} 人\n`;
                confirmMessage += `• 📱 手机聊天：${chatCount} 个对话\n`;
                confirmMessage += `• 📰 论坛帖子：${forumPostCount} 篇\n`;
                confirmMessage += `\n⚠️ 当前游戏进度将被覆盖！`;
                
                if (!confirm(confirmMessage)) {
                    return;
                }
                
                // 加载存档数据到游戏状态
                await loadSaveData(saveData);
                
                // 🔧 自动保存到IndexedDB（同时保存到指定槽位和自动存档）
                const saveName = saveData.saveName || '导入的存档';
                await saveGameToSlot(saveName); // 保存到具名存档
                await saveGameHistory(); // 同时更新自动存档
                console.log(`[导入存档] 已保存到IndexedDB: ${saveName} (含自动存档)`);
                
                alert(`✅ 存档导入成功！\n\n已恢复：\n` +
                      `• 对话向量：${vectorCount} 条\n` +
                      `• History向量：${historyCount} 条\n` +
                      `• 矩阵层数：${matrixLayers} 层\n` +
                      `• 人物图谱：${characterCount} 人\n` +
                      `• 📱 手机聊天：${chatCount} 个对话\n` +
                      `• 📰 论坛帖子：${forumPostCount} 篇\n\n` +
                      `已自动保存到本地数据库`);
            } catch (error) {
                alert('导入失败：' + error.message);
                console.error('导入存档失败:', error);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

async function saveCurrentGame() {
    const saveName = prompt('请为存档命名：', gameState.variables.name || '我的存档');
    if (!saveName) return;
    try {
        await saveGameToSlot(saveName);
        alert('存档保存成功！');
    } catch (error) {
        alert('存档保存失败：' + error.message);
    }
}

async function showLoadSaveMenu() {
    const saves = await getAllSaves();
    if (saves.length === 0) {
        alert('暂无存档');
        return;
    }
    const historyDiv = document.getElementById('gameHistory');
    let html = `<div style="padding: 20px;"><h2 style="color: #8b4513; margin-bottom: 20px;">📂 加载存档</h2><div style="display: flex; flex-direction: column; gap: 10px;">`;
    saves.forEach(save => {
        const date = new Date(save.timestamp).toLocaleString('zh-CN');
        const charName = save.variables?.name || '未命名';
        const realm = save.variables?.realm || '凡人';
        
        // 🆕 统计存档内容
        const vectorCount = save.vectorEmbeddings?.length || 0;
        const historyCount = save.historyEmbeddings?.length || 0;
        const matrixLayers = save.matrixData ? 
            (save.matrixData.conversationMatrix?.layers?.length || 0) + (save.matrixData.historyMatrix?.layers?.length || 0) : 0;
        const characterCount = save.characterGraphData?.characters?.length || 0;
        
        html += `<div style="background: #fdfcf8; border: 2px solid #c19a6b; border-radius: 6px; padding: 15px; cursor: pointer;" onclick="loadSelectedSave(${save.id})">
            <div style="font-weight: bold; font-size: 16px; color: #8b4513; margin-bottom: 5px;">${save.saveName}</div>
            <div style="font-size: 13px; color: #666;">角色：${charName} | 境界：${realm}</div>
            <div style="font-size: 11px; color: #888; margin-top: 5px;">
                📊 向量:${vectorCount} | History:${historyCount} | 矩阵:${matrixLayers}层 | 人物:${characterCount}人
            </div>
            <div style="font-size: 12px; color: #999; margin-top: 5px;">${date}</div>
            <button class="btn btn-danger" style="margin-top: 10px; padding: 5px 15px; font-size: 12px;" onclick="event.stopPropagation(); deleteSelectedSave(${save.id});">删除</button>
        </div>`;
    });
    html += `</div><button class="btn btn-secondary" onclick="closeLoadSaveMenu()" style="margin-top: 20px; width: 100%;">返回</button></div>`;
    historyDiv.innerHTML = html;
}

async function loadSelectedSave(saveId) {
    try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(saveId);
        request.onsuccess = async () => {
            const saveData = request.result;
            if (saveData) {
                await loadSaveData(saveData);
                
                // 🆕 统计加载内容
                const vectorCount = saveData.vectorEmbeddings?.length || 0;
                const historyCount = saveData.historyEmbeddings?.length || 0;
                const matrixLayers = saveData.matrixData ? 
                    (saveData.matrixData.conversationMatrix?.layers?.length || 0) + (saveData.matrixData.historyMatrix?.layers?.length || 0) : 0;
                const characterCount = saveData.characterGraphData?.characters?.length || 0;
                
                alert(`✅ 存档加载成功！\n\n已恢复：\n` +
                      `• 对话向量：${vectorCount} 条\n` +
                      `• History向量：${historyCount} 条\n` +
                      `• 矩阵层数：${matrixLayers} 层\n` +
                      `• 人物图谱：${characterCount} 人`);
            }
        };
    } catch (error) {
        alert('加载失败：' + error.message);
    }
}

async function deleteSelectedSave(saveId) {
    if (!confirm('确定要删除这个存档吗？')) return;
    try {
        await deleteSave(saveId);
        showLoadSaveMenu();
    } catch (error) {
        alert('删除失败：' + error.message);
    }
}

function closeLoadSaveMenu() {
    showMainMenu();
}

// ==================== AI交互系统 / API配置 ====================

function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connectionStatus');
    if (indicator) {
        indicator.className = 'status-indicator ' + (connected ? 'status-connected' : 'status-disconnected');
    }
}

function updateExtraConnectionStatus(connected) {
    const indicator = document.getElementById('extraConnectionStatus');
    if (indicator) {
        indicator.className = 'status-indicator ' + (connected ? 'status-connected' : 'status-disconnected');
    }
}

function displayModels(models) {
    const modelSelect = document.getElementById('modelSelect');
    modelSelect.innerHTML = '';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
    });
    if (models.length > 0) {
        modelSelect.selectedIndex = 0;
    }
}

function saveConnection() {
    const modelSelect = document.getElementById('modelSelect');
    const selectedModel = modelSelect.value;
    if (!selectedModel) {
        alert('请先从列表中选择一个模型');
        return;
    }
    apiConfig.type = document.getElementById('apiType').value;
    apiConfig.endpoint = document.getElementById('apiEndpoint').value;
    apiConfig.key = document.getElementById('apiKey').value;
    apiConfig.model = selectedModel;
    const saved = localStorage.getItem('gameConfig');
    let config = saved ? JSON.parse(saved) : {};
    config.type = apiConfig.type;
    config.endpoint = apiConfig.endpoint;
    config.key = apiConfig.key;
    config.model = apiConfig.model;
    config.availableModels = apiConfig.availableModels;
    localStorage.setItem('gameConfig', JSON.stringify(config));
    alert('API配置已保存！\n模型: ' + selectedModel);
    updateConnectionStatus(true);
    document.getElementById('fetchModelsBtn').innerHTML = '<span class="status-indicator status-connected"></span> 已连接 - ' + selectedModel.substring(0, 20);
}

function toggleExtraApiFields() {
    const enabled = document.getElementById('enableExtraApi').checked;
    const fieldsDiv = document.getElementById('extraApiFields');
    extraApiConfig.enabled = enabled;
    if (enabled) {
        fieldsDiv.style.display = 'block';
    } else {
        fieldsDiv.style.display = 'none';
    }
    saveExtraApiEnabled();
}

function saveExtraApiEnabled() {
    const saved = localStorage.getItem('gameConfig');
    let config = saved ? JSON.parse(saved) : {};
    if (!config.extraApi) {
        config.extraApi = {};
    }
    config.extraApi.enabled = extraApiConfig.enabled;
    localStorage.setItem('gameConfig', JSON.stringify(config));
}

function displayExtraModels(models) {
    const modelSelect = document.getElementById('extraModelSelect');
    modelSelect.innerHTML = '';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
    });
    if (models.length > 0) {
        modelSelect.selectedIndex = 0;
    }
}

function saveExtraConnection() {
    const modelSelect = document.getElementById('extraModelSelect');
    const selectedModel = modelSelect.value;
    if (!selectedModel) {
        alert('请先从列表中选择一个模型');
        return;
    }
    extraApiConfig.type = document.getElementById('extraApiType').value;
    extraApiConfig.endpoint = document.getElementById('extraApiEndpoint').value;
    extraApiConfig.key = document.getElementById('extraApiKey').value;
    extraApiConfig.model = selectedModel;
    const saved = localStorage.getItem('gameConfig');
    let config = saved ? JSON.parse(saved) : {};
    config.extraApi = {
        enabled: extraApiConfig.enabled,
        type: extraApiConfig.type,
        endpoint: extraApiConfig.endpoint,
        key: extraApiConfig.key,
        model: extraApiConfig.model,
        availableModels: extraApiConfig.availableModels
    };
    localStorage.setItem('gameConfig', JSON.stringify(config));
    alert('额外API配置已保存！\n模型: ' + selectedModel);
    updateExtraConnectionStatus(true);
    document.getElementById('fetchExtraModelsBtn').innerHTML = '<span class="status-indicator status-connected"></span> 已连接 - ' + selectedModel.substring(0, 20);
}

// ==================== 游戏设置 ====================

function saveGameSettings() {
    const historyDepth = document.getElementById('historyDepth').value;
    const minWordCount = document.getElementById('minWordCount').value;
    const maxTokens = document.getElementById('maxTokens').value;
    const enableVectorRetrieval = document.getElementById('enableVectorRetrieval').checked;
    const vectorMethod = document.getElementById('vectorMethod').value;
    const maxRetrieveCount = document.getElementById('maxRetrieveCount').value;
    const similarityThreshold = document.getElementById('similarityThreshold').value;
    const minTurnGap = document.getElementById('minTurnGap').value;
    const includeRecentAIReplies = document.getElementById('includeRecentAIReplies').value;
    // 🆕 History矩阵设置
    const recentHistoryCount = document.getElementById('recentHistoryCount').value;
    const matrixHistoryCount = document.getElementById('matrixHistoryCount').value;
    const narrativePerspective = document.getElementById('narrativePerspective').value;
    const systemPromptContent = document.getElementById('systemPrompt').value;
    
    const saved = localStorage.getItem('gameConfig');
    let config = saved ? JSON.parse(saved) : {};
    config.historyDepth = parseInt(historyDepth);
    config.minWordCount = parseInt(minWordCount);
    config.maxTokens = parseInt(maxTokens);
    config.enableVectorRetrieval = enableVectorRetrieval;
    config.vectorMethod = vectorMethod;
    config.maxRetrieveCount = parseInt(maxRetrieveCount);
    config.similarityThreshold = parseFloat(similarityThreshold);
    config.minTurnGap = parseInt(minTurnGap);
    config.includeRecentAIReplies = parseInt(includeRecentAIReplies);
    // 🆕 保存History矩阵设置
    config.recentHistoryCount = parseInt(recentHistoryCount);
    config.matrixHistoryCount = parseInt(matrixHistoryCount);
    config.narrativePerspective = narrativePerspective;
    config.systemPrompt = systemPromptContent;
    
    localStorage.setItem('gameConfig', JSON.stringify(config));
    
    if (window.contextVectorManager) {
        const systemPromptItem = window.contextVectorManager.staticKnowledgeBase.find(item => item.id === 'system_prompt_main');
        if (systemPromptItem) {
            systemPromptItem.content = systemPromptContent;
            console.log('[系统提示词] 已更新知识库中的系统提示词条目');
            window.contextVectorManager.saveStaticKBToIndexedDB().then(() => {
                console.log('[系统提示词] 已保存到IndexedDB');
            }).catch(error => {
                console.warn('[系统提示词] 保存到IndexedDB失败:', error);
            });
        }
        window.contextVectorManager.maxRetrieveCount = parseInt(maxRetrieveCount);
        window.contextVectorManager.minSimilarityThreshold = parseFloat(similarityThreshold);
        window.contextVectorManager.minTurnGap = parseInt(minTurnGap);
        window.contextVectorManager.includeRecentAIRepliesInQuery = parseInt(includeRecentAIReplies);
        // 🆕 更新History矩阵设置
        window.contextVectorManager.recentHistoryCount = parseInt(recentHistoryCount);
        window.contextVectorManager.matrixHistoryCount = parseInt(matrixHistoryCount);
        console.log(`[向量检索] 已更新配置 - 查询包含AI回复轮数: ${includeRecentAIReplies}`);
        console.log(`[History矩阵] 已更新配置 - 最近条数: ${recentHistoryCount}, 矩阵检索条数: ${matrixHistoryCount}`);
    }
    
    const perspectiveText = {
        'first': '第一人称',
        'second': '第二人称',
        'third': '第三人称'
    };
    alert('游戏设置已保存！\n历史层数: ' + historyDepth + '\n最小字数: ' + minWordCount + '\n向量检索: ' + (enableVectorRetrieval ? '已启用' : '已禁用') + '\n叙事视角: ' + perspectiveText[narrativePerspective] + '\n系统提示词: 已更新知识库');
}

function toggleVectorRetrieval() {
    const enabled = document.getElementById('enableVectorRetrieval').checked;
    const settingsDiv = document.getElementById('vectorRetrievalSettings');
    if (enabled) {
        settingsDiv.style.display = 'block';
    } else {
        settingsDiv.style.display = 'none';
    }
}

async function changeVectorMethod() {
    const method = document.getElementById('vectorMethod').value;
    const downloadSection = document.getElementById('downloadModelSection');
    
    // 显示/隐藏下载按钮区域
    if (downloadSection) {
        if (method === 'transformers') {
            downloadSection.style.display = 'block';
            checkModelStatus(); // 检查模型缓存状态
        } else {
            downloadSection.style.display = 'none';
        }
    }
    
    if (window.contextVectorManager) {
        window.contextVectorManager.setEmbeddingMethod(method);
        if (method === 'api') {
            alert('💡 提示：API向量化需要配置额外API\n\n在"额外API设置"中启用并配置一个支持embeddings的API（如OpenAI）\n\n将自动调用 /embeddings 端点获取向量');
        }
    }
}

/**
 * 检查浏览器AI模型的缓存状态
 */
function checkModelStatus() {
    const statusEl = document.getElementById('modelStatus');
    const btnEl = document.getElementById('downloadModelBtn');
    
    if (!statusEl || !btnEl) return;
    
    // 检查localStorage中的标记
    const modelReady = localStorage.getItem('transformers_model_ready') === '1';
    
    if (modelReady) {
        statusEl.textContent = '✅ 已缓存';
        statusEl.style.color = '#28a745';
        btnEl.textContent = '🔄 重新下载模型';
        btnEl.style.background = '#6c757d';
    } else {
        statusEl.textContent = '❌ 未缓存';
        statusEl.style.color = '#dc3545';
        btnEl.textContent = '📥 预下载模型（约13MB）';
        btnEl.style.background = '#667eea';
    }
}

/**
 * 预下载浏览器AI模型
 */
async function predownloadModel() {
    const btnEl = document.getElementById('downloadModelBtn');
    const statusEl = document.getElementById('modelStatus');
    
    if (!btnEl || !statusEl) return;
    
    // 禁用按钮
    btnEl.disabled = true;
    const originalText = btnEl.textContent;
    btnEl.textContent = '⏳ 准备下载...';
    statusEl.textContent = '准备中...';
    statusEl.style.color = '#ffc107';
    
    try {
        console.log('[预下载模型] 开始加载 Transformers.js 库...');
        
        // 1. 先加载 Transformers.js 库
        if (typeof window.loadTransformersJS === 'function') {
            await window.loadTransformersJS();
        } else {
            throw new Error('loadTransformersJS 函数未定义');
        }
        
        console.log('[预下载模型] 库加载完成，开始下载模型...');
        btnEl.textContent = '📥 正在下载...';
        statusEl.textContent = '下载中...';
        
        // 2. 触发模型下载（通过调用一次向量生成）
        if (window.contextVectorManager) {
            await window.contextVectorManager.getEmbeddingFromTransformers('预下载测试');
            console.log('[预下载模型] ✅ 模型下载并缓存成功！');
            
            // 更新状态
            statusEl.textContent = '✅ 已缓存';
            statusEl.style.color = '#28a745';
            btnEl.textContent = '✅ 下载完成！';
            btnEl.style.background = '#28a745';
            
            // 3秒后恢复按钮
            setTimeout(() => {
                btnEl.textContent = '🔄 重新下载模型';
                btnEl.style.background = '#6c757d';
                btnEl.disabled = false;
            }, 3000);
            
            alert('✅ 模型下载成功！\n\n模型已缓存到浏览器，下次使用时无需等待下载。\n\n💡 提示：你现在可以离线使用浏览器AI模型了！');
            
        } else {
            throw new Error('contextVectorManager 未初始化');
        }
        
    } catch (error) {
        console.error('[预下载模型] ❌ 下载失败:', error);
        
        // 更新状态为失败
        statusEl.textContent = '❌ 下载失败';
        statusEl.style.color = '#dc3545';
        btnEl.textContent = '❌ 下载失败，点击重试';
        btnEl.style.background = '#dc3545';
        btnEl.disabled = false;
        
        // 显示详细错误信息
        let errorMsg = '模型下载失败！\n\n';
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            errorMsg += '❌ 网络错误\n\n可能原因：\n1. 网络连接不稳定\n2. HuggingFace CDN 访问受限\n3. 需要使用代理/VPN\n\n建议：\n- 检查网络连接\n- 稍后重试\n- 或使用代理访问';
        } else {
            errorMsg += '错误详情：\n' + error.message;
        }
        
        alert(errorMsg);
    }
}

function toggleDynamicWorldFields() {
    const enabled = document.getElementById('enableDynamicWorld').checked;
    const fieldsDiv = document.getElementById('dynamicWorldFields');
    if (enabled) {
        fieldsDiv.style.display = 'block';
    } else {
        fieldsDiv.style.display = 'none';
    }
    const saved = localStorage.getItem('gameConfig');
    let config = saved ? JSON.parse(saved) : {};
    if (!config.dynamicWorld) config.dynamicWorld = {};
    config.dynamicWorld.enabled = enabled;
    localStorage.setItem('gameConfig', JSON.stringify(config));
    if (gameState.dynamicWorld) {
        gameState.dynamicWorld.enabled = enabled;
    }
}

function saveDynamicWorldSettings() {
    const historyDepth = document.getElementById('dynamicWorldHistoryDepth').value;
    const minWords = document.getElementById('dynamicWorldMinWords').value;
    const interval = document.getElementById('dynamicWorldInterval').value;
    const showReasoning = document.getElementById('dynamicWorldShowReasoning').checked;
    const enableKnowledge = document.getElementById('dynamicWorldEnableKnowledge').checked;
    const prompt = document.getElementById('dynamicWorldPrompt').value;
    
    const saved = localStorage.getItem('gameConfig');
    let config = saved ? JSON.parse(saved) : {};
    if (!config.dynamicWorld) config.dynamicWorld = {};
    config.dynamicWorld.historyDepth = parseInt(historyDepth);
    config.dynamicWorld.minWords = parseInt(minWords);
    config.dynamicWorld.messageInterval = parseInt(interval);
    config.dynamicWorld.showReasoning = showReasoning;
    config.dynamicWorld.enableKnowledge = enableKnowledge;
    config.dynamicWorld.prompt = prompt;
    
    localStorage.setItem('gameConfig', JSON.stringify(config));
    alert('动态世界设置已保存！');
}

// ==================== 消息管理 ====================

let deleteMode = false;
let selectedMessages = new Set();

function toggleDeleteMode() {
    deleteMode = !deleteMode;
    // 同步到gameState
    if (window.gameState) {
        window.gameState.deleteMode = deleteMode;
    }
    const btn = document.getElementById('deleteToggleBtn');
    const deleteControls = document.getElementById('deleteControls');
    const historyDiv = document.getElementById('gameHistory');
    
    if (deleteMode) {
        btn.classList.add('active');
        btn.textContent = '❌ 取消删除';
        deleteControls.style.display = 'flex';
        historyDiv.classList.add('delete-mode-active');
        const messages = historyDiv.querySelectorAll('.message');
        messages.forEach((msg, index) => {
            let checkbox = msg.querySelector('.message-checkbox');
            if (!checkbox) {
                // 创建新的复选框
                checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'message-checkbox';
                checkbox.style.display = 'inline-block';
                msg.insertBefore(checkbox, msg.firstChild);
            } else {
                // 如果复选框已存在，确保它可见
                checkbox.style.display = 'inline-block';
            }
            
            // 无论复选框是新建还是已存在，都重新绑定事件和设置索引
            checkbox.dataset.index = index;
            // 移除旧的事件监听器（通过克隆节点）
            const newCheckbox = checkbox.cloneNode(true);
            checkbox.parentNode.replaceChild(newCheckbox, checkbox);
            
            // 绑定新的事件处理器
            newCheckbox.onchange = (e) => {
                if (e.target.checked) {
                    selectedMessages.add(index);
                    msg.classList.add('selected-for-delete');
                } else {
                    selectedMessages.delete(index);
                    msg.classList.remove('selected-for-delete');
                }
            };
        });
    } else {
        btn.classList.remove('active');
        btn.textContent = '🗑️';
        deleteControls.style.display = 'none';
        historyDiv.classList.remove('delete-mode-active');
        const checkboxes = historyDiv.querySelectorAll('.message-checkbox');
        checkboxes.forEach(cb => cb.remove());
        selectedMessages.clear();
        const messages = historyDiv.querySelectorAll('.message');
        messages.forEach(msg => msg.classList.remove('selected-for-delete'));
        
        // 退出删除模式后，更新楼层指示器
        setTimeout(() => {
            if (typeof window.MessageFloorIndicator === 'object' && window.MessageFloorIndicator.updateAllFloorIndicators) {
                window.MessageFloorIndicator.updateAllFloorIndicators();
            }
        }, 100);
    }
}

function confirmDelete() {
    if (selectedMessages.size === 0) {
        alert('请先选择要删除的消息');
        return;
    }
    
    const historyDiv = document.getElementById('gameHistory');
    const allSelectedMessages = Array.from(historyDiv.querySelectorAll('.message')).filter((_, i) => selectedMessages.has(i));
    
    if (allSelectedMessages.length === 0) {
        alert('请先选择要删除的消息');
        return;
    }
    
    if (!confirm(`确定要删除选中的 ${allSelectedMessages.length} 条消息吗？\n这将同时删除对应的对话历史记录和回滚变量。`)) {
        return;
    }
    
    const allMessages = Array.from(historyDiv.querySelectorAll('.message'));
    const firstSelectedIndex = allMessages.indexOf(allSelectedMessages[0]);
    const deleteCount = allSelectedMessages.length;
    
    // 保存动态世界的独立数据（在回滚前保存）
    const dynamicWorldBackup = {
        history: JSON.parse(JSON.stringify(gameState.dynamicWorld?.history || [])),
        floor: gameState.dynamicWorld?.floor || 0
    };
    
    // 回滚变量到删除点之前的状态
    if (firstSelectedIndex > 0 && gameState.variableSnapshots.length > firstSelectedIndex - 1) {
        gameState.variables = JSON.parse(JSON.stringify(gameState.variableSnapshots[firstSelectedIndex - 1]));
        console.log(`变量已回滚到第${firstSelectedIndex}条消息之前的状态`);
    } else if (firstSelectedIndex === 0) {
        console.log('删除从第一条消息开始，变量保持当前状态');
    }
    
    // 恢复动态世界的独立数据（回滚后恢复）
    if (gameState.dynamicWorld) {
        gameState.dynamicWorld.history = dynamicWorldBackup.history;
        gameState.dynamicWorld.floor = dynamicWorldBackup.floor;
        console.log('[删除消息] 已保护动态世界数据不被回滚');
    }
    
    // 从conversationHistory中删除对应的记录
    gameState.conversationHistory.splice(firstSelectedIndex, deleteCount);
    gameState.variableSnapshots.splice(firstSelectedIndex, deleteCount);
    
    // 🆕 从向量库中删除对应的条目
    if (window.contextVectorManager) {
        const turnIndexStart = Math.floor(firstSelectedIndex / 2) + 1; // 计算起始轮次
        const turnIndexEnd = Math.floor((firstSelectedIndex + deleteCount) / 2); // 计算结束轮次
        
        let deletedVectorCount = 0;
        for (let turnIndex = turnIndexStart; turnIndex <= turnIndexEnd; turnIndex++) {
            const vectorIndex = window.contextVectorManager.conversationEmbeddings.findIndex(
                conv => conv.turnIndex === turnIndex
            );
            if (vectorIndex !== -1) {
                window.contextVectorManager.conversationEmbeddings.splice(vectorIndex, 1);
                deletedVectorCount++;
            }
        }
        
        // 重新调整后续轮次的索引
        window.contextVectorManager.conversationEmbeddings.forEach(conv => {
            if (conv.turnIndex > turnIndexEnd) {
                conv.turnIndex -= (turnIndexEnd - turnIndexStart + 1);
            }
        });
        
        if (deletedVectorCount > 0) {
            console.log(`[向量库] 已删除 ${deletedVectorCount} 条向量记录`);
            // 保存到IndexedDB
            window.contextVectorManager.saveToIndexedDB().catch(err => 
                console.warn('[向量库] 保存失败:', err)
            );
        }
    }
    
    // 从UI中删除消息
    allSelectedMessages.forEach(msg => msg.remove());
    
    // 更新状态面板显示
    if (typeof updateStatusPanel === 'function') {
        updateStatusPanel();
    }
    
    saveGameHistory().catch(err => console.error('保存失败:', err));
    cancelDelete();
    alert(`已删除 ${deleteCount} 条消息！\n变量已回滚到删除点之前的状态。\n\n💡 提示：动态世界数据已保护，不会被删除。`);
}

function cancelDelete() {
    toggleDeleteMode();
}

// ==================== 调试功能 ====================

let debugMode = false;

function toggleDebugMode() {
    debugMode = document.getElementById('debugMode').checked;
    const debugOutput = document.getElementById('debugOutput');
    if (debugOutput) {
        debugOutput.style.display = debugMode ? 'block' : 'none';
    }
    console.log('[调试模式]', debugMode ? '已开启' : '已关闭');
}

function showDebugOutput(content) {
    if (!debugMode) return;
    const debugOutput = document.getElementById('debugOutput');
    if (debugOutput) {
        debugOutput.textContent = content;
        debugOutput.scrollTop = debugOutput.scrollHeight;
    }
}

// ==================== 弹窗管理 ====================

function openConfigModal() {
    const modal = document.getElementById('configModal');
    const overlay = document.getElementById('configModalOverlay');
    
    if (!modal || !overlay) {
        console.error('[GameCore] 配置模态框不存在，尝试重新生成');
        try {
            if (typeof generateConfigModal === 'function') {
                generateConfigModal();
                // 重新获取元素
                setTimeout(() => {
                    const newModal = document.getElementById('configModal');
                    const newOverlay = document.getElementById('configModalOverlay');
                    if (newModal && newOverlay) {
                        newModal.classList.add('show');
                        newOverlay.classList.add('show');
                    }
                }, 100);
            } else {
                console.error('[GameCore] generateConfigModal 函数不存在');
            }
        } catch (error) {
            console.error('[GameCore] 生成配置模态框失败:', error);
        }
        return;
    }
    
    modal.classList.add('show');
    overlay.classList.add('show');
}

function closeConfigModal() {
    const modal = document.getElementById('configModal');
    const overlay = document.getElementById('configModalOverlay');
    
    if (modal) {
        modal.classList.remove('show');
    }
    if (overlay) {
        overlay.classList.remove('show');
    }
}

function toggleSection(sectionId) {
    const content = document.getElementById(sectionId);
    const header = content.previousElementSibling;
    if (content.classList.contains('show')) {
        content.classList.remove('show');
        header.classList.add('collapsed');
    } else {
        content.classList.add('show');
        header.classList.remove('collapsed');
    }
}

// ==================== 格式化游戏 ====================

async function formatGame() {
    if (!confirm('⚠️ 警告：此操作将清空所有数据！\n\n包括：\n- 所有存档\n- 游戏历史\n- 向量记忆\n- DLC知识包\n\n✅ 将保留：\n- API配置\n- 游戏设置\n- 动态世界设置\n\n此操作不可恢复！确定要继续吗？')) {
        return;
    }
    if (!confirm('⚠️ 最后确认：真的要格式化所有数据吗？')) {
        return;
    }
    try {
        // 保存需要保留的配置
        const gameConfig = localStorage.getItem('gameConfig');
        const extraApiConfig = localStorage.getItem('extraApiConfig');
        const staticKBFiles = localStorage.getItem('staticKBFiles');
        const transformersReady = localStorage.getItem('transformers_model_ready');
        
        console.log('[格式化] 正在保留配置数据...');
        
        // 清空游戏历史
        await clearGameHistory();
        
        // 清空localStorage
        localStorage.clear();
        
        // 恢复保留的配置
        if (gameConfig) {
            localStorage.setItem('gameConfig', gameConfig);
            console.log('[格式化] ✓ 已恢复 API 配置和游戏设置');
        }
        if (extraApiConfig) {
            localStorage.setItem('extraApiConfig', extraApiConfig);
            console.log('[格式化] ✓ 已恢复额外 API 配置');
        }
        if (staticKBFiles) {
            localStorage.setItem('staticKBFiles', staticKBFiles);
            console.log('[格式化] ✓ 已恢复静态知识库文件配置');
        }
        if (transformersReady) {
            localStorage.setItem('transformers_model_ready', transformersReady);
            console.log('[格式化] ✓ 已恢复 Transformers 模型状态');
        }
        
        // 清空向量库
        if (window.contextVectorManager) {
            window.contextVectorManager.clear();
            await window.contextVectorManager.clearIndexedDB();
        }
        
        // 清空DLC数据
        if (window.dlcManager) {
            await window.dlcManager.clearAllDLCs();
        }
        
        alert('✅ 格式化完成！\n\n已保留：\n- API 配置\n- 游戏设置\n- 动态世界设置\n\n页面将自动刷新...');
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    } catch (error) {
        alert('格式化失败：' + error.message);
        console.error('格式化失败:', error);
    }
}

// ==================== 数据加载和同步系统 ====================

/**
 * 🆕 去重history数组
 */
function deduplicateHistory(historyArray) {
    if (!Array.isArray(historyArray)) return [];
    
    const seen = new Set();
    return historyArray.filter(item => {
        const trimmed = item.trim();
        if (!trimmed || seen.has(trimmed)) {
            return false;
        }
        seen.add(trimmed);
        return true;
    });
}

/**
 * 🆕 全局函数：立即修复当前游戏中的重复history
 */
window.fixDuplicateHistory = function() {
    if (!gameState.variables.history || !Array.isArray(gameState.variables.history)) {
        console.log('[History修复] 没有history数据');
        return;
    }
    
    const originalLength = gameState.variables.history.length;
    gameState.variables.history = deduplicateHistory(gameState.variables.history);
    const newLength = gameState.variables.history.length;
    const removed = originalLength - newLength;
    
    console.log(`[History修复] 完成！`);
    console.log(`  原始: ${originalLength} 条`);
    console.log(`  现在: ${newLength} 条`);
    console.log(`  删除: ${removed} 条重复`);
    
    if (removed > 0) {
        // 自动保存修复后的数据
        saveGameToSlot('自动存档');
        alert(`✅ History修复完成！\n\n删除了 ${removed} 条重复记录\n已自动保存到"自动存档"`);
    } else {
        alert('✅ History没有重复记录！');
    }
};

/**
 * 加载存档数据到游戏
 */
async function loadSaveData(saveData) {
    gameState.variables = saveData.variables;
    
    // 🔧 加载后立即去重history
    if (gameState.variables.history && Array.isArray(gameState.variables.history)) {
        const originalLength = gameState.variables.history.length;
        gameState.variables.history = deduplicateHistory(gameState.variables.history);
        const newLength = gameState.variables.history.length;
        if (originalLength !== newLength) {
            console.log(`[存档加载] 🧹 去重history: ${originalLength} → ${newLength} 条`);
        }
    }
    
    gameState.conversationHistory = saveData.conversationHistory;
    gameState.variableSnapshots = saveData.variableSnapshots;
    gameState.isGameStarted = saveData.isGameStarted;
    gameState.characterInfo = saveData.characterInfo;
    
    // 🆕 恢复向量库数据
    if (saveData.vectorEmbeddings && window.contextVectorManager) {
        window.contextVectorManager.conversationEmbeddings = saveData.vectorEmbeddings;
        console.log(`[向量库] 已从存档恢复 ${saveData.vectorEmbeddings.length} 条对话记忆`);
    } else if (!saveData.vectorEmbeddings) {
        // 如果是旧版存档（没有向量库），提示用户同步
        console.warn('[向量库] 旧版存档，建议手动同步向量库');
    }
    
    // 🆕 恢复history向量库
    if (saveData.historyEmbeddings && window.contextVectorManager) {
        window.contextVectorManager.historyEmbeddings = saveData.historyEmbeddings;
        console.log(`[History向量库] 已从存档恢复 ${saveData.historyEmbeddings.length} 条history记忆`);
    }
    
    // 🔧 修复：统一保存向量库到IndexedDB（包括history）
    if (window.contextVectorManager) {
        await window.contextVectorManager.saveToIndexedDB();
        console.log(`[向量库] ✅ 已同步到IndexedDB（对话:${window.contextVectorManager.conversationEmbeddings.length}条, History:${window.contextVectorManager.historyEmbeddings.length}条）`);
    }
    
    // 🆕 恢复矩阵数据
    if (saveData.matrixData && window.matrixManager) {
        window.matrixManager.import(saveData.matrixData);
        console.log(`[矩阵管理器] 已从存档恢复矩阵数据`);
    } else if (window.matrixManager) {
        // 如果存档中没有矩阵数据，但有向量库，可以重建矩阵
        if (window.contextVectorManager && window.contextVectorManager.conversationEmbeddings.length > 0) {
            console.log('[矩阵管理器] 存档无矩阵数据，尝试从向量库重建...');
            await window.matrixManager.initializeFromHistory();
        }
        if (window.contextVectorManager && window.contextVectorManager.historyEmbeddings.length > 0) {
            console.log('[矩阵管理器] 尝试从history向量库重建矩阵...');
            await window.matrixManager.initializeHistoryMatrix();
        }
    }
    
    // 🆕 恢复人物图谱数据
    if (saveData.characterGraphData && window.characterGraphManager) {
        console.log(`[人物图谱] 开始从存档恢复数据...`);
        
        // 清空现有数据
        window.characterGraphManager.characters.clear();
        window.characterGraphManager.vectors.clear();
        
        // 恢复人物数据
        const characters = saveData.characterGraphData.characters || [];
        let restoredCount = 0;
        
        for (const [name, character] of characters) {
            try {
                // 重新生成向量
                const vector = await window.characterGraphManager.generateVector(
                    character.name,
                    character.personality,
                    character.appearance
                );
                
                // 保存到内存（不包含vector）
                window.characterGraphManager.characters.set(name, character);
                window.characterGraphManager.vectors.set(name, vector);
                
                // 保存到IndexedDB
                await window.characterGraphManager.saveCharacter(character);
                
                restoredCount++;
            } catch (error) {
                console.error(`[人物图谱] ⚠️ 恢复人物失败: ${name}`, error);
            }
        }
        
        // 恢复统计信息
        if (saveData.characterGraphData.stats) {
            window.characterGraphManager.stats = saveData.characterGraphData.stats;
        }
        
        console.log(`[人物图谱] ✅ 已从存档恢复 ${restoredCount} 个人物`);
    } else if (!saveData.characterGraphData && window.characterGraphManager) {
        // 旧版存档，清空人物图谱
        console.warn('[人物图谱] 旧版存档，清空人物图谱数据');
        window.characterGraphManager.characters.clear();
        window.characterGraphManager.vectors.clear();
    }

    // 🌍 恢复动态世界数据
    if (saveData.dynamicWorld) {
        gameState.dynamicWorld = saveData.dynamicWorld;
        // 🆕 强制重置处理状态（避免卡在处理中）
        gameState.dynamicWorld.isProcessing = false;
        // 🆕 兼容旧存档，添加新字段
        if (!gameState.dynamicWorld.messageInterval) {
            gameState.dynamicWorld.messageInterval = 1;
        }
        if (!gameState.dynamicWorld.messageCounter) {
            gameState.dynamicWorld.messageCounter = 0;
        }
        console.log(`[动态世界] 已从存档恢复 ${saveData.dynamicWorld.history?.length || 0} 条记录`);
        // 更新动态世界显示
        if (typeof displayDynamicWorldHistory === 'function') {
            displayDynamicWorldHistory();
        }
    } else {
        // 旧版存档，初始化动态世界
        gameState.dynamicWorld = {
            enabled: false,
            history: [],
            floor: 0,
            isProcessing: false,
            messageInterval: 1,
            messageCounter: 0
        };
        console.warn('[动态世界] 旧版存档，动态世界数据已初始化');
    }

    // 📱 恢复手机聊天数据（如果存档没有手机数据，则清除现有数据）
    restoreMobileChatData(saveData.mobileChatData);
    
    // 📰 恢复手机论坛数据
    restoreMobileForumData(saveData.mobileForumData);

    // 重新渲染游戏历史
    const historyDiv = document.getElementById('gameHistory');
    historyDiv.innerHTML = '';

    console.log('[加载存档] 开始渲染对话历史，总条数:', gameState.conversationHistory.length);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < gameState.conversationHistory.length; i++) {
        const entry = gameState.conversationHistory[i];

        try {
            if (entry.role === 'user') {
                if (typeof displayUserMessage === 'function') {
                    // 🔧 强制渲染，跳过调试模式检查
                    displayUserMessage(entry.content, true);
                }
                successCount++;
                console.log(`[加载存档] ✅ 已渲染用户消息 ${i+1}/${gameState.conversationHistory.length}`);
            } else if (entry.role === 'assistant') {
                // 解析AI响应
                try {
                    let jsonMatch = entry.content.match(/```json\s*([\s\S]*?)\s*```/);
                    if (!jsonMatch) {
                        jsonMatch = entry.content.match(/```\s*([\s\S]*?)\s*```/);
                    }

                    let jsonStr = jsonMatch ? jsonMatch[1] : entry.content;
                    const data = JSON.parse(jsonStr);

                    if (typeof displayAIMessage === 'function') {
                        displayAIMessage(data.story, data.options, data.reasoning);
                    }
                } catch (error) {
                    console.warn('解析历史消息失败（可能是旧格式存档），直接显示纯文本:', error.message);
                    // 如果解析失败，说明是纯文本格式（旧版存档），直接显示
                    if (typeof displayAIMessage === 'function') {
                        displayAIMessage(entry.content, [], null);
                    }
                }
                successCount++;
                console.log(`[加载存档] ✅ 已渲染AI消息 ${i+1}/${gameState.conversationHistory.length}`);
            }
        } catch (error) {
            errorCount++;
            console.error(`[加载存档] ❌ 渲染消息 ${i+1} 失败:`, error);
        }
    }

    console.log(`[加载存档] 渲染完成: 成功 ${successCount} 条, 失败 ${errorCount} 条, 总计 ${gameState.conversationHistory.length} 条`);
    console.log(`[加载存档] gameHistory子元素数量: ${historyDiv.children.length}`);

    // 🆕 延迟检查：确保渲染完成后DOM已更新
    setTimeout(() => {
        const finalCount = document.getElementById('gameHistory').children.length;
        console.log(`[加载存档] 🔍 延迟检查 - gameHistory最终子元素数量: ${finalCount}`);
        if (finalCount !== gameState.conversationHistory.length) {
            console.error(`[加载存档] ❌ 警告：DOM元素数量(${finalCount}) 与对话历史数量(${gameState.conversationHistory.length}) 不匹配！`);
            // 自动运行诊断
            if (typeof diagnoseMessageDisplay === 'function') {
                diagnoseMessageDisplay();
            }
        } else {
            console.log(`[加载存档] ✅ DOM元素数量与对话历史数量匹配`);
        }
    }, 500);

    // 更新状态面板
    if (typeof updateStatusPanel === 'function') {
        updateStatusPanel();
    }
    
    // 🌍 更新动态世界Tab页显示
    if (typeof displayDynamicWorldHistory === 'function') {
        displayDynamicWorldHistory();
    }

    // 滚动到底部
    historyDiv.scrollTop = historyDiv.scrollHeight;
    
    // 【新增】同步向量库 - 如果启用了向量检索但向量库为空，自动重建
    const enableVectorRetrieval = document.getElementById('enableVectorRetrieval')?.checked || false;
    if (enableVectorRetrieval && window.contextVectorManager) {
        syncVectorLibraryFromHistory();
    }
}

/**
 * 从对话历史同步向量库
 */
async function syncVectorLibraryFromHistory(isManual = false) {
    if (!window.contextVectorManager) {
        if (isManual) alert('向量管理器未初始化！');
        return;
    }
    
    const enableVectorRetrieval = document.getElementById('enableVectorRetrieval')?.checked || false;
    if (!enableVectorRetrieval && isManual) {
        alert('向量检索未启用！\n\n请先在游戏设置中启用"🧬 启用向量检索（智能记忆）"');
        return;
    }
    
    const vectorLibSize = window.contextVectorManager.conversationEmbeddings.length;
    const historySize = Math.floor(gameState.conversationHistory.length / 2);
    
    if (historySize === 0) {
        if (isManual) alert('对话历史为空！请先进行游戏。');
        return;
    }
    
    // 如果向量库为空或明显小于对话历史，进行同步
    if (vectorLibSize < historySize || isManual) {
        if (isManual && vectorLibSize >= historySize) {
            if (!confirm(`当前向量库已有${vectorLibSize}轮对话，对话历史有${historySize}轮。\n\n确定要重新同步吗？这将清空现有向量库并重建。`)) {
                return;
            }
        }
        
        console.log(`[向量库同步] 检测到向量库(${vectorLibSize}轮) < 对话历史(${historySize}轮)，开始同步...`);
        
        // 显示进度提示
        const progressMsg = document.createElement('div');
        progressMsg.id = 'syncProgress';
        progressMsg.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 10001;
            text-align: center;
        `;
        progressMsg.innerHTML = `
            <div style="color: #667eea; font-size: 20px; font-weight: bold; margin-bottom: 15px;">
                🔄 正在同步向量库...
            </div>
            <div style="color: #666; font-size: 14px;">
                请稍候，正在处理 <span id="syncCurrentTurn">0</span>/${historySize} 轮对话
            </div>
        `;
        document.body.appendChild(progressMsg);
        
        // 清空现有向量库
        window.contextVectorManager.clear();
        
        // 遍历对话历史，重建向量库
        for (let i = 0; i < gameState.conversationHistory.length - 1; i += 2) {
            const userMsg = gameState.conversationHistory[i];
            const aiMsg = gameState.conversationHistory[i + 1];
            
            if (userMsg && aiMsg && userMsg.role === 'user' && aiMsg.role === 'assistant') {
                const turnIndex = Math.floor(i / 2) + 1;
                const variables = gameState.variableSnapshots[i + 1] || gameState.variables;
                
                // 更新进度
                const progressSpan = document.getElementById('syncCurrentTurn');
                if (progressSpan) progressSpan.textContent = turnIndex;
                
                await window.contextVectorManager.addConversation(
                    userMsg.content,
                    aiMsg.content,
                    turnIndex,
                    variables
                );
            }
        }
        
        // 保存到IndexedDB
        await window.contextVectorManager.saveToIndexedDB();
        
        // 移除进度提示
        progressMsg.remove();
        
        console.log(`[向量库同步] ✅ 完成！已同步${window.contextVectorManager.conversationEmbeddings.length}轮对话`);
        
        // 提示用户
        const syncMsg = document.createElement('div');
        syncMsg.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 9999;
            font-size: 14px;
        `;
        syncMsg.innerHTML = `✅ 向量库已同步 ${window.contextVectorManager.conversationEmbeddings.length} 轮对话`;
        document.body.appendChild(syncMsg);
        
        setTimeout(() => syncMsg.remove(), 3000);
        
        if (isManual) {
            alert(`✅ 同步完成！\n\n已将${historySize}轮对话同步到向量库\n\n你可以点击"🧬 查看向量库"查看详情`);
        }
    } else if (isManual) {
        alert(`ℹ️ 向量库已是最新状态\n\n向量库：${vectorLibSize}轮\n对话历史：${historySize}轮\n\n无需同步。`);
    }
}

// ==================== 属性系统工具函数 ====================

/**
 * 显示属性变化
 */
function showAttributeChanges() {
    if (!gameState.previousVariables) return;

    const prev = gameState.previousVariables;
    const curr = gameState.variables;

    // 货币变化
    showChange('spiritStonesChange', prev.spiritStones, curr.spiritStones);

    // 体力法力变化
    showChange('hpChange', prev.hp, curr.hp);
    showChange('mpChange', prev.mp, curr.mp);

    // 特殊属性变化
    showChange('karmaFortuneChange', prev.karmaFortune, curr.karmaFortune);
    showChange('karmaPunishmentChange', prev.karmaPunishment, curr.karmaPunishment);

    // 六维属性变化（已改用雷达图显示，不再显示文本变化提示）
    // const prevActual = calculateActualAttributesFor(prev);
    // const currActual = calculateActualAttributes();
    // showChange('attrPhysiqueChange', prevActual.physique, currActual.physique);
    // showChange('attrFortuneChange', prevActual.fortune, currActual.fortune);
    // showChange('attrComprehensionChange', prevActual.comprehension, currActual.comprehension);
    // showChange('attrSpiritChange', prevActual.spirit, currActual.spirit);
    // showChange('attrPotentialChange', prevActual.potential, currActual.potential);
    // showChange('attrCharismaChange', prevActual.charisma, currActual.charisma);
}

/**
 * 计算指定状态的实际属性
 */
function calculateActualAttributesFor(variables) {
    const base = variables.attributes;
    const equipment = variables.equipment;
    const actual = { ...base };

    if (equipment) {
        Object.values(equipment).forEach(item => {
            if (item && item.effects) {
                Object.entries(item.effects).forEach(([attr, value]) => {
                    if (actual[attr] !== undefined) {
                        actual[attr] += value;
                    }
                });
            }
        });
    }

    return actual;
}

/**
 * 显示单个属性变化
 */
function showChange(elementId, oldValue, newValue) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    if (oldValue !== newValue) {
        const change = newValue - oldValue;
        const changeText = change > 0 ? `+${change}` : `${change}`;
        const changeColor = change > 0 ? '#28a745' : '#dc3545';
        
        element.innerHTML = `<span style="color: ${changeColor}; font-weight: bold;">${changeText}</span>`;
        element.style.display = 'inline';
        
        // 3秒后隐藏
        setTimeout(() => {
            element.style.display = 'none';
        }, 3000);
    }
}

/**
 * 解析属性要求
 */
function parseAttributeRequirement(optionText) {
    // 确保optionText是字符串
    if (typeof optionText !== 'string') {
        optionText = String(optionText);
    }
    
    // 匹配中文属性名 或 英文属性名
    const chinesePattern = /（(根骨|气运|悟性|神识|潜力|魅力)([><=≥≤])(\d+)）/;
    const englishPattern = /\((physique|fortune|comprehension|spirit|potential|charisma)([><=])(\d+)\)/i;

    let match = optionText.match(chinesePattern);
    let isChinese = true;

    if (!match) {
        match = optionText.match(englishPattern);
        isChinese = false;
    }

    if (match) {
        let attrName = match[1].toLowerCase();
        const operator = match[2];
        const value = parseInt(match[3]);

        // 转换中文属性名为英文
        if (isChinese) {
            const attrMap = {
                '根骨': 'physique',
                '气运': 'fortune',
                '悟性': 'comprehension',
                '神识': 'spirit',
                '潜力': 'potential',
                '魅力': 'charisma'
            };
            attrName = attrMap[match[1]];
        }

        // 移除要求部分，得到纯净的选项文本
        const cleanText = optionText.replace(match[0], '').trim();

        return {
            hasRequirement: true,
            attribute: attrName,
            operator: operator === '≥' ? '>=' : operator === '≤' ? '<=' : operator,
            value: value,
            cleanText: cleanText,
            requirementText: match[0]
        };
    }

    return {
        hasRequirement: false,
        cleanText: optionText
    };
}

/**
 * 检查属性要求是否满足
 */
function checkAttributeRequirement(requirement) {
    if (!requirement.hasRequirement) {
        return { met: true };
    }

    // 获取实际属性值（包含装备加成）
    const actualAttributes = calculateActualAttributes();
    const currentValue = actualAttributes[requirement.attribute] || 0;

    let met = false;
    switch (requirement.operator) {
        case '>':
            met = currentValue > requirement.value;
            break;
        case '>=':
        case '≥':
            met = currentValue >= requirement.value;
            break;
        case '<':
            met = currentValue < requirement.value;
            break;
        case '<=':
        case '≤':
            met = currentValue <= requirement.value;
            break;
        case '==':
        case '=':
            met = currentValue === requirement.value;
            break;
        default:
            met = false;
    }

    // 获取属性中文名显示
    const attributeNames = {
        'physique': '根骨',
        'fortune': '气运',
        'comprehension': '悟性',
        'spirit': '神识',
        'potential': '潜力',
        'charisma': '魅力'
    };

    return {
        met: met,
        current: currentValue,
        currentValue: currentValue, // 添加这个字段供user-input-handler.js使用
        required: requirement.value,
        operator: requirement.operator,
        attributeName: attributeNames[requirement.attribute] || requirement.attribute // 添加属性中文名
    };
}

/**
 * 计算当前实际属性（包含装备加成）
 */
function calculateActualAttributes() {
    return calculateActualAttributesFor(gameState.variables);
}

// 注意：以下函数在 game.html 中定义，因为它们依赖大量游戏逻辑：
// - showMainMenu
// - fetchModels / fetchExtraModels
// - loadConfig
// - DLC管理系统函数
// - 动态世界生成函数
// 这些函数保留在 game.html 中以避免循环依赖
