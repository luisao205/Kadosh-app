const main = require('../functions/main');

console.log('--- Testing Functions Exports ---');
console.log('Exported functions count:', Object.keys(main).length);
console.log('setMusicAIAccess:', typeof main.setMusicAIAccess);
console.log('processMusicAI:', typeof main.processMusicAI);

if (typeof main.setMusicAIAccess !== 'function' || typeof main.processMusicAI !== 'function') {
  console.error('FAIL: Missing Music AI cloud functions');
  process.exit(1);
}

console.log('PASS: All functions exported cleanly');
