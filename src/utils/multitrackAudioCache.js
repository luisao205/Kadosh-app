const CACHE_NAME = 'kadosh-multitrack-audio-v1';

const canUseCacheStorage = () => (
  typeof globalThis !== 'undefined'
  && 'caches' in globalThis
  && typeof globalThis.caches?.open === 'function'
);

const createRequest = (url) => new Request(url, {
  method: 'GET',
  mode: 'cors',
  credentials: 'same-origin',
});

const getSongEntries = (song) => {
  if (Array.isArray(song?.multitracks) && song.multitracks.length > 0) {
    return song.multitracks
      .filter((track) => track?.url)
      .map((track, index) => ({
        url: track.url,
        label: track.nombre || track.name || `Track ${index + 1}`,
        songTitle: song.titulo || 'Canción',
      }));
  }

  if (song?.audioUrl) {
    return [{ url: song.audioUrl, label: 'Audio principal', songTitle: song.titulo || 'Canción' }];
  }

  return [];
};

const getUniqueEntries = (songs) => {
  const byUrl = new Map();
  songs.forEach((song) => {
    getSongEntries(song).forEach((entry) => {
      if (!byUrl.has(entry.url)) byUrl.set(entry.url, entry);
    });
  });
  return [...byUrl.values()];
};

export const isMultitrackCacheSupported = () => canUseCacheStorage();

export const fetchMultitrackAudio = async (url) => {
  const request = createRequest(url);
  let cache = null;

  if (canUseCacheStorage()) {
    try {
      cache = await globalThis.caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        return { response: cached, cached: true };
      }
    } catch {
      cache = null;
    }
  }

  const response = await fetch(request);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  if (cache) {
    cache.put(request, response.clone()).catch(() => {
      // Si el dispositivo no tiene cuota suficiente, la reproducción continúa desde red.
    });
  }

  return { response, cached: false };
};

const prepareEntry = async (entry, cache) => {
  const request = createRequest(entry.url);
  const cached = await cache.match(request);
  if (cached) return { status: 'cached', entry };

  const response = await fetch(request);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await cache.put(request, response);
  return { status: 'downloaded', entry };
};

export const getMultitrackSetlistReadiness = async (songs) => {
  const list = Array.isArray(songs) ? songs : [];

  if (!canUseCacheStorage()) {
    return {
      supported: false,
      totalSongs: list.length,
      songsWithAudio: list.filter((song) => getSongEntries(song).length > 0).length,
      readySongs: 0,
      partialSongs: 0,
      pendingSongs: 0,
      noAudioSongs: list.filter((song) => getSongEntries(song).length === 0).length,
      totalAudio: 0,
      cachedAudio: 0,
      pendingAudio: 0,
      songs: [],
    };
  }

  const cache = await globalThis.caches.open(CACHE_NAME);
  const songStatuses = await Promise.all(list.map(async (song, index) => {
    const entries = getSongEntries(song);
    const key = String(song?.setlistItemId || song?.id || `song-${index}`);

    if (entries.length === 0) {
      return {
        key,
        songId: song?.id || null,
        title: song?.titulo || `Canción ${index + 1}`,
        total: 0,
        cached: 0,
        pending: 0,
        status: 'no-audio',
      };
    }

    const matches = await Promise.all(entries.map(async (entry) => {
      try {
        return Boolean(await cache.match(createRequest(entry.url)));
      } catch {
        return false;
      }
    }));
    const cached = matches.filter(Boolean).length;
    const total = entries.length;
    const pending = Math.max(0, total - cached);

    return {
      key,
      songId: song?.id || null,
      title: song?.titulo || `Canción ${index + 1}`,
      total,
      cached,
      pending,
      status: cached === total ? 'ready' : cached > 0 ? 'partial' : 'pending',
    };
  }));

  const withAudio = songStatuses.filter((song) => song.total > 0);
  const totalAudio = withAudio.reduce((sum, song) => sum + song.total, 0);
  const cachedAudio = withAudio.reduce((sum, song) => sum + song.cached, 0);

  return {
    supported: true,
    totalSongs: songStatuses.length,
    songsWithAudio: withAudio.length,
    readySongs: songStatuses.filter((song) => song.status === 'ready').length,
    partialSongs: songStatuses.filter((song) => song.status === 'partial').length,
    pendingSongs: songStatuses.filter((song) => song.status === 'pending').length,
    noAudioSongs: songStatuses.filter((song) => song.status === 'no-audio').length,
    totalAudio,
    cachedAudio,
    pendingAudio: Math.max(0, totalAudio - cachedAudio),
    songs: songStatuses,
  };
};

export const prepareMultitrackSetlist = async (songs, onProgress, options = {}) => {
  if (!canUseCacheStorage()) {
    throw new Error('Este dispositivo no ofrece almacenamiento de audio compatible para preparar el setlist.');
  }

  const entries = getUniqueEntries(Array.isArray(songs) ? songs : []);
  const total = entries.length;
  const cache = await globalThis.caches.open(CACHE_NAME);
  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 3, 4));
  let cursor = 0;
  let completed = 0;
  let cached = 0;
  let downloaded = 0;
  const errors = [];

  onProgress?.({ completed, total, cached, downloaded, errors: 0 });

  const worker = async () => {
    while (cursor < entries.length) {
      const index = cursor;
      cursor += 1;
      const entry = entries[index];

      try {
        const result = await prepareEntry(entry, cache);
        if (result.status === 'cached') cached += 1;
        else downloaded += 1;
      } catch (error) {
        errors.push({
          ...entry,
          message: error?.message || 'No se pudo preparar el audio',
        });
      } finally {
        completed += 1;
        onProgress?.({ completed, total, cached, downloaded, errors: errors.length });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, total)) }, () => worker()));

  return {
    total,
    cached,
    downloaded,
    errors,
    ready: Math.max(0, total - errors.length),
  };
};

export const clearMultitrackAudioCache = async () => {
  if (!canUseCacheStorage()) return false;
  return globalThis.caches.delete(CACHE_NAME);
};
