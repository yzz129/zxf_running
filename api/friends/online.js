const cors = require('../_lib/cors');
const { getKv } = require('../_lib/kv');

// 在线心跳：每 15 秒 ping 一次，TTL 30 秒
module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const kv = getKv();
  const parsedUrl = new URL(req.url, 'http://localhost');

  try {
    // POST: 更新自己在线状态
    if (req.method === 'POST') {
      let body = '';
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', async function () {
        try {
          const data = JSON.parse(body);
          const { userId } = data;
          if (!userId) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'missing_userId' }));
            return;
          }
          await kv.set('online:' + userId, '1', { ex: 45 });
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

    // GET: 批量查询在线状态 ?ids=id1,id2,id3
    if (req.method === 'GET') {
      const idsStr = parsedUrl.searchParams.get('ids');
      if (!idsStr) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ online: {} }));
        return;
      }
      const ids = idsStr.split(',').filter(Boolean);
      const result = {};
      for (const id of ids) {
        const val = await kv.get('online:' + id);
        result[id] = val === '1';
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ online: result }));
      return;
    }

    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
  } catch (err) {
    console.error('online error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};
