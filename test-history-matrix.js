/**
 * History矩阵化系统测试脚本
 * 在浏览器控制台中运行这些函数来测试系统
 */

// ==================== 基础检查 ====================

/**
 * 检查系统是否正确加载
 */
function checkSystemLoaded() {
    console.log('=== 系统加载检查 ===');
    
    const checks = {
        'contextVectorManager': !!window.contextVectorManager,
        'matrixManager': !!window.matrixManager,
        'historyEmbeddings': !!window.contextVectorManager?.historyEmbeddings,
        'historyMatrix': !!window.matrixManager?.historyMatrix,
        'conversationMatrix': !!window.matrixManager?.matrix
    };
    
    Object.entries(checks).forEach(([name, loaded]) => {
        console.log(`${loaded ? '✅' : '❌'} ${name}: ${loaded ? '已加载' : '未加载'}`);
    });
    
    return checks;
}

// ==================== 向量库检查 ====================

/**
 * 查看向量库统计
 */
function showVectorStats() {
    console.log('=== 向量库统计 ===');
    
    const conversationCount = window.contextVectorManager?.conversationEmbeddings?.length || 0;
    const historyCount = window.contextVectorManager?.historyEmbeddings?.length || 0;
    
    console.log(`对话向量库: ${conversationCount} 条`);
    console.log(`History向量库: ${historyCount} 条`);
    
    if (historyCount > 0) {
        const latest = window.contextVectorManager.historyEmbeddings[historyCount - 1];
        console.log('\n最新的History:');
        console.log(`  轮次: ${latest.turnIndex}`);
        console.log(`  内容: ${latest.content.substring(0, 100)}...`);
        console.log(`  向量类型: ${latest.vectorType}`);
    }
    
    return { conversationCount, historyCount };
}

/**
 * 查看最近N条history
 */
function showRecentHistory(count = 5) {
    console.log(`=== 最近${count}条History ===`);
    
    const recent = window.contextVectorManager.getRecentHistory(count);
    
    if (recent.length === 0) {
        console.log('❌ History向量库为空');
        return;
    }
    
    recent.forEach((h, i) => {
        console.log(`${i + 1}. ${h}`);
    });
    
    return recent;
}

// ==================== 矩阵检查 ====================

/**
 * 查看矩阵统计
 */
function showMatrixStats() {
    console.log('=== 矩阵统计 ===');
    
    // 对话矩阵
    const conversationVis = window.matrixManager?.matrix?.getVisualizationData();
    if (conversationVis) {
        console.log('对话矩阵:');
        console.log(`  层数: ${conversationVis.stats.totalLayers}`);
        console.log(`  总向量数: ${conversationVis.stats.totalVectors}`);
        console.log(`  平均每层: ${conversationVis.stats.avgVectorsPerLayer}`);
    }
    
    // History矩阵
    const historyVis = window.matrixManager?.historyMatrix?.getVisualizationData();
    if (historyVis) {
        console.log('\nHistory矩阵:');
        console.log(`  层数: ${historyVis.stats.totalLayers}`);
        console.log(`  总向量数: ${historyVis.stats.totalVectors}`);
        console.log(`  平均每层: ${historyVis.stats.avgVectorsPerLayer}`);
    }
    
    return { conversationVis, historyVis };
}

/**
 * 可视化对话矩阵
 */
function visualizeConversationMatrix() {
    return window.matrixManager.visualize();
}

/**
 * 可视化History矩阵
 */
function visualizeHistoryMatrix() {
    return window.matrixManager.visualizeHistory();
}

// ==================== 检索测试 ====================

/**
 * 测试History上下文构建
 */
async function testHistoryContext(query = '测试查询') {
    console.log(`=== 测试History上下文构建 ===`);
    console.log(`查询: "${query}"`);
    
    const ctx = await window.contextVectorManager.buildHistoryContext(query);
    
    console.log(`\n📅 最近History: ${ctx.recent.length}条`);
    ctx.recent.slice(0, 3).forEach((h, i) => {
        console.log(`  ${i + 1}. ${h.substring(0, 60)}...`);
    });
    
    console.log(`\n🔍 矩阵检索History: ${ctx.matrix.length}条`);
    ctx.matrix.slice(0, 3).forEach((h, i) => {
        console.log(`  ${i + 1}. ${h.substring(0, 60)}...`);
    });
    
    return ctx;
}

/**
 * 测试矩阵检索
 */
async function testMatrixSearch(query = '测试查询', count = 5) {
    console.log(`=== 测试矩阵检索 ===`);
    console.log(`查询: "${query}"`);
    console.log(`数量: ${count}`);
    
    const results = window.matrixManager.historyMatrix.searchByMatrix(query, count);
    
    console.log(`\n找到 ${results.length} 条结果:`);
    results.forEach((r, i) => {
        console.log(`${i + 1}. [层${r.layerId}:${r.layerTopic}] 分数:${r.matchScore.toFixed(3)}`);
        console.log(`   ${r.content.substring(0, 80)}...`);
    });
    
    return results;
}

// ==================== 矩阵重建 ====================

/**
 * 重建所有矩阵
 */
async function rebuildAllMatrices() {
    console.log('=== 重建矩阵 ===');
    
    // 清空现有矩阵
    window.matrixManager.clear();
    console.log('✅ 已清空现有矩阵');
    
    // 重建对话矩阵
    if (window.contextVectorManager.conversationEmbeddings.length > 0) {
        await window.matrixManager.initializeFromHistory();
        console.log('✅ 对话矩阵重建完成');
    }
    
    // 重建History矩阵
    if (window.contextVectorManager.historyEmbeddings.length > 0) {
        await window.matrixManager.initializeHistoryMatrix();
        console.log('✅ History矩阵重建完成');
    }
    
    showMatrixStats();
}

// ==================== 配置查看/修改 ====================

/**
 * 查看当前配置
 */
function showConfig() {
    console.log('=== 当前配置 ===');
    
    const config = {
        '向量化方法': window.contextVectorManager?.embeddingMethod,
        '最近History数量': window.contextVectorManager?.recentHistoryCount,
        '矩阵检索History数量': window.contextVectorManager?.matrixHistoryCount,
        '对话检索数量': window.contextVectorManager?.maxRetrieveCount,
        '最小轮次间隔': window.contextVectorManager?.minTurnGap
    };
    
    Object.entries(config).forEach(([key, value]) => {
        console.log(`${key}: ${value}`);
    });
    
    return config;
}

/**
 * 修改配置
 */
function updateConfig(options = {}) {
    console.log('=== 更新配置 ===');
    
    if (options.recentHistoryCount !== undefined) {
        window.contextVectorManager.recentHistoryCount = options.recentHistoryCount;
        console.log(`✅ 最近History数量: ${options.recentHistoryCount}`);
    }
    
    if (options.matrixHistoryCount !== undefined) {
        window.contextVectorManager.matrixHistoryCount = options.matrixHistoryCount;
        console.log(`✅ 矩阵检索History数量: ${options.matrixHistoryCount}`);
    }
    
    if (options.embeddingMethod !== undefined) {
        window.contextVectorManager.embeddingMethod = options.embeddingMethod;
        console.log(`✅ 向量化方法: ${options.embeddingMethod}`);
    }
    
    showConfig();
}

// ==================== 存档测试 ====================

/**
 * 检查当前存档的向量库数据
 */
async function checkSaveData() {
    console.log('=== 检查存档数据 ===');
    
    try {
        const saves = await getAllSaves();
        
        if (saves.length === 0) {
            console.log('❌ 没有找到存档');
            return;
        }
        
        const latestSave = saves[saves.length - 1];
        
        console.log(`存档名称: ${latestSave.saveName}`);
        console.log(`保存时间: ${new Date(latestSave.timestamp).toLocaleString()}`);
        console.log(`\n向量库数据:`);
        console.log(`  对话向量: ${latestSave.vectorEmbeddings?.length || 0} 条`);
        console.log(`  History向量: ${latestSave.historyEmbeddings?.length || 0} 条`);
        console.log(`  矩阵数据: ${latestSave.matrixData ? '已保存' : '未保存'}`);
        
        if (latestSave.matrixData) {
            console.log(`\n矩阵统计:`);
            console.log(`  对话矩阵层数: ${latestSave.matrixData.conversationMatrix?.layers?.length || 0}`);
            console.log(`  History矩阵层数: ${latestSave.matrixData.historyMatrix?.layers?.length || 0}`);
        }
        
        return latestSave;
    } catch (error) {
        console.error('❌ 检查存档失败:', error);
    }
}

// ==================== 完整测试套件 ====================

/**
 * 运行完整测试套件
 */
async function runFullTest() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║     History矩阵化系统 - 完整测试               ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('');
    
    // 1. 系统加载检查
    const systemCheck = checkSystemLoaded();
    if (!systemCheck.contextVectorManager || !systemCheck.matrixManager) {
        console.error('❌ 系统未正确加载，请检查文件引入');
        return;
    }
    console.log('');
    
    // 2. 向量库统计
    const vectorStats = showVectorStats();
    console.log('');
    
    // 3. 矩阵统计
    const matrixStats = showMatrixStats();
    console.log('');
    
    // 4. 配置查看
    showConfig();
    console.log('');
    
    // 5. History上下文测试
    if (vectorStats.historyCount > 0) {
        await testHistoryContext('修炼');
        console.log('');
    }
    
    // 6. 存档数据检查
    await checkSaveData();
    console.log('');
    
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║     测试完成！                                 ║');
    console.log('╚════════════════════════════════════════════════╝');
}

// ==================== 导出函数 ====================

// 如果在浏览器环境，挂载到window
if (typeof window !== 'undefined') {
    window.HistoryMatrixTest = {
        // 基础检查
        checkSystemLoaded,
        showVectorStats,
        showRecentHistory,
        
        // 矩阵检查
        showMatrixStats,
        visualizeConversationMatrix,
        visualizeHistoryMatrix,
        
        // 检索测试
        testHistoryContext,
        testMatrixSearch,
        
        // 矩阵重建
        rebuildAllMatrices,
        
        // 配置
        showConfig,
        updateConfig,
        
        // 存档测试
        checkSaveData,
        
        // 完整测试
        runFullTest
    };
    
    console.log('✅ History矩阵测试工具已加载');
    console.log('💡 使用 HistoryMatrixTest.runFullTest() 运行完整测试');
    console.log('💡 使用 HistoryMatrixTest.showConfig() 查看配置');
}

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        checkSystemLoaded,
        showVectorStats,
        showRecentHistory,
        showMatrixStats,
        visualizeConversationMatrix,
        visualizeHistoryMatrix,
        testHistoryContext,
        testMatrixSearch,
        rebuildAllMatrices,
        showConfig,
        updateConfig,
        checkSaveData,
        runFullTest
    };
}
