const cors = require('../_lib/cors');
const { getKv } = require('../_lib/kv');

const REQUEST_TTL = 86400 * 7; // 7 天过期

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const kv = getKv();
  const parsedUrl = new URL(req.url, 'http://localhost');

  try {
    const userId = parsedUrl.searchParams.get('userId');

    // GET: 获取收到的好友请求列表
    if (req.method === 'GET' && userId) {
      const raw = await kv.lrange('friend_requests:' + userId, 0, 49);
      const requests = raw.map(function (r) {
        try { return JSON.parse(r); } catch (e) { return null; }
      }).filter(Boolean);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ requests: requests }));
      return;
    }

    // POST: 发送 / 接受 / 拒绝
    if (req.method === 'POST') {
      let body = '';
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', async function () {
        try {
          const data = JSON.parse(body);
          const { userId: fromId, friendUserId: toId, action } = data;

          if (!fromId || !toId || !action) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'missing_params' }));
            return;
          }

          // 已经是好友了
          const alreadyFriend = await kv.sismember('friends:' + fromId, toId);
          if (alreadyFriend) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'already_friends' }));
            return;
          }

          // === 发送好友请求 ===
          if (action === 'send') {
            // 检查是否已有待处理的请求（防止重复发送）
            const existing = await kv.lrange('friend_requests:' + toId, 0, 49);
            for (const r of existing) {
              try {
                const req = JSON.parse(r);
                if (req.from === fromId) {
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ status: 'already_sent' }));
                  return;
                }
              } catch (e) {}
            }

            const fromUser = await kv.hgetall('user:' + fromId);
            const request = {
              from: fromId,
              to: toId,
              fromNickname: (fromUser && fromUser.nickname) ? fromUser.nickname : 'unknown',
              timestamp: Date.now()
            };

            await kv.lpush('friend_requests:' + toId, JSON.stringify(request));
            await kv.expire('friend_requests:' + toId, REQUEST_TTL);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'sent' }));
            return;
          }

          // === 接受好友请求 ===
          if (action === 'accept') {
            // 双向添加好友
            await kv.sadd('friends:' + fromId, toId);
            await kv.sadd('friends:' + toId, fromId);

            // 删除该请求
            await removeRequest(kv, fromId, toId);

            const oppUser = await kv.hgetall('user:' + toId);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              status: 'accepted',
              friend: {
                userId: toId,
                nickname: (oppUser && oppUser.nickname) ? oppUser.nickname : 'unknown'
              }
            }));
            return;
          }

          // === 拒绝好友请求 ===
          if (action === 'decline') {
            await removeRequest(kv, fromId, toId);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'declined' }));
            return;
          }

          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'invalid_action' }));
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
    console.error('friend request error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};

async function removeRequest(kv, toId, fromId) {
  const raw = await kv.lrange('friend_requests:' + toId, 0, 99);
  for (let i = 0; i < raw.length; i++) {
    try {
      const req = JSON.parse(raw[i]);
      if (req.from === fromId) {
        // 用删除标记替换（lrem 按值匹配不可靠，重建列表）
        const remaining = [];
        for (let j = 0; j < raw.length; j++) {
          try {
            const r = JSON.parse(raw[j]);
            if (r.from !== fromId) remaining.push(raw[j]);
          } catch (e) {}
        }
        await kv.del('friend_requests:' + toId);
        if (remaining.length > 0) {
          for (const r of remaining) {
            await kv.lpush('friend_requests:' + toId, r);
          }
        }
        return;
      }
    } catch (e) {}
  }
}
