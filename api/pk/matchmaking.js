const cors = require('../_lib/cors');
const { getKv } = require('../_lib/kv');

const MATCH_TTL = 3600;      // 匹配数据 1 小时过期
const QUEUE_CLEANUP = 120;   // 队列条目 2 分钟过期（待清理）

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const kv = getKv();
  const parsedUrl = new URL(req.url, 'http://localhost');
  const userId = parsedUrl.searchParams.get('userId');
  const cancel = parsedUrl.searchParams.get('cancel');

  try {
    // ========== GET：轮询匹配状态 ==========
    if (req.method === 'GET' && userId) {
      const matchId = await kv.get('pk:match:' + userId);
      if (matchId) {
        const match = await kv.hgetall('pk:match:' + matchId);
        if (match && match.status === 'matched') {
          const oppId = match.player1 === userId ? match.player2 : match.player1;
          const oppUser = await kv.hgetall('user:' + oppId);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'matched',
            matchId: matchId,
            opponentId: oppId,
            opponentNickname: (oppUser && oppUser.nickname) ? oppUser.nickname : '对手'
          }));
          return;
        }
      }

      // 检查是否还在队列中
      const queuePos = await kv.lpos('pk:queue', userId);
      if (queuePos !== null) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'waiting', queuePosition: queuePos }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'not_in_queue' }));
      return;
    }

    // ========== POST：加入队列 / 取消 ==========
    if (req.method === 'POST') {
      let body = '';
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', async function () {
        try {
          const data = JSON.parse(body);
          const uid = data.userId;

          if (!uid) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'missing_userId' }));
            return;
          }

          // 取消匹配
          if (cancel === '1') {
            // 从队列移除
            await kv.lrem('pk:queue', 1, uid);
            // 清除匹配映射
            const currentMatchId = await kv.get('pk:match:' + uid);
            if (currentMatchId) {
              const match = await kv.hgetall('pk:match:' + currentMatchId);
              if (match) {
                const oppId = match.player1 === uid ? match.player2 : match.player1;
                await kv.del('pk:match:' + uid);
                await kv.del('pk:match:' + oppId);
                // 通知对手匹配取消（设置 match 状态为 cancelled）
                await kv.hset('pk:match:' + currentMatchId, { status: 'cancelled' });
              }
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'cancelled' }));
            return;
          }

          // 检查是否已在匹配中
          const existingMatchId = await kv.get('pk:match:' + uid);
          if (existingMatchId) {
            const match = await kv.hgetall('pk:match:' + existingMatchId);
            if (match && match.status === 'matched') {
              const oppId = match.player1 === uid ? match.player2 : match.player1;
              const oppUser = await kv.hgetall('user:' + oppId);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                status: 'matched',
                matchId: existingMatchId,
                opponentId: oppId,
                opponentNickname: (oppUser && oppUser.nickname) ? oppUser.nickname : '对手'
              }));
              return;
            }
            // 旧匹配已过期，清理
            await kv.del('pk:match:' + uid);
          }

          // 检查队列中是否已有等待的玩家
          const queueLen = await kv.llen('pk:queue');
          if (queueLen > 0) {
            // 检查对手是否是自己，防止自我匹配
            let opponentId = null;
            for (let i = 0; i < Math.min(queueLen, 5); i++) {
              const candidate = await kv.lindex('pk:queue', i);
              if (candidate && candidate !== uid) {
                const candidateMatch = await kv.get('pk:match:' + candidate);
                if (!candidateMatch) {
                  opponentId = candidate;
                  break;
                }
              }
            }

            if (opponentId) {
              // 从队列移除对手
              await kv.lrem('pk:queue', 1, opponentId);

              // 创建比赛
              const crypto = require('crypto');
              const matchId = crypto.randomUUID();

              await kv.hset('pk:match:' + matchId, {
                player1: opponentId,
                player2: uid,
                created_at: String(Date.now()),
                status: 'matched',
                p1_progress: '',
                p2_progress: '',
                p1_last_sync: '0',
                p2_last_sync: '0'
              });
              await kv.expire('pk:match:' + matchId, MATCH_TTL);
              await kv.set('pk:match:' + opponentId, matchId, { ex: MATCH_TTL });
              await kv.set('pk:match:' + uid, matchId, { ex: MATCH_TTL });

              const oppUser = await kv.hgetall('user:' + opponentId);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                status: 'matched',
                matchId: matchId,
                opponentId: opponentId,
                opponentNickname: (oppUser && oppUser.nickname) ? oppUser.nickname : '对手'
              }));
              return;
            }
          }

          // 没有等待的玩家，自己加入队列
          // 先检查是否已在队列中
          const alreadyInQueue = await kv.lpos('pk:queue', uid);
          if (alreadyInQueue === null) {
            await kv.lpush('pk:queue', uid);
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'waiting' }));
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
    console.error('matchmaking error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};
