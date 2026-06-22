const { createClient } = require('@vercel/kv');

let client = null;

function getKv() {
  if (!client) {
    client = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return client;
}

module.exports = { getKv };
