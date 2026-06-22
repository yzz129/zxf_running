const cors = require('../_lib/cors');
const { getKv } = require('../_lib/kv');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const kv = getKv();
  const parsedUrl = new URL(req.url, 'http://localhost');
  const userId = parsedUrl.searchParams.get('userId');

  try {
    if (req.method === 'GET' && userId) {
      const friendIds = await kv.smembers('friends:' + userId);
      if (!friendIds || friendIds.length === 0) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ friends: [] }));
        return;
      }

      const friends = [];
      for (const fid of friendIds) {
        const user = await kv.hgetall('user:' + fid);
        if (user && user.nickname) {
          friends.push({
            userId: fid,
            nickname: user.nickname,
            bestScore: parseInt(user.best_score || '0')
          });
        }
      }

      // 按最佳分数排序
      friends.sort((a, b) => b.bestScore - a.bestScore);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ friends }));
      return;
    }

    // POST：删除好友
    if (req.method === 'POST') {
      let body = '';
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', async function () {
        try {
          const data = JSON.parse(body);
          const { userId: uid, friendUserId: fuid } = data;
          if (!uid || !fuid) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'missing_params' }));
            return;
          }
          await kv.srem('friends:' + uid, fuid);
          await kv.srem('friends:' + fuid, uid);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
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
    console.error('friends list error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};
