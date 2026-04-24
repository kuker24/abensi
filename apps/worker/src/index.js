const axios = require('axios');

const apiUrl = process.env.API_RECONCILE_URL || 'http://api:3000/api/v1/internal/reconciliation/run';
const token = process.env.WORKER_TOKEN || 'worker-dev-token';
const intervalMs = Number(process.env.WORKER_INTERVAL_MS || '15000');

async function tick() {
  try {
    const response = await axios.post(
      apiUrl,
      {},
      {
        headers: {
          'x-worker-token': token
        },
        timeout: 10000
      }
    );
    console.log(`[worker] reconciliation tick ok: ${JSON.stringify(response.data)}`);
  } catch (error) {
    const message = error.response?.data || error.message;
    console.error(`[worker] reconciliation tick failed: ${JSON.stringify(message)}`);
  }
}

async function main() {
  console.log(`[worker] started with interval ${intervalMs}ms and url ${apiUrl}`);
  await tick();
  setInterval(tick, intervalMs);
}

main();
