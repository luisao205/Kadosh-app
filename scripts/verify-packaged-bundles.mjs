import fs from 'fs';
import path from 'path';

const androidAssets = path.resolve('android/app/src/main/assets/public/assets');
const f = 'index-Cjf7heCc.js';
const code = fs.readFileSync(path.join(androidAssets, f), 'utf8');

console.log('document.fonts in Android bundle:', code.includes('document.fonts'));
console.log('loadingdone in Android bundle:', code.includes('loadingdone'));
console.log('Fondo de Proyección Automático in Android bundle:', code.includes('Fondo de Proyecci'));
console.log('Pistas Multitrack in Android bundle:', code.includes('Pistas Multitrack'));
