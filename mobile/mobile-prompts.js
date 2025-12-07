/**
 * 📱 手机各模块提示词配置
 * 用于规范AI在不同手机应用中的回复格式
 */

window.MobilePrompts = {
    
    /**
     *  获取主游戏的最近历史上下文
     * 用于让论坛/通讯了解当前游戏剧情
     */
    getGameContext: function() {
        try {
            // 从父页面获取游戏状态
            const parentWindow = window.parent;
            if (!parentWindow || !parentWindow.gameState) {
                console.warn('[手机提示词] 无法获取父页面gameState');
                return null;
            }
            
            const gameState = parentWindow.gameState;
            // 使用正确的字段名 conversationHistory
            const gameHistory = gameState.conversationHistory || [];
            const variables = gameState.variables || {};
            
            // 获取配置的历史层数（默认5层）
            let historyDepth = 5;
            try {
                const config = JSON.parse(localStorage.getItem('gameConfig') || '{}');
                historyDepth = parseInt(config.historyDepth) || 5;
            } catch (e) {}
            
            // 获取最近N层历史（每层 = 1用户 + 1AI）
            const recentMessages = gameHistory.slice(-historyDepth * 2);
            
            if (recentMessages.length === 0) {
                return null;
            }
            
            // 构建上下文文本
            let contextText = '\n【当前游戏剧情上下文】\n';
            contextText += '（以下是游戏中最近发生的事件，请根据这些剧情生成合适的内容）\n';
            
            recentMessages.forEach((msg, index) => {
                const role = msg.role === 'user' ? '【玩家行动】' : '【剧情发展】';
                // 截取内容，避免太长
                const content = msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content;
                contextText += `${role}: ${content}\n\n`;
            });
            
            // 添加关键变量信息
            if (variables) {
                contextText += '【当前状态】\n';
                // 通用变量名（适用于现代和仙侠游戏）
                const keyVars = ['name', 'location', 'health', 'reputation', 'money', 'job', 'faction'];
                const varLabels = {
                    name: '姓名',
                    location: '位置',
                    health: '状态',
                    reputation: '声望',
                    money: '资产',
                    job: '职业',
                    faction: '所属'
                };
                keyVars.forEach(key => {
                    if (variables[key] !== undefined) {
                        const label = varLabels[key] || key;
                        contextText += `- ${label}: ${variables[key]}\n`;
                    }
                });
            }
            
            console.log(`[手机提示词] 已获取${recentMessages.length}条游戏历史作为上下文`);
            return contextText;
            
        } catch (e) {
            console.error('[手机提示词] 获取游戏上下文失败:', e);
            return null;
        }
    },
    
    /**
     * � 通讯APP提示词
     * 用于规范聊天消息的发送和回复格式
     */
    communication: {
        // 系统提示词（位于最顶部，高于上下文）
        systemPrompt: `你是一个现代都市游戏中的虚拟手机通讯系统。用户通过手机APP与游戏中的NPC进行聊天。

【重要】这是现代都市背景的游戏，NPC应该像现实生活中的人一样聊天。

【消息格式规范】
用户发送的消息采用JSON格式：
{
  "messages": [
    {
      "direction": "outgoing",
      "chatType": "private|group",
      "target": { "name": "对方名字", "id": "对方ID" },
      "group": { "name": "群名", "id": "群ID" },  // 群聊时有此字段
      "sender": { "name": "我", "id": "self" },
      "msgType": "text",
      "content": "消息内容"
    }
  ]
}

【回复格式要求】
你必须严格按照以下JSON格式回复，不要有任何其他文字：
{
  "replies": [
    {
      "direction": "incoming",
      "chatType": "private|group",
      "target": { "name": "我", "id": "self" },
      "group": { "name": "群名", "id": "群ID" },  // 群聊时保留
      "sender": { "name": "回复者名字", "id": "回复者ID" },
      "msgType": "text",
      "content": "回复内容"
    }
  ]
}

【重要规则】
1. 私聊时：sender使用用户消息中target的信息（对方回复）
2. 群聊时：sender可以是群里任意成员回复
3. 可以返回多条回复消息（多人回复或连续消息）
4. 回复内容要符合角色性格和游戏背景
5. 只返回JSON，不要有任何解释或额外文字
6. content中如果需要换行使用\\n`,

        // 🎮 获取游戏上下文
        getGameContext: function() {
            return window.MobilePrompts.getGameContext();
        },

        // 构建用户消息JSON
        buildUserMessage: function(messages) {
            return JSON.stringify({
                messages: messages
            }, null, 2);
        },

        // 解析AI回复
        parseAIReply: function(replyText) {
            try {
                // 尝试提取JSON部分
                let jsonStr = replyText.trim();
                
                // 如果包含markdown代码块，提取其中的JSON
                const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (jsonMatch) {
                    jsonStr = jsonMatch[1].trim();
                }
                
                const parsed = JSON.parse(jsonStr);
                return parsed.replies || [];
            } catch (e) {
                console.error('[通讯提示词] 解析AI回复失败:', e);
                console.log('[通讯提示词] 原始回复:', replyText);
                
                // 解析失败时返回一个默认回复
                return [{
                    direction: "incoming",
                    chatType: "private",
                    target: { name: "我", id: "self" },
                    sender: { name: "系统", id: "system" },
                    msgType: "text",
                    content: replyText || "消息解析失败"
                }];
            }
        },

        // 创建发送消息对象
        createOutgoingMessage: function(content, targetName, targetId, chatType = 'private', groupInfo = null) {
            const msg = {
                direction: "outgoing",
                chatType: chatType,
                target: {
                    name: targetName,
                    id: targetId
                },
                sender: {
                    name: "我",
                    id: "self"
                },
                msgType: "text",
                content: content
            };
            
            // 群聊时添加群信息
            if (chatType === 'group' && groupInfo) {
                msg.group = {
                    name: groupInfo.name,
                    id: groupInfo.id
                };
            }
            
            return msg;
        }
    },

    /**
     * 📰 论坛APP提示词
     * 用于规范论坛帖子和评论的格式
     */
    forum: {
        // 系统提示词
        systemPrompt: `你是一个现代都市现实生活论坛系统。用户通过手机APP浏览和参与现代生活论坛讨论。
- 这是纯粹的现代都市世界，只有现实生活元素
- 话题应该是：工作、生活、美食、娱乐、社交、新闻等现代话题

【帖子分类标签】
- HOT: 热门话题
- GOSSIP: 八卦消息
- GUIDE: 攻略指南
- TRADE: 交易信息
- ASK: 求助提问
- NEWS: 新闻资讯
- SHOW: 晒图炫耀

【请求格式】
用户请求采用JSON格式：
{
  "action": "browse|view|post|comment|refresh",
  "postId": "帖子ID（view/comment时必需）",
  "tag": "筛选标签（browse时可选）",
  "content": {
    "title": "帖子标题（post时必需）",
    "body": "帖子正文或评论内容",
    "tag": "帖子标签（post时必需）"
  }
}

【回复格式 - 浏览帖子列表】
当action为browse或refresh时，返回帖子列表（每个帖子包含评论）：
{
  "type": "postList",
  "posts": [
    {
      "id": "帖子唯一ID（如P8X92）",
      "tag": "HOT|GOSSIP|GUIDE|TRADE|ASK|NEWS|SHOW",
      "title": "帖子标题",
      "author": { "name": "作者名", "id": "作者ID", "realm": "贴吧等级" },
      "content": "帖子完整正文内容",
      "stats": { "replies": 999, "views": 10200 },
      "time": "发布时间描述（如1h ago）",
      "isHot": true/false,
      "preview": "内容预览（前50字）",
      "comments": [
        {
          "id": "评论ID",
          "author": { "name": "评论者", "id": "ID", "realm": "等级" },
          "content": "评论内容",
          "time": "评论时间",
          "likes": 12,
          "floor": 1
        }
      ]
    }
  ]
}

【回复格式 - 查看帖子详情】
当action为view时，返回帖子详情和评论：
{
  "type": "postDetail",
  "post": {
    "id": "帖子ID",
    "tag": "标签",
    "title": "帖子标题",
    "author": { "name": "作者名", "id": "作者ID", "realm": "贴吧等级", "avatar": "头像符号" },
    "content": "帖子完整正文内容",
    "stats": { "replies": 123, "views": 5600, "likes": 88 },
    "time": "发布时间",
    "images": ["图片描述1", "图片描述2"]
  },
  "comments": [
    {
      "id": "评论ID",
      "author": { "name": "评论者", "id": "ID", "realm": "贴吧等级" },
      "content": "评论内容",
      "time": "评论时间",
      "likes": 12,
      "floor": 1,
      "replyTo": "回复的楼层号（可选）"
    }
  ]
}

【回复格式 - 发帖/评论结果】
当action为post或comment时，返回操作结果：
{
  "type": "actionResult",
  "success": true/false,
  "message": "操作结果消息",
  "newPost": { ... },  // 发帖成功时返回新帖子信息
  "newComment": { ... }  // 评论成功时返回新评论信息
}

【重要规则】
1. 帖子内容要符合现实生活，充满现实生活元素
2. 评论要有趣、多样化，体现不同现实生活性格
3. 热门帖子(isHot)应该话题性强，评论多
4. 帖子ID格式：P+4位字母数字（如P8X92）
5. 评论ID格式：C+6位数字（如C001234）
6. 只返回JSON，不要有任何解释或额外文字
7. content中如果需要换行使用\\n
8. 浏览帖子列表时，每个帖子要同时生成5-15条评论，并在comments字段返回
9. 【必须】生成每个新帖子时，必须同时生成3-4条对应的回复评论，不能少于3条！这是强制要求，帖子没有回复会显得不真实`,

        // 🎮 获取游戏上下文
        getGameContext: function() {
            return window.MobilePrompts.getGameContext();
        },

        // 构建浏览请求
        buildBrowseRequest: function(tag = null) {
            return JSON.stringify({
                action: 'browse',
                tag: tag
            }, null, 2);
        },

        // 构建查看帖子请求
        buildViewRequest: function(postId) {
            return JSON.stringify({
                action: 'view',
                postId: postId
            }, null, 2);
        },

        // 构建发帖请求
        buildPostRequest: function(title, body, tag) {
            return JSON.stringify({
                action: 'post',
                content: {
                    title: title,
                    body: body,
                    tag: tag
                }
            }, null, 2);
        },

        // 构建评论请求
        buildCommentRequest: function(postId, content, replyTo = null) {
            const request = {
                action: 'comment',
                postId: postId,
                content: {
                    body: content
                }
            };
            if (replyTo) {
                request.content.replyTo = replyTo;
            }
            return JSON.stringify(request, null, 2);
        },

        // 构建刷新请求
        buildRefreshRequest: function(tag = null) {
            return JSON.stringify({
                action: 'refresh',
                tag: tag
            }, null, 2);
        },

        // 解析AI回复
        parseAIReply: function(replyText) {
            try {
                let jsonStr = replyText.trim();
                
                // 提取JSON部分
                const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (jsonMatch) {
                    jsonStr = jsonMatch[1].trim();
                }
                
                return JSON.parse(jsonStr);
            } catch (e) {
                console.error('[论坛提示词] 解析AI回复失败:', e);
                console.log('[论坛提示词] 原始回复:', replyText);
                
                return {
                    type: 'error',
                    message: '数据解析失败: ' + (e.message || '未知错误')
                };
            }
        },

        // 生成本地帖子ID
        generatePostId: function() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let id = 'P';
            for (let i = 0; i < 4; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return id;
        },

        // 生成本地评论ID
        generateCommentId: function() {
            return 'C' + String(Date.now()).slice(-6);
        }
    },

    /**
     * 💰 资产APP提示词（预留）
     */
    assets: {
        systemPrompt: `// 资产模块提示词待实现`
    }
};

console.log('[📱手机提示词] 模块已加载');
