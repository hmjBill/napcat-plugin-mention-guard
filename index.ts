import type { PluginModule, OB11Message } from "napcat-types";
import { EventType } from "napcat-types";

// ============ 默认配置 ============
const DEFAULT_MONITORED_GROUPS = [
  "1107201723",
  "893387793",
  "170874625",
  "1033811323",
];

const DEFAULT_WHITELIST: string[] = [];
const DEFAULT_MUTE_DURATION_MINUTES = 30;
let BOT_USER_ID = "";

type RuntimeSettings = {
  monitoredGroups: string[];
  whitelist: string[];
  muteDurationSeconds: number;
};

function parseIdList(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n\r\s]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return fallback;
}

function parseMuteDurationMinutes(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MUTE_DURATION_MINUTES;
  }

  return Math.floor(parsed);
}

function readSettings(pluginConfig: Record<string, unknown> | undefined): RuntimeSettings {
  const monitoredGroups = parseIdList(
    pluginConfig?.monitoredGroups,
    DEFAULT_MONITORED_GROUPS,
  );

  const whitelist = parseIdList(
    pluginConfig?.whitelist,
    DEFAULT_WHITELIST,
  );

  const muteDurationMinutes = parseMuteDurationMinutes(pluginConfig?.muteDuration);

  return {
    monitoredGroups,
    whitelist,
    muteDurationSeconds: muteDurationMinutes * 60,
  };
}

/**
 * 检查消息中是否@了指定用户
 */
function isAtUser(message: OB11Message, targetUserId: string): boolean {
  if (!message.message || !Array.isArray(message.message)) {
    return false;
  }
  
  for (const segment of message.message) {
    if (segment.type === "at" && segment.data && segment.data.qq) {
      if (String(segment.data.qq) === targetUserId) {
        return true;
      }
    }
  }
  return false;
}

// 插件初始化
export const plugin_init: PluginModule['plugin_init'] = async (ctx) => {
  const settings = readSettings(ctx.pluginManager.config as Record<string, unknown> | undefined);
  ctx.logger.log('[MentionGuard] 插件已加载');
  ctx.logger.log(`[MentionGuard] 监控群聊: ${settings.monitoredGroups.join(', ')}`);
  ctx.logger.log(`[MentionGuard] 白名单用户: ${settings.whitelist.length} 个`);
  ctx.logger.log(`[MentionGuard] 禁言时长: ${settings.muteDurationSeconds} 秒`);
  
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
  const settings = readSettings(ctx.pluginManager.config as Record<string, unknown> | undefined);
  
  if (!groupId || !settings.monitoredGroups.includes(String(groupId))) {
    return;
  }
  
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
  
  if (settings.whitelist.includes(userId)) {
    ctx.logger.log(`[MentionGuard] 白名单用户 ${userId} @了机器人，跳过处理`);
    return;
  }
  
  try {
    ctx.logger.log(`[MentionGuard] 检测到非白名单用户 ${userId} 在群 ${groupId} 中@机器人，执行禁言 ${settings.muteDurationSeconds} 秒`);
    
    await ctx.actions.call(
      'set_group_ban',
      {
        group_id: String(groupId),
        user_id: userId,
        duration: settings.muteDurationSeconds,
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
    key: 'monitoredGroups',
    label: '监控群聊',
    type: 'array',
    default: DEFAULT_MONITORED_GROUPS,
    description: '需要启用守卫的群号列表',
  },
  {
    key: 'whitelist',
    label: '白名单用户',
    type: 'array',
    default: DEFAULT_WHITELIST,
    description: '白名单用户QQ号列表，这些用户@机器人不会被禁言',
  },
  {
    key: 'muteDuration',
    label: '禁言时长（分钟）',
    type: 'number',
    default: DEFAULT_MUTE_DURATION_MINUTES,
    min: 1,
    max: 720,
    description: '非白名单用户@机器人后的禁言时长（分钟）',
  },
];
