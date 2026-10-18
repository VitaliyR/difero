import { resolve } from 'node:path';
import { startServer } from '../server/index.mjs';

// Run by scripts/dev.mjs under `node --watch`, on the fixed port the Vite proxy targets.
const { root } = await startServer({
  cwd: resolve(process.argv[2]),
  assetsDir: resolve('dist'),
  port: Number(process.env.DIFERO_PORT),
});
console.log(`difero api  ${root}`);
