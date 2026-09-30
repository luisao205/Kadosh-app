const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getStemId = (track, index) => String(track?.id || `stem-${index}`);
const getStemName = (track, index) => String(track?.nombre || track?.name || `Track ${index + 1}`);

const getMediaErrorMessage = (audio) => {
  const code = audio?.error?.code;
  if (code === 1) return 'Carga cancelada';
  if (code === 2) return 'Error de red al cargar el audio';
  if (code === 3) return 'No se pudo decodificar el audio';
  if (code === 4) return 'Formato de audio no compatible';
  return 'No se pudo cargar el audio';
};

const waitForMetadata = (audio, timeoutMs = 15000) => new Promise((resolve, reject) => {
  if (audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 0) {
    resolve();
    return;
  }

  let timer = null;
  const cleanup = () => {
    if (timer) window.clearTimeout(timer);
    audio.removeEventListener('loadedmetadata', onLoaded);
    audio.removeEventListener('error', onError);
  };
  const onLoaded = () => {
    cleanup();
    resolve();
  };
  const onError = () => {
    cleanup();
    reject(new Error(getMediaErrorMessage(audio)));
  };

  audio.addEventListener('loadedmetadata', onLoaded);
  audio.addEventListener('error', onError);
  timer = window.setTimeout(() => {
    cleanup();
    reject(new Error('Tiempo de espera agotado al preparar el audio'));
  }, timeoutMs);
});

export class MultitrackPlaybackEngine {
  constructor() {
    this.stems = [];
    this.duration = 0;
    this.offset = 0;
    this.playing = false;
    this.masterVolume = 1;
    this.masterStemId = null;
    this.loadToken = 0;
    this.syncTimer = null;
  }

  getTrackCandidates(song) {
    if (Array.isArray(song?.multitracks) && song.multitracks.length > 0) {
      return song.multitracks
        .filter((track) => track?.url)
        .map((track, index) => ({
          id: getStemId(track, index),
          name: getStemName(track, index),
          url: track.url,
        }));
    }

    if (song?.audioUrl) {
      return [{ id: 'main', name: 'Audio principal', url: song.audioUrl }];
    }

    return [];
  }

  releaseStems() {
    this.stopSyncTimer();
    this.stems.forEach((stem) => {
      const audio = stem.audio;
      try { audio.pause(); } catch {}
      try {
        audio.removeAttribute('src');
        audio.load();
      } catch {}
    });
    this.stems = [];
    this.masterStemId = null;
  }

  async loadSong(song, onProgress) {
    const token = ++this.loadToken;
    this.stop();
    this.releaseStems();
    this.duration = 0;
    this.offset = 0;

    const candidates = this.getTrackCandidates(song);
    if (candidates.length === 0) {
      throw new Error('Esta canción no tiene multitracks ni audio principal.');
    }

    let completed = 0;
    const results = await Promise.all(candidates.map(async (candidate) => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = candidate.url;
      audio.playsInline = true;

      try {
        audio.load();
        await waitForMetadata(audio);
        return {
          candidate,
          audio,
          duration: Number.isFinite(audio.duration) ? audio.duration : 0,
          error: null,
        };
      } catch (error) {
        try {
          audio.removeAttribute('src');
          audio.load();
        } catch {}
        return { candidate, audio: null, duration: 0, error };
      } finally {
        completed += 1;
        onProgress?.({ completed, total: candidates.length });
      }
    }));

    if (token !== this.loadToken) {
      results.forEach((item) => {
        if (!item.audio) return;
        try { item.audio.pause(); } catch {}
        try {
          item.audio.removeAttribute('src');
          item.audio.load();
        } catch {}
      });
      return { cancelled: true, stems: [], errors: [] };
    }

    const loaded = results.filter((item) => item.audio);
    const errors = results
      .filter((item) => !item.audio)
      .map((item) => ({
        id: item.candidate.id,
        name: item.candidate.name,
        message: item.error?.message || 'No se pudo cargar el audio',
      }));

    if (loaded.length === 0) {
      throw new Error('No se pudo preparar ningún track de esta canción.');
    }

    this.stems = loaded.map(({ candidate, audio, duration }) => ({
      id: candidate.id,
      name: candidate.name,
      url: candidate.url,
      audio,
      duration,
      volume: 1,
      muted: false,
      solo: false,
    }));

    const masterStem = this.stems.reduce((best, stem) => (
      !best || stem.duration > best.duration ? stem : best
    ), null);
    this.masterStemId = masterStem?.id || this.stems[0]?.id || null;
    this.duration = Math.max(...this.stems.map((stem) => stem.duration || 0));
    this.applyMixerState();

    return {
      cancelled: false,
      stems: this.getStemState(),
      duration: this.duration,
      errors,
    };
  }

  getMasterStem() {
    return this.stems.find((stem) => stem.id === this.masterStemId) || this.stems[0] || null;
  }

  async play() {
    if (this.playing || this.stems.length === 0) return;

    if (this.offset >= this.duration - 0.05) this.offset = 0;
    const safeOffset = clamp(this.offset, 0, Math.max(0, this.duration - 0.01));

    const active = this.stems.filter((stem) => safeOffset < Math.max(0, stem.duration - 0.01));
    active.forEach((stem) => {
      try {
        stem.audio.pause();
        stem.audio.currentTime = Math.min(safeOffset, Math.max(0, stem.duration - 0.01));
      } catch {}
    });

    this.applyMixerState();
    const results = await Promise.allSettled(active.map((stem) => stem.audio.play()));
    const started = results.some((result) => result.status === 'fulfilled');
    this.playing = started;

    if (started) {
      this.offset = this.getCurrentTime();
      this.startSyncTimer();
      window.setTimeout(() => this.correctDrift(true), 140);
    }
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.getCurrentTime();
    this.stems.forEach((stem) => {
      try { stem.audio.pause(); } catch {}
    });
    this.playing = false;
    this.stopSyncTimer();
  }

  stop() {
    this.stopSyncTimer();
    this.stems.forEach((stem) => {
      try {
        stem.audio.pause();
        if (stem.audio.readyState >= 1) stem.audio.currentTime = 0;
      } catch {}
    });
    this.playing = false;
    this.offset = 0;
  }

  async seek(seconds) {
    const next = clamp(Number(seconds) || 0, 0, this.duration || 0);
    this.offset = next;
    this.stems.forEach((stem) => {
      try {
        stem.audio.currentTime = Math.min(next, Math.max(0, stem.duration - 0.01));
      } catch {}
    });
    if (this.playing) this.correctDrift(true);
  }

  getCurrentTime() {
    const master = this.getMasterStem();
    if (this.playing && master?.audio && Number.isFinite(master.audio.currentTime)) {
      return clamp(master.audio.currentTime, 0, this.duration || 0);
    }
    return clamp(this.offset, 0, this.duration || 0);
  }

  isFinished() {
    if (!this.playing || this.duration <= 0) return false;
    const master = this.getMasterStem();
    return Boolean(master?.audio?.ended) || this.getCurrentTime() >= this.duration - 0.05;
  }

  startSyncTimer() {
    this.stopSyncTimer();
    this.syncTimer = window.setInterval(() => this.correctDrift(false), 400);
  }

  stopSyncTimer() {
    if (!this.syncTimer) return;
    window.clearInterval(this.syncTimer);
    this.syncTimer = null;
  }

  correctDrift(force = false) {
    if (!this.playing) return;
    const master = this.getMasterStem();
    if (!master?.audio || master.audio.paused || !Number.isFinite(master.audio.currentTime)) return;

    const masterTime = master.audio.currentTime;
    this.stems.forEach((stem) => {
      if (stem.id === master.id || !stem.audio || stem.audio.ended) return;
      const drift = Math.abs((stem.audio.currentTime || 0) - masterTime);
      if ((force && drift > 0.025) || (!force && drift > 0.08)) {
        try {
          stem.audio.currentTime = Math.min(masterTime, Math.max(0, stem.duration - 0.01));
        } catch {}
      }
      if (stem.audio.paused && masterTime < stem.duration - 0.05) {
        stem.audio.play().catch(() => {});
      }
    });
  }

  setStemVolume(stemId, volume) {
    const stem = this.stems.find((item) => item.id === stemId);
    if (!stem) return;
    stem.volume = clamp(Number(volume) || 0, 0, 1);
    this.applyMixerState();
  }

  toggleStemMute(stemId) {
    const stem = this.stems.find((item) => item.id === stemId);
    if (!stem) return;
    stem.muted = !stem.muted;
    this.applyMixerState();
  }

  toggleStemSolo(stemId) {
    const stem = this.stems.find((item) => item.id === stemId);
    if (!stem) return;
    stem.solo = !stem.solo;
    this.applyMixerState();
  }

  setMasterVolume(volume) {
    this.masterVolume = clamp(Number(volume) || 0, 0, 1);
    this.applyMixerState();
  }

  applyMixerState() {
    const hasSolo = this.stems.some((stem) => stem.solo);
    this.stems.forEach((stem) => {
      const audible = !stem.muted && (!hasSolo || stem.solo);
      stem.audio.muted = !audible;
      stem.audio.volume = clamp(stem.volume * this.masterVolume, 0, 1);
    });
  }

  getStemState() {
    return this.stems.map((stem) => ({
      id: stem.id,
      name: stem.name,
      volume: stem.volume,
      muted: stem.muted,
      solo: stem.solo,
      duration: stem.duration,
    }));
  }

  getState() {
    return {
      playing: this.playing,
      currentTime: this.getCurrentTime(),
      duration: this.duration,
      masterVolume: this.masterVolume,
      stems: this.getStemState(),
    };
  }

  async dispose() {
    ++this.loadToken;
    this.stop();
    this.releaseStems();
    this.duration = 0;
    this.offset = 0;
  }
}

export default MultitrackPlaybackEngine;
