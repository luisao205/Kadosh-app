import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('Rules E2E requires a local Firestore Emulator.');
}
const testEnv = await initializeTestEnvironment({
  projectId: 'demo-kadosh-e2e',
  firestore: { rules }
});

const baseEvent = {
  projectorState: { type: 'lyrics', contentType: 'lyrics', media: null, background: null, backgroundMedia: null },
  proyectorSlide: null, proyectorMedia: null, proyectorLogo: false, proyectorApagado: false,
  proyectorFondo: null, proyectorFondoMedia: null, proyectorSongId: null, proyectorSlideIndex: -1,
  proyectorNextSlide: null, proyectorNextSong: null, proyectorOffset: 0,
  liveState: {}, currentSongId: null
};

const db = (uid) => testEnv.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();
const user = (uid) => doc(db(uid), 'usuarios', uid);

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, 'usuarios', 'owner'), { rol: 'dueno', nombre: 'Owner' }),
      setDoc(doc(firestore, 'usuarios', 'admin'), { rol: 'admin', nombre: 'Admin' }),
      setDoc(doc(firestore, 'usuarios', 'editor'), { rol: 'musico', nombre: 'Editor' }),
      setDoc(doc(firestore, 'usuarios', 'team-editor'), {
        rol: 'musico', nombre: 'Team editor', permissionOverrides: { 'team.edit': true }
      }),
      setDoc(doc(firestore, 'usuarios', 'bible'), { rol: 'admin', nombre: 'Bible' }),
      setDoc(doc(firestore, 'usuarios', 'quick'), {
        rol: 'musico', nombre: 'Quick', permissionOverrides: { 'bible.quickProjection': true }
      }),
      setDoc(doc(firestore, 'usuarios', 'media'), {
        rol: 'multimedia', nombre: 'Media',
        permissionOverrides: { 'multimedia.project': true, 'bible.project': false }
      }),
      setDoc(doc(firestore, 'usuarios', 'sermon'), {
        rol: 'multimedia', nombre: 'Sermon',
        permissionOverrides: { 'sermons.project': true, 'multimedia.project': false }
      }),
      setDoc(doc(firestore, 'usuarios', 'control-user'), {
        rol: 'musico', nombre: 'Control user',
        permissionOverrides: { 'multimedia.controlOutputs': true }
      }),
      setDoc(doc(firestore, 'usuarios', 'suspended-control'), {
        rol: 'multimedia', nombre: 'Suspended control', accountStatus: 'suspended'
      }),
      setDoc(doc(firestore, 'eventos', 'event-1'), baseEvent),
      setDoc(doc(firestore, 'eventos', 'event-2'), baseEvent),
      setDoc(doc(firestore, 'eventos', 'event-3'), baseEvent),
      setDoc(doc(firestore, 'eventos', 'event-4'), baseEvent),
      setDoc(doc(firestore, 'eventos', 'event-5'), baseEvent),
      setDoc(doc(firestore, 'eventos', 'legacy-projection'), {
        titulo: 'Evento legacy',
        projectorState: { type: 'resume', contentType: 'none', media: null },
        liveState: {}
      }),
      setDoc(doc(firestore, 'anuncios', 'announcement-1'), { titulo: 'Anuncio' }),
      setDoc(doc(firestore, 'canciones', 'active'), { titulo: 'Activa', archived: false }),
      setDoc(doc(firestore, 'canciones', 'formatted'), {
        titulo: 'Con formato', archived: false, letraRaw: '# Coro\nOriginal',
        lyricFormatting: { version: 1, sections: {} }
      }),
      setDoc(doc(firestore, 'canciones', 'archived'), { titulo: 'Archivada', archived: true })
    ]);
  });

  await assertSucceeds(setDoc(doc(db('admin'), 'usuarios', 'new-musician'), { rol: 'musico', nombre: 'Nuevo' }));
  await assertFails(setDoc(doc(db('admin'), 'usuarios', 'forged-owner'), { rol: 'dueno', nombre: 'No' }));
  await assertFails(setDoc(doc(db('editor'), 'usuarios', 'forged-owner-2'), { rol: 'dueno', nombre: 'No' }));
  await assertSucceeds(updateDoc(user('admin'), { telefono: '0999999999' }));
  await assertFails(updateDoc(user('admin'), { rol: 'dueno' }));
  await assertFails(updateDoc(user('admin'), { permissionOverrides: { 'songs.delete': true } }));
  await assertFails(updateDoc(user('admin'), { ownership: 'owner' }));
  await assertFails(deleteDoc(user('admin')));
  await assertSucceeds(updateDoc(user('team-editor'), { telefono: '0999999999' }));
  await assertFails(updateDoc(user('team-editor'), { permissionOverrides: { 'team.managePermissions': true } }));

  await assertFails(updateDoc(doc(db('editor'), 'canciones', 'active'), { titulo: 'Bypass' }));
  await assertFails(deleteDoc(doc(db('admin'), 'canciones', 'active')));
  await assertSucceeds(deleteDoc(doc(db('admin'), 'canciones', 'archived')));

  await assertFails(setDoc(doc(db('owner'), 'sistema', 'permissionRoles'), { roleDefaults: {} }));
  await assertFails(setDoc(doc(db('owner'), 'usuarios', 'editor', 'permissionAudit', 'forged'), { actorUid: 'other' }));

  // KADOSH Music AI security rules
  await assertFails(updateDoc(user('editor'), { musicAIAccess: { authorized: true } }));
  await assertFails(updateDoc(user('admin'), { musicAIAccess: { authorized: true } }));
  await assertFails(updateDoc(doc(db('admin'), 'usuarios', 'editor'), { musicAIAccess: { authorized: true } }));
  await assertFails(updateDoc(doc(db('team-editor'), 'usuarios', 'editor'), { musicAIAccess: { authorized: true } }));
  await assertFails(setDoc(doc(db('admin'), 'usuarios', 'forged-music-ai'), {
    rol: 'musico', nombre: 'Forged', musicAIAccess: { authorized: true }
  }));
  await assertSucceeds(updateDoc(user('editor'), { telefono: '0987654321', preferencias: { notacion: 'C' } }));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'usuarios', 'editor', 'musicAIAudit', 'audit-1'), {
      actorUid: 'owner', targetUid: 'editor', authorized: true
    });
  });
  await assertSucceeds(getDoc(doc(db('owner'), 'usuarios', 'editor', 'musicAIAudit', 'audit-1')));
  await assertFails(getDoc(doc(db('admin'), 'usuarios', 'editor', 'musicAIAudit', 'audit-1')));
  await assertFails(getDoc(doc(db('editor'), 'usuarios', 'editor', 'musicAIAudit', 'audit-1')));
  await assertFails(setDoc(doc(db('owner'), 'usuarios', 'editor', 'musicAIAudit', 'forged'), { authorized: true }));
  await assertFails(updateDoc(doc(db('owner'), 'usuarios', 'editor', 'musicAIAudit', 'audit-1'), { authorized: false }));

  // Private per-user official chat favorites under usuarios/{uid}/notas
  const editorFavRef = doc(db('editor'), 'usuarios', 'editor', 'notas', 'music_ai_official_chats');
  await assertSucceeds(setDoc(editorFavRef, { ownerUid: 'editor', kind: 'music_ai_official_chats', favorites: [] }));
  await assertSucceeds(getDoc(editorFavRef));
  await assertFails(getDoc(doc(db('admin'), 'usuarios', 'editor', 'notas', 'music_ai_official_chats')));
  await assertFails(getDoc(doc(db('owner'), 'usuarios', 'editor', 'notas', 'music_ai_official_chats')));
  await assertFails(setDoc(doc(db('admin'), 'usuarios', 'editor', 'notas', 'music_ai_official_chats'), { favorites: [] }));

  const bibleState = {
    type: 'preaching', contentType: 'bible', preachingType: 'bible', title: 'Salmos 23:4', reference: 'Salmos 23:4',
    translation: 'RVR1960', translationName: 'RVR1960', content: 'Texto', provider: 'local', bibleId: 'rvr',
    passageId: 'ps-23-4', copyright: '', bible: { slides: [{ reference: 'Salmos 23:4', text: 'Texto' }], slideIndex: 0, slideCount: 1 },
    bibleSlideIndex: 0, bibleSlideCount: 1, media: null, background: null, backgroundMedia: null,
    previousProjectorState: null, previousProjectionFields: { ...baseEvent }, sourceActor: 'multimedia', actorUid: 'bible',
    actorName: 'Bible', actorRole: 'admin', updatedBy: 'Bible', updatedAt: 1, projectionVersion: 1, projectionActionId: 'bible-1', timer: null
  };
  const biblePayload = { ...baseEvent, projectorState: bibleState, liveState: { activeContentType: 'bible' } };
  await assertSucceeds(setDoc(doc(db('bible'), 'eventos', 'event-1'), biblePayload));
  const inactiveAnnouncementState = {
    announcementId: '', currentSlideIndex: 0, currentSlide: null, totalSlides: 0,
    presentationActive: false, transition: { type: 'fade', durationMs: 500 },
    autoAdvance: { enabled: false, durationMs: 7000 }, updatedAt: 1
  };
  const bibleProjectionPayload = { ...biblePayload, announcementState: inactiveAnnouncementState };
  await assertSucceeds(setDoc(doc(db('bible'), 'eventos', 'event-4'), bibleProjectionPayload));
  await assertSucceeds(setDoc(doc(db('owner'), 'eventos', 'event-5'), bibleProjectionPayload));

  const legacySongProjection = {
    projectorState: {
      type: 'lyrics', contentType: 'lyrics', title: 'Coro', content: 'Texto', media: null,
      projectionStyle: { preset: 'clean', motion: 'soft' }, transitionId: 'song-transition-1',
      transitionStartedAt: 1, background: null, backgroundMedia: null, updatedAt: 1
    },
    proyectorSlide: { titulo: 'Coro', texto: 'Texto', sectionIndex: 0, pageIndex: 0, pageCount: 1 },
    announcementState: inactiveAnnouncementState,
    proyectorFondo: null, proyectorFondoMedia: null, proyectorSongId: 'song-1',
    proyectorSlideIndex: 0, proyectorNextSlide: null, proyectorNextSong: null,
    proyectorOffset: 0, liveState: { activeContentType: 'lyrics' }, currentSongId: 'song-1',
    proyectorLogo: false, proyectorApagado: false, proyectorMedia: null
  };
  await assertSucceeds(updateDoc(doc(db('owner'), 'eventos', 'legacy-projection'), legacySongProjection));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'eventos', 'legacy-bible-projection'), {
      titulo: 'Evento legacy',
      projectorState: { type: 'resume', contentType: 'none', media: null },
      liveState: {}
    });
  });
  const legacyBiblePrevious = {
    projectorState: { type: 'resume', contentType: 'none', media: null },
    proyectorSlide: null, proyectorMedia: null, proyectorLogo: null, proyectorApagado: null,
    proyectorFondo: null, proyectorFondoMedia: null, proyectorSongId: null,
    proyectorSlideIndex: null, proyectorNextSlide: null, proyectorNextSong: null,
    proyectorOffset: null, liveState: {}, currentSongId: null
  };
  await assertSucceeds(updateDoc(doc(db('owner'), 'eventos', 'legacy-bible-projection'), {
    ...bibleProjectionPayload,
    projectorState: { ...bibleState, previousProjectionFields: legacyBiblePrevious }
  }));
  await assertSucceeds(updateDoc(doc(db('owner'), 'eventos', 'legacy-bible-projection'), legacySongProjection));
  await assertFails(updateDoc(doc(db('bible'), 'eventos', 'event-1'), { proyectorMedia: { url: 'https://invalid.example/media.mp4' } }));
  await assertFails(updateDoc(doc(db('bible'), 'eventos', 'event-1'), { projectorState: { ...bibleState, type: 'media', contentType: 'media', media: { url: 'https://invalid.example/media.mp4' } } }));

  const quickState = {
    type: 'preaching', contentType: 'quickMessage', preachingType: 'quickMessage', presentationType: 'phrase',
    title: 'No pierdas tu bendicion', content: 'No pierdas tu bendicion por un momentito de pecado',
    segments: [{ text: 'No pierdas tu bendicion', color: 'blue', bold: true }, { text: ' por un momentito de pecado', color: 'red', bold: true }],
    alignment: 'center', media: null, background: null, backgroundMedia: null, previousProjectorState: null,
    previousProjectionFields: { ...baseEvent }, sourceActor: 'multimedia', actorUid: 'quick', actorName: 'Quick', actorRole: 'musico',
    updatedBy: 'Quick', updatedAt: 1, projectionVersion: 1, projectionActionId: 'quick-1'
  };
  const quickPayload = { ...baseEvent, projectorState: quickState, liveState: { activeContentType: 'quickMessage' } };
  await assertFails(setDoc(doc(db('quick'), 'eventos', 'event-2'), quickPayload));
  await assertFails(setDoc(doc(db('quick'), 'eventos', 'event-2'), bibleProjectionPayload));
  await assertFails(setDoc(doc(db('quick'), 'eventos', 'event-2'), {
    ...baseEvent, projectorState: { type: 'preaching', contentType: 'preaching', content: 'Predica', media: null }, proyectorMedia: null
  }));
  await assertFails(setDoc(doc(db('quick'), 'eventos', 'event-2'), {
    ...baseEvent, projectorState: { type: 'media', contentType: 'media', media: { mediaId: 'forged', url: 'https://example.test/forged.mp4' } }, proyectorMedia: { mediaId: 'forged', url: 'https://example.test/forged.mp4' }
  }));
  await assertFails(setDoc(doc(db('quick'), 'eventos', 'event-2'), {
    ...quickPayload,
    projectorState: { ...quickState, segments: [{ text: 'x'.repeat(241), color: 'white', bold: true }] }
  }));
  await assertFails(setDoc(doc(db('quick'), 'eventos', 'event-2'), {
    ...quickPayload,
    projectorState: { ...quickState, segments: [{ text: 'Texto invalido', color: 'purple', bold: true }] }
  }));

  const mediaState = {
    type: 'media', contentType: 'media', title: 'Video', content: '',
    media: { mediaId: 'media-1', url: 'https://example.test/video.mp4' },
    background: null, backgroundMedia: null
  };
  await assertSucceeds(setDoc(doc(db('media'), 'eventos', 'event-2'), {
    ...baseEvent, projectorState: mediaState, proyectorMedia: mediaState.media
  }));
  await assertFails(setDoc(doc(db('media'), 'eventos', 'event-2'), biblePayload));

  const sermonState = {
    type: 'preaching', contentType: 'preaching', title: 'Prédica', content: 'Contenido',
    media: null, background: null, backgroundMedia: null
  };
  await assertSucceeds(setDoc(doc(db('sermon'), 'eventos', 'event-3'), {
    ...baseEvent, projectorState: sermonState, proyectorMedia: null
  }));
  await assertFails(setDoc(doc(db('sermon'), 'eventos', 'event-3'), {
    ...baseEvent, projectorState: mediaState, proyectorMedia: mediaState.media
  }));

  const announcementState = {
    announcementId: 'announcement-1', currentSlideIndex: 0, currentSlide: { id: 'slide-1' }, totalSlides: 1,
    presentationActive: true, transition: { type: 'fade', durationMs: 300 },
    autoAdvance: { enabled: false, durationMs: 5000 }, updatedAt: 1
  };
  await assertSucceeds(setDoc(doc(db('owner'), 'eventos', 'event-3'), {
    ...baseEvent,
    projectorState: { type: 'announcement', contentType: 'announcement', title: 'Anuncio', content: '', media: null, background: null, backgroundMedia: null, updatedAt: 1 },
    announcementState
  }));

  const controlStates = {
    bible: bibleState,
    lyrics: baseEvent.projectorState,
    media: mediaState,
    preaching: sermonState,
    quickMessage: quickState
  };
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all(Object.entries(controlStates).map(([contentType, projectorState]) => setDoc(
      doc(firestore, 'eventos', `controls-${contentType}`),
      {
        ...baseEvent,
        projectorState,
        proyectorMedia: contentType === 'media' ? mediaState.media : null,
        proyectorModoTransmision: false,
        proyectorTransicion: 'fade',
        proyectorCountdown: { active: false, endTimestamp: null }
      }
    )));
  });

  for (const contentType of Object.keys(controlStates)) {
    const controlEvent = doc(db('owner'), 'eventos', `controls-${contentType}`);
    await assertSucceeds(updateDoc(controlEvent, { proyectorModoTransmision: true }));
    await assertSucceeds(updateDoc(controlEvent, { proyectorModoTransmision: false }));
    await assertSucceeds(updateDoc(controlEvent, { proyectorTransicion: 'slide' }));
    await assertSucceeds(updateDoc(controlEvent, {
      proyectorCountdown: { active: true, endTimestamp: 2000000000000 }
    }));
    await assertSucceeds(updateDoc(controlEvent, {
      proyectorCountdown: { active: false, endTimestamp: null }
    }));
  }

  const bibleControls = doc(db('owner'), 'eventos', 'controls-bible');
  await assertSucceeds(updateDoc(doc(db('control-user'), 'eventos', 'controls-bible'), {
    proyectorModoTransmision: true,
    proyectorTransicion: 'zoom',
    proyectorCountdown: { active: true, endTimestamp: 2000000000000 }
  }));
  await assertFails(updateDoc(doc(db('suspended-control'), 'eventos', 'controls-bible'), {
    proyectorModoTransmision: false
  }));
  await assertFails(updateDoc(doc(db('editor'), 'eventos', 'controls-bible'), { proyectorModoTransmision: false }));
  await assertFails(updateDoc(doc(testEnv.unauthenticatedContext().firestore(), 'eventos', 'controls-bible'), {
    proyectorModoTransmision: false
  }));
  await assertFails(updateDoc(bibleControls, { proyectorModoTransmision: 'true' }));
  await assertFails(updateDoc(bibleControls, { proyectorTransicion: 'spin' }));
  await assertFails(updateDoc(bibleControls, {
    proyectorCountdown: { active: true, endTimestamp: null }
  }));
  await assertFails(updateDoc(bibleControls, {
    proyectorCountdown: { active: false, endTimestamp: 2000000000000 }
  }));
  await assertFails(updateDoc(bibleControls, {
    proyectorModoTransmision: false,
    titulo: 'Campo arbitrario'
  }));
  await assertFails(updateDoc(bibleControls, {
    proyectorModoTransmision: false,
    projectorState: { ...bibleState, title: 'Estado manipulado' }
  }));
  await assertFails(updateDoc(bibleControls, {
    proyectorModoTransmision: false,
    liveState: { activeContentType: 'forged' }
  }));
  await assertFails(updateDoc(bibleControls, {
    proyectorModoTransmision: false,
    currentSongId: 'forged-song'
  }));

  await assertSucceeds(updateDoc(doc(db('owner'), 'canciones', 'active'), {
    letraRaw: '# Coro\nCambio legacy seguro',
    fechaActualizacion: '2026-11-08T00:00:00.000Z'
  }));
  await assertFails(updateDoc(doc(db('admin'), 'canciones', 'active'), {
    letraRaw: '# Coro\nCambio legacy sin rol owner'
  }));
  await assertFails(updateDoc(doc(db('owner'), 'canciones', 'formatted'), {
    letraRaw: '# Coro\nCambio directo inseguro'
  }));
  await assertFails(updateDoc(doc(db('owner'), 'canciones', 'formatted'), {
    lyricFormatting: null,
    letraRaw: '# Coro\nIntento de borrar sidecar'
  }));
  await assertSucceeds(updateDoc(doc(db('owner'), 'canciones', 'active'), {
    letraRaw: '# Coro\nCambio legacy combinado',
    titulo: 'Cambio combinado'
  }));
  for (const protectedField of ['lyricFormatting', 'letra', 'lyrics', 'contenido']) {
    await assertFails(updateDoc(doc(db('owner'), 'canciones', 'active'), {
      [protectedField]: protectedField === 'lyricFormatting' ? { version: 1 } : 'Cambio directo'
    }));
  }
  await assertSucceeds(updateDoc(doc(db('owner'), 'canciones', 'active'), { titulo: 'Metadata permitida' }));
  await assertSucceeds(setDoc(doc(db('owner'), 'canciones', 'legacy-create'), {
    titulo: 'Legacy', letraRaw: '# Verso\nTexto', lyricFormatting: null
  }));
  await assertFails(setDoc(doc(db('owner'), 'canciones', 'forged-formatted-create'), {
    titulo: 'Formato falsificado', lyricFormatting: { version: 1 }
  }));
  await assertFails(setDoc(doc(db('owner'), 'lyricFormattingOperations', 'forged-operation'), {
    actorUid: 'owner'
  }));
  await assertFails(setDoc(doc(db('owner'), 'songDuplicationOperations', 'forged-operation'), {
    actorUid: 'owner'
  }));
  await assertFails(getDoc(doc(db('owner'), 'sistema', 'v21RuntimeControl')));
  await assertFails(setDoc(doc(db('owner'), 'sistema', 'v21RuntimeControl'), { enabled: true }));
  for (const actor of ['owner', 'admin', 'media', 'editor']) {
    await assertFails(getDoc(doc(db(actor), 'sistema', 'v21RuntimeControl')));
    await assertFails(setDoc(doc(db(actor), 'sistema', 'v21RuntimeControl'), { enabled: true }));
    await assertFails(getDoc(doc(db(actor), 'sistema', 'v21RuntimeControl', 'audit', 'entry-1')));
    await assertFails(setDoc(doc(db(actor), 'sistema', 'v21RuntimeControl', 'audit', 'entry-1'), {
      enabled: true
    }));
  }

  const restoreFields = [
    'projectorState', 'proyectorSlide', 'proyectorMedia', 'proyectorLogo',
    'proyectorApagado', 'proyectorFondo', 'proyectorFondoMedia',
    'proyectorSongId', 'proyectorSlideIndex', 'proyectorNextSlide',
    'proyectorNextSong', 'proyectorOffset', 'liveState', 'currentSongId'
  ];
  const snapshotFor = (event) => restoreFields.reduce((snapshot, field) => {
    snapshot[field] = structuredClone(event[field]);
    return snapshot;
  }, {});
  const blackoutFor = (snapshot) => ({
    projectorState: {
      type: 'blackout', contentType: 'none', title: 'Pantalla negra', content: '',
      media: null, timer: null, background: null, backgroundMedia: null,
      previousProjectionFields: snapshot, updatedAt: 2
    },
    proyectorSlide: null,
    proyectorMedia: null,
    proyectorLogo: false,
    proyectorApagado: true,
    proyectorFondo: null,
    proyectorFondoMedia: null,
    proyectorSongId: null,
    proyectorSlideIndex: -1,
    proyectorNextSlide: null,
    proyectorNextSong: null,
    liveState: { activeContentType: 'blackout' },
    currentSongId: null
  });

  const restorableStates = {
    lyrics: baseEvent.projectorState,
    bible: bibleState,
    quickMessage: quickState,
    media: mediaState
  };
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all(Object.entries(restorableStates).map(([kind, projectorState]) => setDoc(
      doc(firestore, 'eventos', `restore-${kind}`), {
        ...baseEvent,
        projectorState: structuredClone(projectorState),
        proyectorMedia: kind === 'media' ? structuredClone(mediaState.media) : null,
        liveState: { activeContentType: kind },
        proyectorSlide: { texto: `${kind} original` },
        proyectorSongId: `${kind}-song`,
        proyectorSlideIndex: 3,
        proyectorNextSlide: { texto: 'siguiente' },
        proyectorNextSong: { id: 'next-song' },
        proyectorOffset: 14,
        currentSongId: `${kind}-current`
      }
    )));
  });

  for (const kind of Object.keys(restorableStates)) {
    const eventRef = doc(db('owner'), 'eventos', `restore-${kind}`);
    const before = (await getDoc(eventRef)).data();
    const snapshot = snapshotFor(before);
    await assertSucceeds(updateDoc(eventRef, blackoutFor(snapshot)));
    await assertSucceeds(updateDoc(eventRef, snapshot));
    assert.deepEqual((await getDoc(eventRef)).data(), before, `${kind} blackout restore must be exact`);
  }

  const quickBeforeBible = {
    ...baseEvent,
    projectorState: structuredClone(quickState),
    liveState: { activeContentType: 'quickMessage' },
    proyectorSlide: { texto: 'quick original' },
    proyectorSongId: 'quick-song',
    proyectorSlideIndex: 2,
    proyectorNextSlide: { texto: 'quick siguiente' },
    proyectorNextSong: { id: 'quick-next' },
    proyectorOffset: 9,
    currentSongId: 'quick-current'
  };
  const quickSnapshot = snapshotFor(quickBeforeBible);
  const bibleAfterQuick = {
    ...quickBeforeBible,
    projectorState: { ...bibleState, previousProjectionFields: quickSnapshot },
    liveState: { activeContentType: 'bible' },
    proyectorSlide: null,
    proyectorSongId: null,
    proyectorSlideIndex: -1,
    proyectorNextSlide: null,
    proyectorNextSong: null,
    currentSongId: null
  };
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'eventos', 'restore-quick-after-bible'), bibleAfterQuick);
  });
  const bibleRestoreRef = doc(db('owner'), 'eventos', 'restore-quick-after-bible');
  await assertSucceeds(updateDoc(bibleRestoreRef, quickSnapshot));
  assert.deepEqual((await getDoc(bibleRestoreRef)).data(), quickBeforeBible, 'Bible exit must restore the prior quick message exactly');

  console.log('firestore rules emulator: OK');
} finally {
  await testEnv.cleanup();
}
