import type { PluginModule, OB11Message } from "napcat-types";
import { EventType } from "napcat-types";

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

// 机器人自己的QQ号（需要配置）
// 可以通过配置文件动态设置
let BOT_USER_ID = "";
// ==================================

/**
 * 检查消息中是否@了指定用户
 */
function isAtUser(message: OB11Message, targetUserId: string): boolean {
  if (!message.message || !Array.isArray(message.message)) {
    return false;
  }
  
  for (const segment of message.message) {
    if (segment.type === "at" && segment.data && segment.data.qq) {
      // "all" 表示@全体成员，不算@个人
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
function isWhitelisted(userId: string): boolean {
  return ONEBOT_WHITELIST.includes(userId);
}

/**
 * 检查群是否在监控列表中
 */
function isMonitoredGroup(groupId: string | number | undefined): boolean {
  if (!groupId) return false;
  return MONITORED_GROUPS.includes(String(groupId));
}

// 插件初始化
export const plugin_init: PluginModule['plugin_init'] = async (ctx) => {
  ctx.logger.log('[MentionGuard] 插件已加载');
  ctx.logger.log(`[MentionGuard] 监控群聊: ${MONITORED_GROUPS.join(', ')}`);
  ctx.logger.log(`[MentionGuard] 白名单用户: ${ONEBOT_WHITELIST.length} 个`);
  
  // 尝试从配置中读取机器人QQ号
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
    ctx.logger.warn('[MentionGuard] 无法获取机器人QQ号，请确保配置正确');
  }
};

// 消息处理
export const plugin_onmessage: PluginModule['plugin_onmessage'] = async (ctx, event) => {
  // 只处理消息事件
  if (event.post_type !== EventType.MESSAGE) return;
  
  // 只处理群消息
  if (event.message_type !== 'group') return;
  
  const message = event as OB11Message;
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
};

// 插件卸载
export const plugin_cleanup: PluginModule['plugin_cleanup'] = (ctx) => {
  ctx.logger.log('[MentionGuard] 插件正在清理...');
};

// 配置Schema（可选，用于WebUI配置）
export const plugin_config_ui = [
  {
    key: 'whitelist',
    label: '白名单用户',
    type: 'array',
    default: [],
    description: 'OneBot白名单用户QQ号列表，这些用户@机器人不会被禁言'
  },
  {
    key: 'muteDuration',
    label: '禁言时长（分钟）',
    type: 'number',
    default: 30,
    min: 1,
    max: 43200,
    description: '非白名单用户@机器人后的禁言时长（默认30分钟）'
  }
];
