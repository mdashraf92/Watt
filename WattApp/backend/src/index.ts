import { pollPackageCharging } from './modules/packages/charging';
import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';
import { attachRealtime } from './realtime/socket';

async function main() {
  // Verify the DB connection before accepting traffic.
  await pool.query('select 1');

  const app = createApp();
  const server = createServer(app);
  attachRealtime(server);   // Socket.IO for live updates (replaces Supabase Realtime)

  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`GO WATT API + realtime listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  let monitor: ReturnType<typeof setInterval> | undefined;
  if (env.PACKAGES_MONITOR_ENABLED) {
    const tick = () => {
      void pollPackageCharging().then(results => {
        const pending = results.filter(r => r.state === 'retry_required');
        if (pending.length) console.error('Package chargers need stop/connectivity review:', pending.map(r => r.id));
      }).catch(() => console.error('Package monitor failed; check database/device connectivity'));
    };
    tick();
    monitor = setInterval(tick, 10_000);
  }

  const shutdown = async () => {
    if (monitor) clearInterval(monitor);
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', e);
  process.exit(1);
});
