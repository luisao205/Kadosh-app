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

  createSources(offset) {
    const when = this.context.currentTime + 0.035;
    const safeOffset = clamp(offset, 0, Math.max(0, this.duration - 0.01));

    this.sources.clear();
    this.stems.forEach((stem) => {
      if (safeOffset >= stem.buffer.duration) return;
      const source = this.context.createBufferSource();
      source.buffer = stem.buffer;
      source.connect(stem.gainNode);
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
    this.stopSources();
    this.playing = false;
  }

  stop() {
    this.stopSources();
    this.playing = false;
    this.offset = 0;
    this.startedAt = 0;
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

  async seek(seconds) {
    const next = clamp(Number(seconds) || 0, 0, this.duration || 0);
    const wasPlaying = this.playing;
    if (wasPlaying) this.stopSources();
    this.offset = next;
    this.startedAt = 0;
    if (wasPlaying) this.createSources(next);
  }

  getCurrentTime() {
    if (!this.playing || !this.context) return clamp(this.offset, 0, this.duration || 0);
    const elapsed = Math.max(0, this.context.currentTime - this.startedAt);
    return clamp(this.offset + elapsed, 0, this.duration || 0);
  }

  isFinished() {
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
