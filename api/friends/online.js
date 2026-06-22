const cors = require('../_lib/cors');
const { getKv } = require('../_lib/kv');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const kv = getKv();
  const parsedUrl = new URL(req.url, 'http://localhost');

  try {
    const ping = parsedUrl.searchParams.get('ping');
    const idsStr = parsedUrl.searchParams.get('ids');
    const userId = parsedUrl.searchParams.get('userId');

    // GET: 心跳上报（?ping=1&userId=xxx）
    if (req.method === 'GET' && ping === '1' && userId) {
      const key = 'online:' + userId;
      try {
        await kv.set(key, '1');
        await kv.expire(key, 45);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, userId: userId }));
      } catch (e) {
        console.error('heartbeat set error:', e);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'kv_write_failed' }));
      }
      return;
    }

    // GET: 批量查询在线状态（?ids=id1,id2）
    if (req.method === 'GET' && idsStr) {
      const ids = idsStr.split(',').filter(Boolean);
      const result = {};
      for (const id of ids) {
        try {
          const val = await kv.get('online:' + id);
          result[id] = val === '1';
        } catch (e) {
          result[id] = false;
        }
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ online: result }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ online: {} }));
  } catch (err) {
    console.error('online error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};
