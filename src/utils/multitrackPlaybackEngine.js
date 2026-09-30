import { fetchMultitrackAudio } from './multitrackAudioCache';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getAudioContextClass = () => {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
};

const getStemId = (track, index) => String(track?.id || track?.nombre || `stem-${index}`);

const getStemName = (track, index) => String(track?.nombre || track?.name || `Track ${index + 1}`);

export class MultitrackPlaybackEngine {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.stems = [];
    this.sources = new Map();
    this.offset = 0;
    this.startedAt = 0;
    this.playing = false;
    this.duration = 0;
    this.masterVolume = 1;
    this.loadToken = 0;
    this.loop = null;
  }

  async ensureContext() {
    if (this.context) return this.context;
    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) throw new Error('Este dispositivo no soporta Web Audio API.');

    this.context = new AudioContextClass();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  getTrackCandidates(song) {
    if (Array.isArray(song?.multitracks) && song.multitracks.length > 0) {
      return song.multitracks
        .filter((track) => track?.url)
        .map((track, index) => ({
          id: getStemId(track, index),
          name: getStemName(track, index),
          url: track.url,
          source: track,
        }));
    }

    if (song?.audioUrl) {
      return [{ id: 'main', name: 'Audio principal', url: song.audioUrl, source: null }];
    }

    return [];
  }

  async loadSong(song, onProgress) {
    const token = ++this.loadToken;
    const loadStartedAt = Date.now();
    this.stop();
    this.stems = [];
    this.duration = 0;
    this.offset = 0;

    const context = await this.ensureContext();
    const candidates = this.getTrackCandidates(song);
    if (candidates.length === 0) {
      throw new Error('Esta canción no tiene multitracks ni audio principal.');
    }

    let completed = 0;
    let cacheHits = 0;
    const results = await Promise.all(candidates.map(async (candidate) => {
      try {
        const { response, cached } = await fetchMultitrackAudio(candidate.url);
        if (cached) cacheHits += 1;
        const bytes = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(bytes.slice(0));
        return { candidate, buffer, error: null, cached };
      } catch (error) {
        return { candidate, buffer: null, error, cached: false };
      } finally {
        completed += 1;
        onProgress?.({ completed, total: candidates.length, cacheHits });
      }
    }));

    if (token !== this.loadToken) return { cancelled: true, stems: [], errors: [] };

    const loaded = results.filter((item) => item.buffer);
    const errors = results
      .filter((item) => !item.buffer)
      .map((item) => ({
        id: item.candidate.id,
        name: item.candidate.name,
        message: item.error?.message || 'No se pudo cargar el audio',
      }));

    if (loaded.length === 0) {
      throw new Error('No se pudo cargar ningún track de esta canción.');
    }

    this.stems = loaded.map(({ candidate, buffer }) => {
      const gainNode = context.createGain();
      gainNode.gain.value = 1;
      gainNode.connect(this.masterGain);
      return {
        id: candidate.id,
        name: candidate.name,
        url: candidate.url,
        buffer,
        gainNode,
        volume: 1,
        muted: false,
        solo: false,
      };
    });

    this.duration = Math.max(...this.stems.map((stem) => stem.buffer.duration));
    this.applyMixerState();

    return {
      cancelled: false,
      stems: this.getStemState(),
      duration: this.duration,
      errors,
      cacheHits,
      loadMs: Date.now() - loadStartedAt,
    };
  }

  getShortestStemDuration() {
    if (this.stems.length === 0) return 0;
    return Math.min(...this.stems.map((stem) => stem.buffer.duration));
  }

  applyLoopToSource(source) {
    if (!this.loop || this.loop.exitRequested) return;
    source.loopStart = this.loop.start;
    source.loopEnd = this.loop.end;
    source.loop = true;
  }

  createSources(offset) {
    const when = this.context.currentTime + 0.035;
    const safeOffset = clamp(offset, 0, Math.max(0, this.duration - 0.01));

    this.sources.clear();
    this.stems.forEach((stem) => {
      if (safeOffset >= stem.buffer.duration) return;
      const source = this.context.createBufferSource();
      source.buffer = stem.buffer;
      source.connect(stem.gainNode);
      this.applyLoopToSource(source);
      source.start(when, safeOffset);
      this.sources.set(stem.id, source);
    });

    this.startedAt = when;
    this.offset = safeOffset;
  }

  async play() {
    if (this.playing || this.stems.length === 0) return;
    await this.ensureContext();
    if (this.context.state === 'suspended') await this.context.resume();

    if (this.offset >= this.duration - 0.01) this.offset = 0;
    this.createSources(this.offset);
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.getCurrentTime();
    if (this.loop?.exitRequested) this.loop = null;
    this.stopSources();
    this.playing = false;
    this.startedAt = 0;
  }

  stop() {
    this.stopSources();
    this.playing = false;
    this.offset = 0;
    this.startedAt = 0;
    this.loop = null;
  }

  stopSources() {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // El source puede haber finalizado por sí mismo.
      }
      try {
        source.disconnect();
      } catch {
        // Nada que limpiar.
      }
    });
    this.sources.clear();
  }

  clearLoopForSeek() {
    this.sources.forEach((source) => {
      source.loop = false;
    });
    this.loop = null;
  }

  async seek(seconds) {
    const next = clamp(Number(seconds) || 0, 0, this.duration || 0);
    const wasPlaying = this.playing;
    this.clearLoopForSeek();
    if (wasPlaying) this.stopSources();
    this.offset = next;
    this.startedAt = 0;
    if (wasPlaying) this.createSources(next);
  }

  setLoopRegion(startSeconds, endSeconds, metadata = {}) {
    if (this.stems.length === 0) throw new Error('No hay stems cargados para crear el loop.');

    const start = Number(startSeconds);
    const end = Number(endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start + 0.02) {
      throw new Error('El rango del loop no es válido.');
    }

    const shortestDuration = this.getShortestStemDuration();
    if (end > shortestDuration - 0.005) {
      throw new Error('Ese loop llega más allá del stem más corto. Elige un bloque anterior.');
    }

    const current = this.getCurrentTime();
    if (current >= end - 0.01) {
      throw new Error('El punto actual ya pasó el final de ese loop.');
    }

    this.loop = {
      start,
      end,
      bars: Math.max(1, Math.round(Number(metadata.bars) || 1)),
      exitRequested: false,
      exitRequestedAtContextTime: 0,
      exitAtContextTime: 0,
      exitFromTime: 0,
    };

    this.sources.forEach((source) => {
      source.loopStart = start;
      source.loopEnd = end;
      source.loop = true;
    });

    return this.getState();
  }

  cancelLoop() {
    if (!this.loop) return this.getState();

    const current = this.getCurrentTime();
    this.sources.forEach((source) => {
      source.loop = false;
    });

    if (this.playing && this.context) {
      this.offset = current;
      this.startedAt = this.context.currentTime;
    }

    this.loop = null;
    return this.getState();
  }

  requestLoopExit() {
    if (!this.loop) return this.getState();

    const current = this.getCurrentTime();
    if (!this.loop) return this.getState();

    if (!this.playing || !this.context || current < this.loop.start - 0.005) {
      return this.cancelLoop();
    }

    this.sources.forEach((source) => {
      source.loop = false;
    });

    const anchor = Math.max(this.context.currentTime, this.startedAt || 0);
    const remaining = Math.max(0, this.loop.end - current);
    this.loop = {
      ...this.loop,
      exitRequested: true,
      exitRequestedAtContextTime: anchor,
      exitAtContextTime: anchor + remaining,
      exitFromTime: current,
    };

    return this.getState();
  }

  finalizeLoopExitIfNeeded() {
    if (!this.loop?.exitRequested || !this.playing || !this.context) return false;
    if (this.context.currentTime < this.loop.exitAtContextTime) return false;

    const loopEnd = this.loop.end;
    const exitAt = this.loop.exitAtContextTime;
    this.offset = loopEnd;
    this.startedAt = exitAt;
    this.loop = null;
    return true;
  }

  getCurrentTime() {
    if (!this.playing || !this.context) return clamp(this.offset, 0, this.duration || 0);

    if (this.finalizeLoopExitIfNeeded()) {
      const elapsedAfterExit = Math.max(0, this.context.currentTime - this.startedAt);
      return clamp(this.offset + elapsedAfterExit, 0, this.duration || 0);
    }

    if (this.loop?.exitRequested) {
      const elapsedSinceExitRequest = Math.max(0, this.context.currentTime - this.loop.exitRequestedAtContextTime);
      return clamp(this.loop.exitFromTime + elapsedSinceExitRequest, 0, this.duration || 0);
    }

    const elapsed = Math.max(0, this.context.currentTime - this.startedAt);
    const rawTime = this.offset + elapsed;

    if (this.loop && rawTime >= this.loop.end) {
      const loopLength = this.loop.end - this.loop.start;
      return clamp(this.loop.start + ((rawTime - this.loop.start) % loopLength), 0, this.duration || 0);
    }

    return clamp(rawTime, 0, this.duration || 0);
  }

  isFinished() {
    if (this.loop && !this.loop.exitRequested) return false;
    return this.playing && this.duration > 0 && this.getCurrentTime() >= this.duration - 0.03;
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
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
  }

  applyMixerState() {
    const hasSolo = this.stems.some((stem) => stem.solo);
    this.stems.forEach((stem) => {
      const audible = !stem.muted && (!hasSolo || stem.solo);
      stem.gainNode.gain.value = audible ? stem.volume : 0;
    });
  }

  getStemState() {
    return this.stems.map((stem) => ({
      id: stem.id,
      name: stem.name,
      volume: stem.volume,
      muted: stem.muted,
      solo: stem.solo,
      duration: stem.buffer.duration,
    }));
  }

  getLoopState(currentTime) {
    if (!this.loop) return null;
    return {
      active: true,
      start: this.loop.start,
      end: this.loop.end,
      bars: this.loop.bars,
      exitRequested: this.loop.exitRequested,
      phase: this.loop.exitRequested
        ? 'exiting'
        : currentTime < this.loop.start
          ? 'armed'
          : 'active',
    };
  }

  getState() {
    const currentTime = this.getCurrentTime();
    return {
      playing: this.playing,
      currentTime,
      duration: this.duration,
      shortestStemDuration: this.getShortestStemDuration(),
      masterVolume: this.masterVolume,
      stems: this.getStemState(),
      loop: this.getLoopState(currentTime),
    };
  }

  async dispose() {
    ++this.loadToken;
    this.stop();
    this.stems.forEach((stem) => {
      try {
        stem.gainNode.disconnect();
      } catch {
        // Nada que limpiar.
      }
    });
    this.stems = [];

    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // Nada que limpiar.
      }
    }

    if (this.context && this.context.state !== 'closed') {
      await this.context.close().catch(() => {});
    }
    this.context = null;
    this.masterGain = null;
  }
}

export default MultitrackPlaybackEngine;
