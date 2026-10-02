import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const resolverPath = 'functions/canvaLinkResolver.js';
if (!fs.existsSync(resolverPath)) throw new Error('No existe functions/canvaLinkResolver.js.');

const previous = fs.readFileSync(resolverPath, 'utf8');
let next = previous;

const replaceOnce = (source, needle, replacement, label) => {
  if (source.includes(replacement)) {
    console.log(`[skip] ${label}: ya aplicado.`);
    return source;
  }
  const index = source.indexOf(needle);
  if (index === -1) throw new Error(`No se encontró: ${label}`);
  console.log(`[ok] ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
};

next = replaceOnce(
  next,
  `const isCanvaDesignView = (value) => {\n  try {\n    const url = new URL(value);\n    const host = url.hostname.toLowerCase();\n    return (host === 'canva.com' || host.endsWith('.canva.com'))\n      && url.pathname.includes('/design/')\n      && url.pathname.includes('/view');\n  } catch {\n    return false;\n  }\n};`,
  `const normalizeCanvaDesignViewUrl = (value) => {\n  try {\n    const url = new URL(value);\n    const host = url.hostname.toLowerCase();\n    if (!(host === 'canva.com' || host.endsWith('.canva.com'))) return '';\n    if (!url.pathname.includes('/design/')) return '';\n\n    if (url.pathname.endsWith('/edit')) {\n      url.pathname = url.pathname.slice(0, -5) + '/view';\n    } else if (!url.pathname.endsWith('/view')) {\n      return '';\n    }\n\n    url.hash = '';\n    return url.toString();\n  } catch {\n    return '';\n  }\n};\n\nconst isCanvaDesignView = (value) => Boolean(normalizeCanvaDesignViewUrl(value));`,
  'normalizar destino /edit de Canva a /view'
);

next = replaceOnce(
  next,
  `const toEmbedUrl = (value) => {\n  if (!isCanvaDesignView(value)) return '';\n  const url = new URL(value);\n  url.hash = '';\n  url.search = '?embed';\n  return url.toString();\n};`,
  `const toEmbedUrl = (value) => {\n  const normalized = normalizeCanvaDesignViewUrl(value);\n  if (!normalized) return '';\n  const url = new URL(normalized);\n  url.hash = '';\n  url.search = '?embed';\n  return url.toString();\n};`,
  'embed desde URL Canva normalizada'
);

next = replaceOnce(
  next,
  `const firstValidDesignUrl = (candidates) => {\n  for (const raw of candidates) {\n    const candidate = String(raw || '').trim();\n    if (isCanvaDesignView(candidate)) return candidate;\n  }\n  return '';\n};`,
  `const firstValidDesignUrl = (candidates) => {\n  for (const raw of candidates) {\n    const candidate = normalizeCanvaDesignViewUrl(String(raw || '').trim());\n    if (candidate) return candidate;\n  }\n  return '';\n};`,
  'normalizar candidatos extraídos'
);

next = replaceOnce(
  next,
  `  const absolute = decoded.match(/https:\\/\\/(?:www\\.)?canva\\.com\\/design\\/[^\\s\"'<>]+\\/view(?:\\?[^\\s\"'<>]*)?/gi) || [];`,
  `  const absolute = decoded.match(/https:\\/\\/(?:www\\.)?canva\\.com\\/design\\/[^\\s\"'<>]+\\/(?:view|edit)(?:\\?[^\\s\"'<>]*)?/gi) || [];`,
  'detectar destinos absolutos /view o /edit'
);

next = replaceOnce(
  next,
  `  const relative = decoded.match(/\\/design\\/[^\\s\"'<>]+\\/view(?:\\?[^\\s\"'<>]*)?/gi) || [];`,
  `  const relative = decoded.match(/\\/design\\/[^\\s\"'<>]+\\/(?:view|edit)(?:\\?[^\\s\"'<>]*)?/gi) || [];`,
  'detectar destinos relativos /view o /edit'
);

next = replaceOnce(
  next,
  `  const encoded = decoded.match(/https%3a%2f%2f(?:www\\.)?canva\\.com%2fdesign%2f[^\\s\"'<>]+%2fview[^\\s\"'<>]*/gi) || [];`,
  `  const encoded = decoded.match(/https%3a%2f%2f(?:www\\.)?canva\\.com%2fdesign%2f[^\\s\"'<>]+%2f(?:view|edit)[^\\s\"'<>]*/gi) || [];`,
  'detectar destinos codificados /view o /edit'
);

next = replaceOnce(
  next,
  `      const candidate = decodeURIComponent(item);\n      if (isCanvaDesignView(candidate)) return candidate;`,
  `      const candidate = normalizeCanvaDesignViewUrl(decodeURIComponent(item));\n      if (candidate) return candidate;`,
  'normalizar destino codificado'
);

next = replaceOnce(
  next,
  `    if (isCanvaDesignView(current.toString())) return current.toString();`,
  `    const normalizedCurrent = normalizeCanvaDesignViewUrl(current.toString());\n    if (normalizedCurrent) return normalizedCurrent;`,
  'aceptar redirección directa a /edit'
);

const required = [
  `url.pathname.endsWith('/edit')`,
  `url.pathname.slice(0, -5) + '/view'`,
  `/(?:view|edit)`,
  `const normalizedCurrent = normalizeCanvaDesignViewUrl(current.toString());`,
];
for (const marker of required) {
  if (!next.includes(marker)) throw new Error(`Validación interna falló: ${marker}`);
}

try {
  fs.writeFileSync(resolverPath, next, 'utf8');
  const check = spawnSync(process.execPath, ['--check', resolverPath], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(check.stderr || 'El resolver no pasó node --check.');
  console.log('Fix Canva v7 aplicado: canva.link /edit se normaliza a /view; node --check OK.');
} catch (error) {
  fs.writeFileSync(resolverPath, previous, 'utf8');
  throw error;
}
