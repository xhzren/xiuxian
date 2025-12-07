/**
 * 增强版JSON修复和解析工具
 * 解决AI响应格式错误问题
 */

/**
 * 增强版JSON自动修复
 * @param {string} jsonStr - 待修复的JSON字符串
 * @returns {string} 修复后的JSON字符串
 */
function enhancedAutoFixJSON(jsonStr) {
    console.log('🔧 [增强修复] 开始修复JSON，输入长度:', jsonStr.length);
    let fixed = jsonStr.trim();
    
    // ========== 第1步：清理前缀和后缀 ==========
    // 移除代码块标记
    fixed = fixed.replace(/^```(?:json)?\s*/i, '');
    fixed = fixed.replace(/\s*```$/, '');
    
    // 移除 "json 或 json 前缀
    fixed = fixed.replace(/^["']?json["']?\s*/i, '');
    
    // 移除开头多余的引号
    if (fixed.startsWith('"') && !fixed.startsWith('"{')) {
        fixed = fixed.substring(1);
    }
    
    // 移除末尾多余的引号
    if (fixed.endsWith('"') && !fixed.endsWith('}"')) {
        fixed = fixed.substring(0, fixed.length - 1);
    }
    
    // ========== 第2步：处理注释 ==========
    // 移除单行注释 //
    fixed = fixed.replace(/\/\/[^\n]*/g, '');
    
    // 移除多行注释 /* */
    fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // ========== 第3步：修复换行符 ==========
    // 在字符串值中转义换行符
    fixed = fixed.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) => {
        return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    });
    
    // ========== 第4步：修复尾随逗号 ==========
    // 移除对象和数组末尾的多余逗号
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // ========== 第5步：补全缺失的括号 ==========
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    
    if (openBraces > closeBraces) {
        console.warn(`🔧 补全${openBraces - closeBraces}个闭合大括号`);
        fixed += '}'.repeat(openBraces - closeBraces);
    }
    
    if (openBrackets > closeBrackets) {
        console.warn(`🔧 补全${openBrackets - closeBrackets}个闭合中括号`);
        fixed += ']'.repeat(openBrackets - closeBrackets);
    }
    
    // ========== 第6步：修复引号 ==========
    // 统一使用双引号
    // 注意：只替换作为JSON语法的单引号，不影响字符串内部的单引号
    let inString = false;
    let result = '';
    let i = 0;
    
    while (i < fixed.length) {
        const char = fixed[i];
        const nextChar = fixed[i + 1];
        
        // 处理转义字符
        if (char === '\\' && inString) {
            result += char + (nextChar || '');
            i += 2;
            continue;
        }
        
        // 切换字符串状态
        if (char === '"') {
            inString = !inString;
            result += char;
            i++;
            continue;
        }
        
        // 在字符串外部，将单引号替换为双引号
        if (char === "'" && !inString) {
            result += '"';
            i++;
            continue;
        }
        
        result += char;
        i++;
    }
    
    fixed = result;
    
    // ========== 第7步：修复属性名 ==========
    // 为没有引号的属性名添加引号
    // 匹配模式：换行+空白+单词+空白+冒号
    fixed = fixed.replace(/(\n\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*):/g, (match, indent, propName, space) => {
        // 检查是否已经有引号
        if (fixed[fixed.indexOf(match) - 1] === '"') {
            return match;
        }
        return indent + '"' + propName + '"' + space + ':';
    });
    
    // 也处理第一个属性（在{之后）
    fixed = fixed.replace(/(\{\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*):/g, (match, brace, propName, space) => {
        return brace + '"' + propName + '"' + space + ':';
    });
    
    // ========== 第8步：修复特殊字符 ==========
    // 移除控制字符（除了换行、回车、制表符）
    fixed = fixed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    console.log('✅ [增强修复] 修复完成');
    return fixed;
}

/**
 * 智能解析AI响应（多策略尝试）
 * @param {string} response - AI原始响应
 * @returns {Object|null} 解析后的数据对象，失败返回null
 */
function smartParseAIResponse(response) {
    const strategies = [
        {
            name: '直接解析',
            fn: (r) => JSON.parse(r)
        },
        {
            name: '提取代码块',
            fn: (r) => {
                const match = r.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (!match) throw new Error('未找到代码块');
                return JSON.parse(match[1]);
            }
        },
        {
            name: '增强修复-全文',
            fn: (r) => {
                const fixed = enhancedAutoFixJSON(r);
                return JSON.parse(fixed);
            }
        },
        {
            name: '增强修复-代码块',
            fn: (r) => {
                const match = r.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (!match) throw new Error('未找到代码块');
                const fixed = enhancedAutoFixJSON(match[1]);
                return JSON.parse(fixed);
            }
        },
        {
            name: '提取花括号内容',
            fn: (r) => {
                const match = r.match(/\{[\s\S]*\}/);
                if (!match) throw new Error('未找到JSON对象');
                const fixed = enhancedAutoFixJSON(match[0]);
                return JSON.parse(fixed);
            }
        },
        {
            name: '宽松JSON解析',
            fn: (r) => {
                // 使用eval（有风险，作为最后手段）
                const fixed = enhancedAutoFixJSON(r);
                // 先尝试JSON.parse
                try {
                    return JSON.parse(fixed);
                } catch (e) {
                    // 如果失败，尝试更激进的修复
                    console.warn('⚠️ 使用激进修复模式');
                    return tryAggressiveRepair(fixed);
                }
            }
        }
    ];
    
    for (const strategy of strategies) {
        try {
            console.log(`🔍 尝试策略: ${strategy.name}`);
            const result = strategy.fn(response);
            console.log(`✅ 策略成功: ${strategy.name}`);
            return result;
        } catch (error) {
            console.log(`❌ 策略失败: ${strategy.name} - ${error.message}`);
        }
    }
    
    console.error('❌ 所有解析策略都失败了');
    return null;
}

/**
 * 激进修复模式（最后手段）
 * @param {string} jsonStr - JSON字符串
 * @returns {Object} 解析结果
 */
function tryAggressiveRepair(jsonStr) {
    let fixed = jsonStr;
    
    // 尝试找到最后一个完整的对象或数组
    let lastValidJson = null;
    let maxLength = 0;
    
    // 从后往前尝试找到有效的JSON
    for (let i = fixed.length; i > fixed.length / 2; i--) {
        const substr = fixed.substring(0, i);
        
        // 补全可能缺失的结束符
        let attempt = substr;
        const missingBraces = (attempt.match(/\{/g) || []).length - (attempt.match(/\}/g) || []).length;
        const missingBrackets = (attempt.match(/\[/g) || []).length - (attempt.match(/\]/g) || []).length;
        
        if (missingBraces > 0) attempt += '}'.repeat(missingBraces);
        if (missingBrackets > 0) attempt += ']'.repeat(missingBrackets);
        
        // 移除尾随逗号
        attempt = attempt.replace(/,(\s*[}\]])/g, '$1');
        
        try {
            const parsed = JSON.parse(attempt);
            if (i > maxLength) {
                maxLength = i;
                lastValidJson = parsed;
            }
        } catch (e) {
            // 继续尝试
        }
    }
    
    if (lastValidJson) {
        console.log('✅ 激进修复找到有效JSON，长度:', maxLength);
        return lastValidJson;
    }
    
    throw new Error('激进修复也失败');
}

/**
 * 验证并补全必需字段
 * @param {Object} data - 解析后的数据
 * @returns {Object} 验证并补全后的数据
 */
function validateAndCompleteData(data) {
    console.log('🔍 验证数据完整性...');
    
    // 必需字段定义
    const requiredFields = {
        reasoning: {
            default: {
                situation: '数据解析中',
                playerChoice: '继续游戏',
                logicChain: ['解析成功'],
                outcome: '继续游戏流程'
            },
            type: 'object'
        },
        variableChanges: {
            default: {
                analysis: 'No changes',
                changes: {}
            },
            type: 'object'
        },
        story: {
            default: '（AI正在生成剧情...）',
            type: 'string'
        },
        options: {
            default: [
                '与周围人交谈',
                '离开此地',
                '继续探索',
                '【R18】休息片刻'
            ],
            type: 'array',
            minLength: 4
        }
    };
    
    // 检查并补全缺失字段
    for (const [field, config] of Object.entries(requiredFields)) {
        if (!data[field]) {
            console.warn(`⚠️ 缺少字段 ${field}，使用默认值`);
            data[field] = config.default;
        } else if (config.type === 'array' && config.minLength) {
            // 补全不足的数组元素
            while (data[field].length < config.minLength) {
                const index = data[field].length;
                data[field].push(config.default[index] || `选项${index + 1}`);
            }
        }
    }
    
    // 验证options数量
    if (data.options && data.options.length < 4) {
        console.warn(`⚠️ 选项数量不足（${data.options.length}/4），自动补全`);
        const defaultOptions = [
            '与周围人交谈',
            '离开此地',
            '继续探索',
            '【R18】休息片刻'
        ];
        while (data.options.length < 4) {
            data.options.push(defaultOptions[data.options.length] || `选项${data.options.length + 1}`);
        }
    }
    
    // 验证story长度
    if (data.story && data.story.length < 20) {
        console.warn('⚠️ 剧情描述过短');
        data.story += '\n\n（故事继续...）';
    }
    
    console.log('✅ 数据验证完成');
    return data;
}

/**
 * 降级渲染模式（当JSON完全无法解析时）
 * @param {string} response - AI原始响应
 * @returns {Object} 降级后的数据对象
 */
function fallbackParse(response) {
    console.log('⚠️ 启动降级渲染模式');
    
    // 尝试提取文本内容
    let story = response;
    
    // 移除代码块标记
    story = story.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');
    
    // 如果文本太短，添加提示
    if (story.length < 50) {
        story = `AI响应格式异常，原始内容：\n\n${story}\n\n建议选择"重新生成"。`;
    }
    
    return {
        reasoning: {
            situation: 'AI响应解析失败',
            playerChoice: '等待玩家选择',
            logicChain: ['响应格式错误', '启用降级模式', '显示原始内容'],
            outcome: '等待玩家重新生成或继续'
        },
        variableChanges: {
            analysis: 'No changes due to parsing error',
            changes: {}
        },
        story: story,
        options: [
            '重新生成回复',
            '尝试继续',
            '查看原始响应',
            '返回上一步',
            '保存并退出'
        ]
    };
}

/**
 * 完整的AI响应处理流程
 * @param {string} response - AI原始响应
 * @returns {Object} 处理后的数据对象（保证不为null）
 */
function processAIResponse(response) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🤖 [AI响应处理] 开始处理');
    console.log('📝 响应长度:', response.length);
    
    try {
        // 第1步：智能解析
        let data = smartParseAIResponse(response);
        
        // 第2步：如果解析失败，使用降级模式
        if (!data) {
            console.warn('⚠️ 智能解析失败，使用降级模式');
            data = fallbackParse(response);
        }
        
        // 第3步：验证并补全数据
        data = validateAndCompleteData(data);
        
        console.log('✅ [AI响应处理] 处理成功');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        return data;
    } catch (error) {
        console.error('❌ [AI响应处理] 处理失败:', error);
        console.error('使用最终降级方案');
        
        return fallbackParse(response);
    }
}
