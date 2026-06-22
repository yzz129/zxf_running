const cors = require('../_lib/cors');
const { getKv } = require('../_lib/kv');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const kv = getKv();
  const parsedUrl = new URL(req.url, 'http://localhost');
  const friendUserId = parsedUrl.searchParams.get('friendUserId');

  try {
    // GET：通过 userId 搜索用户（添加好友前查找）
    if (req.method === 'GET' && friendUserId) {
      const user = await kv.hgetall('user:' + friendUserId);
      if (!user || !user.nickname) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'user_not_found' }));
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        userId: friendUserId,
        nickname: user.nickname,
        bestScore: parseInt(user.best_score || '0')
      }));
      return;
    }

    // POST：添加好友
    if (req.method === 'POST') {
      let body = '';
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', async function () {
        try {
          const data = JSON.parse(body);
          const { userId, friendUserId: fuid } = data;
          if (!userId || !fuid) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'missing_params' }));
            return;
          }

          if (userId === fuid) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'cannot_add_self' }));
            return;
          }

          // 验证双方都存在
          const me = await kv.hgetall('user:' + userId);
          const friend = await kv.hgetall('user:' + fuid);
          if (!me || !friend) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'user_not_found' }));
            return;
          }

          // 双向添加好友
          await kv.sadd('friends:' + userId, fuid);
          await kv.sadd('friends:' + fuid, userId);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            ok: true,
            friend: { userId: fuid, nickname: friend.nickname }
          }));
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
    console.error('friends add error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};
