const cors = require('./_lib/cors');
const { getKv } = require('./_lib/kv');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const kv = getKv();
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pure = parsedUrl.searchParams.get('pure') !== 'false';
  const top = Math.min(parseInt(parsedUrl.searchParams.get('top') || '20'), 100);
  const offset = Math.max(parseInt(parsedUrl.searchParams.get('offset') || '0'), 0);

  try {
    if (req.method === 'GET') {
      const setKey = pure ? 'leaderboard:pure' : 'leaderboard:all';

      const total = await kv.zcard(setKey);
      if (total === 0) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ entries: [], total: 0 }));
        return;
      }

      const results = await kv.zrange(setKey, offset, offset + top - 1, {
        rev: true,
        withScores: true
      });

      const entries = [];
      for (let i = 0; i < results.length; i++) {
        const entry = results[i];
        // entry is [member, score] since withScores: true
        const member = entry[0];
        const score = entry[1];
        const user = await kv.hgetall('user:' + member);
        entries.push({
          rank: offset + i + 1,
          userId: member,
          nickname: (user && user.nickname) ? user.nickname : 'unknown',
          score: score
        });
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ entries: entries, total: total }));
      return;
    }

    if (req.method === 'POST') {
      // 提交分数
      let body = '';
      req.on('data', function (chunk) { body += chunk; });
      req.on('end', async function () {
        try {
          const data = JSON.parse(body);
          const { userId, score, modifiersUsed, pkMode } = data;

          if (!userId || score === undefined) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'missing_userId_or_score' }));
            return;
          }

          const scoreNum = Math.floor(Number(score));
          if (isNaN(scoreNum) || scoreNum <= 0) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'invalid_score' }));
            return;
          }

          // 验证用户存在
          const user = await kv.hgetall('user:' + userId);
          if (!user || !user.nickname) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'user_not_found' }));
            return;
          }

          // 更新用户最佳分数
          const oldBest = parseInt(user.best_score || '0');
          if (scoreNum > oldBest) {
            await kv.hset('user:' + userId, { best_score: String(scoreNum) });
          }

          // 全部榜（始终添加，保留最高分）
          const allMemberScore = await kv.zscore('leaderboard:all', userId);
          if (!allMemberScore || scoreNum > allMemberScore) {
            await kv.zadd('leaderboard:all', { score: scoreNum, member: userId });
          }

          // 纯净化榜（无修改器 + 非PK模式）
          if (!modifiersUsed && !pkMode) {
            const pureMemberScore = await kv.zscore('leaderboard:pure', userId);
            if (!pureMemberScore || scoreNum > pureMemberScore) {
              await kv.zadd('leaderboard:pure', { score: scoreNum, member: userId });
            }
          }

          // 获取当前排名
          const rank = await kv.zrevrank('leaderboard:all', userId);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ rank: rank !== null && rank !== undefined ? rank + 1 : null }));
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
    console.error('leaderboard error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
};
