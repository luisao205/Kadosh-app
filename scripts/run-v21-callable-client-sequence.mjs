import { spawnSync } from 'node:child_process';
import process from 'node:process';

for (const mode of ['enabled', 'restart']) {
  const result = spawnSync(process.execPath, ['scripts/test-v21-callables-emulator.cjs'], {
    env: { ...process.env, KADOSH_V21_TEST_MODE: mode },
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
