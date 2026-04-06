// NapCat 插件 - @提及守卫
// 监测非白名单用户在指定群聊中@机器人时自动禁言30分钟

// ============ 配置区域 ============
// 受监控的群聊列表
const MONITORED_GROUPS = [
  "1107201723",
  "893387793", 
  "170874625",
  "1033811323"
];

// OneBot 白名单用户列表（这些用户@你不会被禁言）
const ONEBOT_WHITELIST = [
  // 在这里添加白名单用户QQ号，例如:
  // "123456789",
  // "987654321"
];

// 禁言时长（秒）- 30分钟 = 1800秒
const MUTE_DURATION = 30 * 60;

// 机器人自己的QQ号（自动获取）
let BOT_USER_ID = "";
// ==================================

/**
 * 检查消息中是否@了指定用户
 */
function isAtUser(message, targetUserId) {
  if (!message.message || !Array.isArray(message.message)) {
    return false;
  }
  
  for (const segment of message.message) {
    if (segment.type === "at" && segment.data && segment.data.qq) {
      if (segment.data.qq === targetUserId) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 检查用户是否在白名单中
 */
function isWhitelisted(userId) {
  return ONEBOT_WHITELIST.includes(userId);
}

/**
 * 检查群是否在监控列表中
 */
function isMonitoredGroup(groupId) {
  if (!groupId) return false;
  return MONITORED_GROUPS.includes(String(groupId));
}

// 插件初始化
export async function plugin_init(ctx) {
  ctx.logger.log('[MentionGuard] 插件已加载');
  ctx.logger.log(`[MentionGuard] 监控群聊: ${MONITORED_GROUPS.join(', ')}`);
  ctx.logger.log(`[MentionGuard] 白名单用户: ${ONEBOT_WHITELIST.length} 个`);
  
  // 尝试获取机器人QQ号
  try {
    const config = await ctx.actions.call(
      'get_login_info', 
      void 0, 
      ctx.adapterName, 
      ctx.pluginManager.config
    );
    if (config && config.user_id) {
      BOT_USER_ID = String(config.user_id);
      ctx.logger.log(`[MentionGuard] 检测到机器人QQ号: ${BOT_USER_ID}`);
    }
  } catch (e) {
    ctx.logger.warn('[MentionGuard] 无法获取机器人QQ号，将在收到第一条消息时重试');
  }
}

// 消息处理
export async function plugin_onmessage(ctx, event) {
  // 只处理消息事件
  if (event.post_type !== 'message') return;
  
  // 只处理群消息
  if (event.message_type !== 'group') return;
  
  const message = event;
  const groupId = message.group_id;
  const userId = String(message.user_id);
  
  // 检查是否在监控群列表中
  if (!isMonitoredGroup(groupId)) {
    return;
  }
  
  // 如果机器人QQ号还没获取到，尝试获取
  if (!BOT_USER_ID) {
    try {
      const config = await ctx.actions.call(
        'get_login_info', 
        void 0, 
        ctx.adapterName, 
        ctx.pluginManager.config
      );
      if (config && config.user_id) {
        BOT_USER_ID = String(config.user_id);
      }
    } catch (e) {
      return;
    }
  }
  
  // 检查是否@了机器人
  if (!isAtUser(message, BOT_USER_ID)) {
    return;
  }
  
  // 检查用户是否在白名单中
  if (isWhitelisted(userId)) {
    ctx.logger.log(`[MentionGuard] 白名单用户 ${userId} @了机器人，跳过处理`);
    return;
  }
  
  // 执行禁言
  try {
    ctx.logger.log(`[MentionGuard] 检测到非白名单用户 ${userId} 在群 ${groupId} 中@机器人，执行禁言 ${MUTE_DURATION} 秒`);
    
    await ctx.actions.call(
      'set_group_ban',
      {
        group_id: String(groupId),
        user_id: userId,
        duration: MUTE_DURATION
      },
      ctx.adapterName,
      ctx.pluginManager.config
    );
    
    ctx.logger.log(`[MentionGuard] 成功禁言用户 ${userId}`);
  } catch (error) {
    ctx.logger.error(`[MentionGuard] 禁言失败:`, error);
  }
}

// 插件卸载
export function plugin_cleanup(ctx) {
  ctx.logger.log('[MentionGuard] 插件正在清理...');
}
