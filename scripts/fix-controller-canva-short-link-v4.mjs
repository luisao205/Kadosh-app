import fs from 'node:fs';

const resolverPath = 'functions/canvaLinkResolver.js';

if (!fs.existsSync(resolverPath)) {
  throw new Error('No existe functions/canvaLinkResolver.js. Aplica primero Canva v3.');
}

const current = fs.readFileSync(resolverPath, 'utf8');
if (!current.includes('resolveRedirectChain') || !current.includes("input.hostname.toLowerCase() !== 'canva.link'")) {
  throw new Error('El resolver local no coincide con Canva v3; no se modificó ningún archivo.');
}

const resolver = `/* global module */

const allowedCanvaHost = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  return host === 'canva.link' || host === 'canva.com' || host.endsWith('.canva.com');
};

const isCanvaDesignView = (value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (host === 'canva.com' || host.endsWith('.canva.com'))
      && url.pathname.includes('/design/')
      && url.pathname.includes('/view');
  } catch {
    return false;
  }
};

const toEmbedUrl = (value) => {
  if (!isCanvaDesignView(value)) return '';
  const url = new URL(value);
  url.hash = '';
  url.search = '?embed';
  return url.toString();
};

const decodeHtmlPayload = (value) => String(value || '')
  .replace(/\\u002f/gi, '/')
  .replace(/\\u0026/gi, '&')
  .replace(/\\\//g, '/')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#x2f;/gi, '/');

const firstValidDesignUrl = (candidates) => {
  for (const raw of candidates) {
    const candidate = String(raw || '').trim();
    if (isCanvaDesignView(candidate)) return candidate;
  }
  return '';
};

const extractDesignUrlFromHtml = (html) => {
  const decoded = decodeHtmlPayload(html).slice(0, 1_500_000);
  const absolute = decoded.match(/https:\/\/(?:www\.)?canva\.com\/design\/[^\s"'<>]+\/view(?:\?[^\s"'<>]*)?/gi) || [];
  const direct = firstValidDesignUrl(absolute);
  if (direct) return direct;

  const relative = decoded.match(/\/design\/[^\s"'<>]+\/view(?:\?[^\s"'<>]*)?/gi) || [];
  const relativeCandidates = relative.map((path) => \`https://www.canva.com\${path}\`);
  const relativeDirect = firstValidDesignUrl(relativeCandidates);
  if (relativeDirect) return relativeDirect;

  const encoded = decoded.match(/https%3a%2f%2f(?:www\.)?canva\.com%2fdesign%2f[^\s"'<>]+%2fview[^\s"'<>]*/gi) || [];
  for (const item of encoded) {
    try {
      const candidate = decodeURIComponent(item);
      if (isCanvaDesignView(candidate)) return candidate;
    } catch {}
  }

  return '';
};

const fetchCanvaPage = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

const resolveCanvaShortLink = async (initialUrl) => {
  let current = new URL(initialUrl);

  for (let hop = 0; hop < 8; hop += 1) {
    if (!allowedCanvaHost(current.hostname)) {
      throw new Error('Dominio de redirección no permitido.');
    }

    if (isCanvaDesignView(current.toString())) return current.toString();

    const response = await fetchCanvaPage(current.toString());
    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400 && location) {
      try { await response.body?.cancel(); } catch {}
      const next = new URL(location, current);
      if (!allowedCanvaHost(next.hostname)) {
        throw new Error('Canva redirigió fuera de sus dominios.');
      }
      current = next;
      continue;
    }

    const html = await response.text();
    const extracted = extractDesignUrlFromHtml(html);
    if (extracted) return extracted;

    // Algunos enlaces cortos devuelven 200 con un destino indicado por headers auxiliares.
    const refresh = response.headers.get('refresh') || '';
    const refreshMatch = refresh.match(/url\s*=\s*(.+)$/i);
    if (refreshMatch?.[1]) {
      const next = new URL(refreshMatch[1].trim().replace(/^['"]|['"]$/g, ''), current);
      if (!allowedCanvaHost(next.hostname)) {
        throw new Error('Canva redirigió fuera de sus dominios.');
      }
      current = next;
      continue;
    }

    break;
  }

  throw new Error('El enlace corto no expuso una vista pública de diseño Canva.');
};

module.exports = ({ functions }) => functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const raw = String(data?.url || '').trim();
  if (!raw || raw.length > 2048) {
    throw new functions.https.HttpsError('invalid-argument', 'Enlace de Canva inválido.');
  }

  let input;
  try {
    input = new URL(raw);
  } catch {
    throw new functions.https.HttpsError('invalid-argument', 'Enlace de Canva inválido.');
  }

  if (input.hostname.toLowerCase() !== 'canva.link') {
    throw new functions.https.HttpsError('invalid-argument', 'Solo se resuelven enlaces cortos canva.link.');
  }

  try {
    const sourceUrl = await resolveCanvaShortLink(input.toString());
    const embedUrl = toEmbedUrl(sourceUrl);
    if (!embedUrl) throw new Error('El destino no es una vista pública incrustable de Canva.');
    return { sourceUrl, embedUrl };
  } catch (error) {
    console.error('Error resolviendo canva.link:', error);
    throw new functions.https.HttpsError(
      'failed-precondition',
      'No se pudo convertir este enlace corto de Canva a una presentación incrustable.'
    );
  }
});
`;

const required = [
  'extractDesignUrlFromHtml',
  'response.headers.get(\'refresh\')',
  'Mozilla/5.0',
  'resolveCanvaShortLink',
  "input.hostname.toLowerCase() !== 'canva.link'",
];
for (const marker of required) {
  if (!resolver.includes(marker)) throw new Error(`Validación interna falló: ${marker}`);
}

fs.writeFileSync(resolverPath, resolver, 'utf8');
console.log('Fix Canva v4 aplicado: canva.link admite redirección HTTP y página intermedia de Canva.');
