const cors = require('./_lib/cors');

module.exports = function handler(req, res) {
  if (cors(req, res)) return;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
};
