const cors = require('../_lib/cors');
const { getKv } = require('../_lib/kv');

const MAX_MESSAGES = 100;       // 每个对话最多保留 100 条消息
const MESSAGE_TTL = 86400 * 7;  // 7 天过期

function convKey(uid1, uid2) {
  // 按字典序排列，确保同一对话使用同一个 key
  return uid1 < uid2 ? ('chat:conv:' + uid1 + ':' + uid2) : ('chat:conv:' + uid2 + ':' + uid1);
}

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const kv = getKv();
  const parsedUrl = new URL(req.url, 'http://localhost');

  try {
    const userId = parsedUrl.searchParams.get('userId');
    const friendId = parsedUrl.searchParams.get('friendId');

    // GET: 获取与好友的聊天记录
    if (req.method === 'GET' && userId && friendId) {
      const key = convKey(userId, friendId);
      const raw = await kv.lrange(key, 0, MAX_MESSAGES - 1);
      const messages = raw.map(function (r) {
        try { return JSON.parse(r); } catch (e) { return null; }
      }).filter(Boolean);
      // 列表是旧的在前，反转使最新的在前端显示在最下方
      messages.reverse();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ messages: messages }));
      return;
    }

    // POST: 发送消息
    if (req.method === 'POST') {
      let body = '';
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', async function () {
        try {
          const data = JSON.parse(body);
          const { userId: fromId, friendId: toId, text, type } = data;
          if (!fromId || !toId || !text) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'missing_params' }));
            return;
          }

          const msgType = type || 'chat';
          const msg = {
            from: fromId,
            to: toId,
            type: msgType,
            text: text,
            timestamp: Date.now()
          };

          const key = convKey(fromId, toId);
          // 添加到列表头部（最新的在前）
          await kv.lpush(key, JSON.stringify(msg));
          // 裁剪到 MAX_MESSAGES
          await kv.ltrim(key, 0, MAX_MESSAGES - 1);
          await kv.expire(key, MESSAGE_TTL);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, message: msg }));
        } catch (e) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'invalid_json' }));
        }
      });
      return;
    }

    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
  } catch (err) {
    console.error('chat error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};
