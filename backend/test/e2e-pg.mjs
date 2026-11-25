// Starts an embedded PostgreSQL 16 instance for local e2e testing (no Docker needed).
import EmbeddedPostgres from 'embedded-postgres';
import { writeFileSync, rmSync } from 'node:fs';

const pg = new EmbeddedPostgres({
  databaseDir: '/tmp/xtalk-pgdata',
  user: 'xtalk',
  password: 'xtalk',
  port: 5433,
  persistent: false,
});
rmSync('/tmp/xtalk-pgdata', { recursive: true, force: true });
await pg.initialise();
await pg.start();
await pg.createDatabase('xtalk');
writeFileSync('/tmp/xtalk-pg-ready', 'ok');
console.log('embedded postgres ready on 5433');
process.on('SIGTERM', async () => { await pg.stop(); process.exit(0); });
setInterval(() => {}, 1000);
