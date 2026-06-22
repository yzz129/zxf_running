const cors = require('../_lib/cors');
const { getKv } = require('../_lib/kv');

const MAX_STALE_MS = 15000;  // 对手 15 秒无更新视为离线

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const kv = getKv();
  const parsedUrl = new URL(req.url, 'http://localhost');
  const matchId = parsedUrl.searchParams.get('matchId');
  const userId = parsedUrl.searchParams.get('userId');

  try {
    // ========== GET：获取对手进度 ==========
    if (req.method === 'GET' && matchId && userId) {
      const match = await kv.hgetall('pk:match:' + matchId);
      if (!match) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'match_not_found' }));
        return;
      }

      if (match.status === 'cancelled') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'match_cancelled' }));
        return;
      }

      // 确定请求者是 player1 还是 player2
      var isPlayer1 = match.player1 === userId;
      var oppProgressKey = isPlayer1 ? 'p2_progress' : 'p1_progress';
      var oppLastSyncKey = isPlayer1 ? 'p2_last_sync' : 'p1_last_sync';

      var oppProgressRaw = match[oppProgressKey] || '';
      var oppLastSync = parseInt(match[oppLastSyncKey] || '0');

      if (oppProgressRaw) {
        try {
          var oppData = JSON.parse(oppProgressRaw);
          var now = Date.now();

          // 如果对手超过阈值未更新，视为离线
          if (oppLastSync && (now - oppLastSync) > MAX_STALE_MS && oppData.alive) {
            oppData.alive = false;
            oppData.finished = true;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            opponentScore: oppData.score || 0,
            opponentDistance: oppData.distance || 0,
            opponentAlive: oppData.alive !== false,
            opponentFinished: oppData.finished === true,
            matchStatus: match.status
          }));
        } catch (e) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            opponentScore: 0,
            opponentDistance: 0,
            opponentAlive: true,
            opponentFinished: false,
            matchStatus: match.status
          }));
        }
      } else {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          opponentScore: 0,
          opponentDistance: 0,
          opponentAlive: true,
          opponentFinished: false,
          matchStatus: match.status
        }));
      }
      return;
    }

    // ========== POST：更新自己进度 ==========
    if (req.method === 'POST') {
      let body = '';
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', async function () {
        try {
          const data = JSON.parse(body);
          const { userId: uid, matchId: mid, score, distance, speed, alive, finished } = data;

          if (!uid || !mid) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'missing_userId_or_matchId' }));
            return;
          }

          const match = await kv.hgetall('pk:match:' + mid);
          if (!match) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'match_not_found' }));
            return;
          }

          var isPlayer1 = match.player1 === uid;
          var progressKey = isPlayer1 ? 'p1_progress' : 'p2_progress';
          var lastSyncKey = isPlayer1 ? 'p1_last_sync' : 'p2_last_sync';

          var progressData = JSON.stringify({
            score: score || 0,
            distance: distance || 0,
            speed: speed || 0,
            alive: alive !== false,
            finished: finished === true,
            updatedAt: Date.now()
          });

          var updateFields = {};
          updateFields[progressKey] = progressData;
          updateFields[lastSyncKey] = String(Date.now());

          // 如果一方完成，更新比赛状态
          if (finished) {
            updateFields.status = 'finished';
          }

          await kv.hset('pk:match:' + mid, updateFields);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (parseErr) {
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
    console.error('pk sync error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};
