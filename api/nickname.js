const cors = require('./_lib/cors');
const { getKv } = require('./_lib/kv');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const kv = getKv();
  const parsedUrl = new URL(req.url, 'http://localhost');
  const userId = parsedUrl.searchParams.get('userId');

  try {
    if (req.method === 'GET' && userId) {
      // 验证已有昵称
      const user = await kv.hgetall('user:' + userId);
      if (user && user.nickname) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ userId: userId, nickname: user.nickname }));
      } else {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'not_found' }));
      }
      return;
    }

    if (req.method === 'POST') {
      // 分配新昵称
      const crypto = require('crypto');
      const newUserId = crypto.randomUUID();
      const seq = await kv.incr('global:nickname_counter');
      const nickname = 'zxf_' + seq;

      await kv.hset('user:' + newUserId, {
        nickname: nickname,
        best_score: '0',
        created_at: String(Date.now())
      });
      await kv.sadd('users', newUserId);

      res.statusCode = 201;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ userId: newUserId, nickname: nickname }));
      return;
    }

    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
  } catch (err) {
    console.error('nickname error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};
