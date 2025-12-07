/**
 * 移动端UI模块
 * 统一处理移动端Tab切换等UI交互
 * 
 * @author 重构自game.html和game-bhz.html的重复代码
 * @version 1.0.0
 */

/**
 * 移动端Tab切换
 * @param {string} tabName - Tab名称: 'game' 或 'status'
 */
window.switchMobileTab = function(tabName) {
    console.log('[移动端Tab] 切换到:', tabName);
    
    try {
        // 移除所有Tab按钮的active类
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // 获取面板元素
        const gamePanel = document.querySelector('.game-panel');
        const statusPanel = document.querySelector('.status-panel');
        
        if (!gamePanel || !statusPanel) {
            console.warn('[移动端Tab] 面板元素未找到');
            return;
        }
        
        // 移除所有面板的active类
        gamePanel.classList.remove('active');
        statusPanel.classList.remove('active');

        // 激活目标Tab按钮
        const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
        if (targetTab) {
            targetTab.classList.add('active');
        } else {
            console.warn(`[移动端Tab] 未找到Tab按钮: ${tabName}`);
        }
        
        // 激活目标面板
        if (tabName === 'game') {
            gamePanel.classList.add('active');
            console.log('[移动端Tab] ✅ 游戏面板已激活');
        } else if (tabName === 'status') {
            statusPanel.classList.add('active');
            console.log('[移动端Tab] ✅ 状态面板已激活');
        } else {
            console.warn(`[移动端Tab] 未知Tab名称: ${tabName}`);
        }
    } catch (error) {
        console.error('[移动端Tab] 切换失败:', error);
        console.error('错误堆栈:', error.stack);
    }
};

/**
 * 检测是否为移动设备
 * @returns {boolean}
 */
window.isMobileDevice = function() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * 自动调整移动端布局
 */
window.autoAdjustMobileLayout = function() {
    if (isMobileDevice()) {
        console.log('[移动端UI] 检测到移动设备，应用移动端样式');
        document.body.classList.add('mobile-device');
        
        // 默认显示游戏面板
        switchMobileTab('game');
    } else {
        console.log('[移动端UI] 检测到桌面设备');
        document.body.classList.add('desktop-device');
    }
};

/**
 * 初始化移动端UI
 */
window.initMobileUI = function() {
    console.log('[移动端UI] 初始化');
    
    // 自动调整布局
    autoAdjustMobileLayout();
    
    // 绑定Tab按钮点击事件
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            if (tabName) {
                switchMobileTab(tabName);
            }
        });
    });
    
    // 监听窗口大小变化
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            autoAdjustMobileLayout();
        }, 250);
    });
    
    console.log('[移动端UI] ✅ 初始化完成');
};

// DOMContentLoaded时自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileUI);
} else {
    initMobileUI();
}

console.log('📦 [模块加载] mobile-ui.js 已加载');
