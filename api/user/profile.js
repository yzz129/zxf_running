const cors = require('../_lib/cors');
const { getKv } = require('../_lib/kv');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const kv = getKv();
  const parsedUrl = new URL(req.url, 'http://localhost');
  const userId = parsedUrl.searchParams.get('userId');

  try {
    // GET：获取用户信息
    if (req.method === 'GET' && userId) {
      const user = await kv.hgetall('user:' + userId);
      if (!user || !user.nickname) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'user_not_found' }));
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        userId: userId,
        nickname: user.nickname,
        bestScore: parseInt(user.best_score || '0'),
        createdAt: parseInt(user.created_at || '0')
      }));
      return;
    }

    // PUT：修改昵称
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', async function () {
        try {
          const data = JSON.parse(body);
          const { userId: uid, newNickname } = data;
          if (!uid || !newNickname) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'missing_params' }));
            return;
          }

          const trimmed = newNickname.trim();
          if (trimmed.length < 1 || trimmed.length > 20) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'nickname_length_1_to_20' }));
            return;
          }

          // 检查用户是否存在
          const user = await kv.hgetall('user:' + uid);
          if (!user) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'user_not_found' }));
            return;
          }

          await kv.hset('user:' + uid, { nickname: trimmed });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ userId: uid, nickname: trimmed }));
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
    console.error('profile error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};
