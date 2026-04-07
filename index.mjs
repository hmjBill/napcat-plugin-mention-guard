// NapCat 插件 - @提及守卫
// 监测非白名单用户在指定群聊中@机器人时自动禁言30分钟

// ============ 默认配置 ============
const DEFAULT_MONITORED_GROUPS = [
  "1107201723",
  "893387793",
  "170874625",
  "1033811323",
];

const DEFAULT_WHITELIST = [];
const DEFAULT_MUTE_DURATION_MINUTES = 30;
let BOT_USER_ID = "";

function parseIdList(value, fallback) {
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

function parseMuteDurationMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MUTE_DURATION_MINUTES;
  }

  return Math.floor(parsed);
}

function readSettings(pluginConfig) {
  const monitoredGroups = parseIdList(
    pluginConfig?.monitoredGroups,
    DEFAULT_MONITORED_GROUPS,
  );

  const whitelist = parseIdList(
    pluginConfig?.whitelistQQ ?? pluginConfig?.whitelist,
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
function isAtUser(message, targetUserId) {
  if (!targetUserId) {
    return false;
  }

  if (!message.message || !Array.isArray(message.message)) {
    const raw = typeof message.raw_message === "string" ? message.raw_message : "";
    if (!raw) {
      return false;
    }

    const escapedTarget = targetUserId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const atRegex = new RegExp(`\\[CQ:at,qq=${escapedTarget}(?:,|\\])`);
    return atRegex.test(raw);
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

async function ensureBotUserId(ctx, event) {
  if (BOT_USER_ID) {
    return BOT_USER_ID;
  }

  if (event && event.self_id !== undefined && event.self_id !== null) {
    BOT_USER_ID = String(event.self_id);
    return BOT_USER_ID;
  }

  try {
    const config = await ctx.actions.call(
      'get_login_info',
      void 0,
      ctx.adapterName,
      ctx.pluginManager.config
    );
    if (config && config.user_id) {
      BOT_USER_ID = String(config.user_id);
      return BOT_USER_ID;
    }
  } catch (e) {
    return "";
  }

  return "";
}

// 插件初始化
export async function plugin_init(ctx) {
  const settings = readSettings(ctx.pluginManager.config);
  ctx.logger.log('[MentionGuard] 插件已加载');
  ctx.logger.log(`[MentionGuard] 监控群聊: ${settings.monitoredGroups.join(', ')}`);
  ctx.logger.log(`[MentionGuard] 白名单用户: ${settings.whitelist.length} 个`);
  ctx.logger.log(`[MentionGuard] 禁言时长: ${settings.muteDurationSeconds} 秒`);
  
  const botUserId = await ensureBotUserId(ctx);
  if (botUserId) {
    ctx.logger.log(`[MentionGuard] 检测到机器人QQ号: ${BOT_USER_ID}`);
  } else {
    ctx.logger.warn('[MentionGuard] 无法获取机器人QQ号，将在收到第一条消息时重试');
  }
}

// 消息处理
export async function plugin_onmessage(ctx, event) {
  // post_type 在部分事件里可能缺失；仅在存在且非 message 时跳过
  if (event.post_type && event.post_type !== 'message') return;
  
  // 仅处理群消息；message_type 在部分事件里可能缺失
  if (event.message_type && event.message_type !== 'group') return;
  
  const message = event;
  const groupId = message.group_id;
  const userId = String(message.user_id);

  if (!groupId || !userId || userId === "undefined" || userId === "null") {
    return;
  }
  const settings = readSettings(ctx.pluginManager.config);
  
  if (!groupId || !settings.monitoredGroups.includes(String(groupId))) {
    return;
  }
  
  const botUserId = await ensureBotUserId(ctx, message);
  if (!botUserId) {
    return;
  }
  
  // 检查是否@了机器人
  if (!isAtUser(message, botUserId)) {
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
}

// 插件卸载
export function plugin_cleanup(ctx) {
  ctx.logger.log('[MentionGuard] 插件正在清理...');
}

// 配置Schema（用于 NapCat WebUI 自定义配置）
export const plugin_config_ui = [
  {
    key: 'monitoredGroups',
    label: '监控群聊',
    type: 'string',
    default: DEFAULT_MONITORED_GROUPS.join(','),
    placeholder: '多个群号用逗号/空格/换行分隔',
    description: '需要启用守卫的群号列表（支持逗号、空格、换行）',
  },
  {
    key: 'whitelistQQ',
    label: '白名单QQ号',
    type: 'string',
    default: '',
    placeholder: '多个QQ号用逗号/空格/换行分隔',
    description: '白名单QQ号列表，这些用户@机器人不会被禁言',
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

export const plugin_config_schema = plugin_config_ui;
