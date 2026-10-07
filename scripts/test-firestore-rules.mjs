import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const testEnv = await initializeTestEnvironment({
  projectId: 'kadosh-49600',
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
      setDoc(doc(firestore, 'usuarios', 'canva-projector'), {
        rol: 'multimedia', nombre: 'Canva projector',
      }),
      setDoc(doc(firestore, 'sistema', 'permissionRoles'), {
        roleDefaults: {
          multimedia: {
            'dashboard.view': true,
            'events.view': true,
            'setlists.view': true,
            'setlists.control': true,
            'multimedia.libraryView': true,
            'multimedia.centralAccess': true,
            'multimedia.project': true,
            'multimedia.controlOutputs': true,
            'canva.view': true,
            'canva.create': true,
            'canva.project': true
          }
        }
      }),
      setDoc(doc(firestore, 'usuarios', 'sermon'), {
        rol: 'multimedia', nombre: 'Sermon',
        permissionOverrides: { 'sermons.project': true, 'multimedia.project': false }
      }),
      setDoc(doc(firestore, 'eventos', 'event-1'), baseEvent),
      setDoc(doc(firestore, 'eventos', 'event-2'), baseEvent),
      setDoc(doc(firestore, 'eventos', 'event-3'), baseEvent),
      setDoc(doc(firestore, 'eventos', 'event-4'), baseEvent),
      setDoc(doc(firestore, 'eventos', 'event-5'), baseEvent),
      setDoc(doc(firestore, 'anuncios', 'announcement-1'), { titulo: 'Anuncio' }),
      setDoc(doc(firestore, 'canciones', 'active'), { titulo: 'Activa', archived: false }),
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
  const undoOperationRef = doc(db('owner'), 'eventos', 'event-1', 'undoOperations', 'forged');
  await assertFails(getDoc(undoOperationRef));
  await assertFails(setDoc(undoOperationRef, { action: 'canva' }));
  await assertFails(updateDoc(undoOperationRef, { status: 'restored' }));
  await assertFails(deleteDoc(undoOperationRef));

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
  await assertFails(updateDoc(doc(db('editor'), 'eventos', 'controls-bible'), { proyectorModoTransmision: true }));
  await assertFails(updateDoc(bibleControls, { proyectorModoTransmision: 'true' }));
  await assertFails(updateDoc(bibleControls, { proyectorTransicion: 'spin' }));
  await assertFails(updateDoc(bibleControls, {
    proyectorCountdown: { active: true, endTimestamp: null }
  }));
  await assertFails(updateDoc(bibleControls, {
    proyectorCountdown: { active: false, endTimestamp: 2000000000000 }
  }));
  await assertFails(updateDoc(bibleControls, {
    proyectorModoTransmision: true,
    titulo: 'Campo arbitrario'
  }));
  await assertFails(updateDoc(bibleControls, {
    proyectorModoTransmision: true,
    projectorState: { ...bibleState, title: 'Estado manipulado' }
  }));
  await assertFails(updateDoc(bibleControls, {
    proyectorModoTransmision: true,
    liveState: { activeContentType: 'forged' }
  }));
  await assertFails(updateDoc(bibleControls, {
    proyectorModoTransmision: true,
    currentSongId: 'forged-song'
  }));

  const modernCanvaRoute = {
    active: true,
    presentationId: 'canva-modern',
    projectionOperationId: 'operation-modern-x',
    title: 'Canva moderno',
    sourceUrl: 'https://www.canva.com/design/modern/view',
    embedUrl: 'https://www.canva.com/design/modern/view?embed#page=1',
    page: 1,
    pageCount: 8,
    updatedAt: 1,
    updatedBy: 'Owner'
  };
  const legacyCanvaRoute = {
    ...modernCanvaRoute,
    presentationId: 'canva-legacy',
    title: 'Canva legacy',
    sourceUrl: 'https://www.canva.com/design/legacy/view',
    embedUrl: 'https://www.canva.com/design/legacy/view?embed#page=1'
  };
  delete legacyCanvaRoute.projectionOperationId;
  const temporaryCanvaRoute = {
    active: true,
    presentationId: '',
    title: 'Canva temporal',
    sourceUrl: 'https://www.canva.com/design/temporary/view',
    embedUrl: 'https://www.canva.com/design/temporary/view?embed#1',
    page: 1,
    pageCount: 3,
    updatedAt: 1,
    updatedBy: 'Owner'
  };
  const mediaRoute = (id) => ({
    active: true,
    mediaKey: id,
    mediaId: id,
    name: `Video ${id}`,
    url: `https://example.test/${id}.mp4`,
    type: 'video',
    mode: 'foreground',
    playing: true,
    volume: 0.8,
    loop: true,
    updatedAt: 1,
    updatedBy: 'Owner'
  });
  const mediaProjector = mediaRoute('projector-a');
  const mediaSingers = mediaRoute('singers-b');
  const mediaMusicians = mediaRoute('musicians-c');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, 'eventos', 'canva-modern-identity'), {
        ...baseEvent,
        canvaOutputs: { projector: modernCanvaRoute },
        mediaOutputs: {},
        canvaPageMemory: { projector: { 'id:canva-modern': 1 } }
      }),
      setDoc(doc(firestore, 'eventos', 'canva-legacy-identity'), {
        ...baseEvent,
        canvaOutputs: { projector: legacyCanvaRoute },
        mediaOutputs: {},
        canvaPageMemory: { projector: { 'id:canva-legacy': 1 } }
      }),
      setDoc(doc(firestore, 'eventos', 'canva-empty-identity'), {
        ...baseEvent,
        canvaOutputs: {},
        mediaOutputs: {},
        canvaPageMemory: {}
      }),
      setDoc(doc(firestore, 'eventos', 'canva-modern-removal'), {
        ...baseEvent,
        canvaOutputs: { projector: modernCanvaRoute },
        mediaOutputs: {},
        canvaPageMemory: {}
      }),
      setDoc(doc(firestore, 'eventos', 'canva-budget-sync'), {
        ...baseEvent,
        canvaOutputs: {
          projector: modernCanvaRoute,
          singers: { ...modernCanvaRoute, updatedBy: 'Multimedia E2E' },
          musicians: {
            ...modernCanvaRoute,
            presentationId: 'canva-b',
            projectionOperationId: 'operation-modern-b',
            title: 'Canva B',
            sourceUrl: 'https://www.canva.com/design/canva-b/view',
            embedUrl: 'https://www.canva.com/design/canva-b/view?embed#1'
          }
        },
        canvaPageMemory: {
          projector: { 'id:canva-modern': 1 },
          singers: { 'id:canva-modern': 1 },
          musicians: { 'id:canva-b': 1 }
        }
      }),
      setDoc(doc(firestore, 'eventos', 'canva-budget-temporary-page'), {
        ...baseEvent,
        canvaOutputs: { projector: temporaryCanvaRoute },
        mediaOutputs: { singers: mediaSingers },
        canvaPageMemory: {
          projector: { 'url:https://www.canva.com/design/temporary/view': 1 },
          singers: {},
          musicians: {}
        }
      }),
      setDoc(doc(firestore, 'eventos', 'canva-budget-temporary-three'), {
        ...baseEvent,
        canvaOutputs: {},
        mediaOutputs: { projector: mediaProjector, singers: mediaSingers, musicians: mediaMusicians },
        canvaPageMemory: {}
      }),
      ...[
        'projector',
        'two-targets',
        'invalid-removal',
        'invalid-modify',
        'invalid-create',
        'invalid-replace',
        'invalid-projection',
        'invalid-live-state',
        'invalid-permission'
      ].map((id) => setDoc(
        doc(firestore, 'eventos', `canva-media-${id}`),
        {
          ...baseEvent,
          canvaOutputs: {},
          mediaOutputs: { projector: mediaProjector, singers: mediaSingers },
          canvaPageMemory: {}
        }
      ))
    ]);
  });
  const temporarySingersRoute = {
    ...temporaryCanvaRoute,
    title: 'Canva temporal cantantes',
    sourceUrl: 'https://www.canva.com/design/temporary-singers/view',
    embedUrl: 'https://www.canva.com/design/temporary-singers/view?embed#1'
  };
  await assertSucceeds(updateDoc(doc(db('canva-projector'), 'eventos', 'canva-media-projector'), {
    canvaOutputs: { projector: temporaryCanvaRoute },
    mediaOutputs: { singers: mediaSingers },
    canvaPageMemory: { projector: { 'url:https://www.canva.com/design/temporary/view': 1 } }
  }));
  await assertSucceeds(updateDoc(doc(db('canva-projector'), 'eventos', 'canva-media-two-targets'), {
    canvaOutputs: { projector: temporaryCanvaRoute, singers: temporarySingersRoute },
    mediaOutputs: {},
    canvaPageMemory: {
      projector: { 'url:https://www.canva.com/design/temporary/view': 1 },
      singers: { 'url:https://www.canva.com/design/temporary-singers/view': 1 }
    }
  }));
  await assertFails(updateDoc(doc(db('owner'), 'eventos', 'canva-media-invalid-removal'), {
    canvaOutputs: { projector: temporaryCanvaRoute },
    mediaOutputs: {}
  }));
  await assertFails(updateDoc(doc(db('owner'), 'eventos', 'canva-media-invalid-modify'), {
    canvaOutputs: { projector: temporaryCanvaRoute },
    mediaOutputs: { singers: { ...mediaSingers, playing: false } }
  }));
  await assertFails(updateDoc(doc(db('owner'), 'eventos', 'canva-media-invalid-create'), {
    canvaOutputs: { projector: temporaryCanvaRoute },
    mediaOutputs: { projector: mediaProjector, singers: mediaSingers, musicians: mediaMusicians }
  }));
  await assertFails(updateDoc(doc(db('owner'), 'eventos', 'canva-media-invalid-replace'), {
    canvaOutputs: { projector: temporaryCanvaRoute },
    mediaOutputs: { singers: mediaRoute('singers-replacement') }
  }));
  await assertFails(updateDoc(doc(db('owner'), 'eventos', 'canva-media-invalid-projection'), {
    canvaOutputs: { projector: temporaryCanvaRoute },
    mediaOutputs: { singers: mediaSingers },
    projectorState: { ...baseEvent.projectorState, title: 'No permitido' }
  }));
  await assertFails(updateDoc(doc(db('owner'), 'eventos', 'canva-media-invalid-live-state'), {
    canvaOutputs: { projector: temporaryCanvaRoute },
    mediaOutputs: { singers: mediaSingers },
    liveState: { ...baseEvent.liveState, activeContentTitle: 'No permitido' }
  }));
  await assertFails(updateDoc(doc(db('editor'), 'eventos', 'canva-media-invalid-permission'), {
    canvaOutputs: { projector: temporaryCanvaRoute },
    mediaOutputs: { singers: mediaSingers }
  }));
  const modernCanvaRef = doc(db('owner'), 'eventos', 'canva-modern-identity');
  const modernCanvaPageTwo = {
    ...modernCanvaRoute,
    embedUrl: 'https://www.canva.com/design/modern/view?embed#page=2',
    page: 2,
    updatedAt: 2,
    updatedBy: 'Otro operador'
  };
  await assertSucceeds(updateDoc(modernCanvaRef, {
    canvaOutputs: { projector: modernCanvaPageTwo },
    canvaPageMemory: { projector: { 'id:canva-modern': 2 } }
  }));
  await assertFails(updateDoc(modernCanvaRef, {
    canvaOutputs: { projector: { ...modernCanvaPageTwo, projectionOperationId: 'operation-forged-y' } }
  }));
  const modernCanvaWithoutIdentity = { ...modernCanvaPageTwo };
  delete modernCanvaWithoutIdentity.projectionOperationId;
  await assertFails(updateDoc(modernCanvaRef, { canvaOutputs: { projector: modernCanvaWithoutIdentity } }));
  await assertFails(updateDoc(modernCanvaRef, {
    canvaOutputs: { projector: { ...legacyCanvaRoute, presentationId: 'canva-other' } }
  }));
  await assertSucceeds(updateDoc(modernCanvaRef, {
    canvaOutputs: { projector: temporaryCanvaRoute }
  }));
  await assertSucceeds(updateDoc(modernCanvaRef, {
    canvaOutputs: {
      projector: {
        ...temporaryCanvaRoute,
        sourceUrl: 'https://www.canva.com/design/temporary-next/view',
        embedUrl: 'https://www.canva.com/design/temporary-next/view?embed#2',
        title: 'Canva temporal siguiente',
        page: 2,
        updatedAt: 2
      }
    }
  }));
  await assertFails(updateDoc(doc(db('owner'), 'eventos', 'canva-legacy-identity'), {
    canvaOutputs: { projector: { ...legacyCanvaRoute, projectionOperationId: 'operation-forged-y' } }
  }));
  await assertSucceeds(updateDoc(doc(db('owner'), 'eventos', 'canva-legacy-identity'), {
    canvaOutputs: { projector: { ...legacyCanvaRoute, page: 2, updatedAt: 2, updatedBy: 'Otro operador' } },
    canvaPageMemory: { projector: { 'id:canva-legacy': 2 } }
  }));
  await assertSucceeds(updateDoc(doc(db('owner'), 'eventos', 'canva-legacy-identity'), {
    canvaOutputs: {}
  }));
  await assertSucceeds(updateDoc(doc(db('owner'), 'eventos', 'canva-empty-identity'), {
    canvaOutputs: { projector: temporaryCanvaRoute }
  }));
  await assertFails(updateDoc(doc(db('owner'), 'eventos', 'canva-empty-identity'), {
    canvaOutputs: { projector: modernCanvaRoute }
  }));
  await assertFails(updateDoc(doc(db('owner'), 'eventos', 'canva-empty-identity'), {
    canvaOutputs: { projector: legacyCanvaRoute }
  }));
  await assertFails(updateDoc(doc(db('editor'), 'eventos', 'canva-empty-identity'), {
    canvaOutputs: { projector: temporaryCanvaRoute }
  }));
  // Reproducciones E2E de presupuesto: Multimedia obtiene canva.project sólo desde roleDefaults.
  const multimediaCanva = db('canva-projector');
  const syncPageTwo = { ...modernCanvaRoute, embedUrl: 'https://www.canva.com/design/modern/view?embed#page=2', page: 2, updatedAt: 2, updatedBy: 'Multimedia E2E' };
  await assertSucceeds(updateDoc(doc(multimediaCanva, 'eventos', 'canva-budget-sync'), {
    canvaOutputs: { projector: syncPageTwo, singers: syncPageTwo },
    canvaPageMemory: { projector: { 'id:canva-modern': 2 }, singers: { 'id:canva-modern': 2 } }
  }));
  const temporaryPageTwo = { ...temporaryCanvaRoute, embedUrl: 'https://www.canva.com/design/temporary/view?embed#2', page: 2, updatedAt: 2, updatedBy: 'Multimedia E2E' };
  await assertSucceeds(updateDoc(doc(multimediaCanva, 'eventos', 'canva-budget-temporary-page'), {
    canvaOutputs: { projector: temporaryPageTwo },
    canvaPageMemory: { projector: { 'url:https://www.canva.com/design/temporary/view': 2 } }
  }));
  const temporaryMusiciansRoute = { ...temporaryCanvaRoute, title: 'Canva temporal músicos', updatedBy: 'Multimedia E2E' };
  await assertSucceeds(updateDoc(doc(multimediaCanva, 'eventos', 'canva-budget-temporary-three'), {
    canvaOutputs: { projector: temporaryCanvaRoute, singers: temporarySingersRoute, musicians: temporaryMusiciansRoute },
    mediaOutputs: {},
    canvaPageMemory: {
      projector: { 'url:https://www.canva.com/design/temporary/view': 1 },
      singers: { 'url:https://www.canva.com/design/temporary-singers/view': 1 },
      musicians: { 'url:https://www.canva.com/design/temporary/view': 1 }
    }
  }));
  await assertFails(updateDoc(doc(db('owner'), 'eventos', 'canva-empty-identity'), {
    canvaOutputs: { projector: { ...temporaryCanvaRoute, embedUrl: 'https://example.test/not-canva#1' } }
  }));
  await assertFails(updateDoc(doc(db('owner'), 'eventos', 'canva-empty-identity'), {
    canvaOutputs: {
      projector: {
        ...temporaryCanvaRoute,
        embedUrl: 'https://www.canva.com/design/temporary/view?embed#2',
        page: 2,
        updatedAt: 2
      }
    },
    projectorState: { ...baseEvent.projectorState, title: 'Fuera de ruta temprana' }
  }));
  await assertSucceeds(updateDoc(doc(db('media'), 'eventos', 'canva-modern-removal'), {
    canvaOutputs: {}
  }));

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
