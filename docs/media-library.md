# Biblioteca Multimedia - Fase 1

## Coleccion

La biblioteca central se almacenara en una coleccion independiente:

```txt
mediaLibrary/{mediaId}
```

Esta fase solo prepara helpers y modelo. No cambia pantallas, canciones existentes,
parser, proyector, reglas de Firestore ni estructura actual de `sectionMedia`.

## Modelo recomendado

```js
{
  version: 1,
  title: "Fondo Azul Loop",
  normalizedTitle: "fondo azul loop",
  type: "image | video | audio | pdf | link",
  url: "https://...",
  thumbnailUrl: "https://...",

  provider: "cloudinary | firebase_storage | url | unknown",
  source: "library | upload | url | legacy",
  folder: "Fondos",
  category: "Fondos",
  normalizedCategory: "fondos",
  tags: ["adoracion", "azul", "loop"],

  favoriteBy: ["uid"],
  usageCount: 0,
  lastUsedAt: null,

  createdAt: 1780000000000,
  createdBy: "uid",
  updatedAt: 1780000000000,
  deletedAt: null,

  status: "active | archived | pending_delete | deleted",

  cloudinaryPublicId: "kadosh/section-media/fondo",
  cloudinaryResourceType: "image | video | raw",
  storagePath: "section-media/file.pdf",

  metadata: {
    width: null,
    height: null,
    duration: null,
    size: null,
    mimeType: null,
    fps: null,
    bitrate: null,
    thumbnail: null
  }
}
```

`version: 1` permite migraciones compatibles del modelo en futuras fases.
`deletedAt` queda preparado para acompanar `pending_delete` y `deleted` cuando
se implemente papelera. `metadata` queda reservado para dimensiones, duracion,
tamano, tipo MIME, FPS, bitrate y miniaturas; esta fase no calcula esos datos.

## Referencia minima

Las canciones y futuras areas del sistema deben guardar referencias pequenas:

```js
{
  mediaId: "abc123",
  title: "Fondo Azul Loop",
  type: "video",
  url: "https://...",
  source: "library",
  thumbnailUrl: "https://...",
  provider: "cloudinary"
}
```

Esto permite reutilizar el mismo recurso en canciones, medleys, eventos,
predicaciones, anuncios, escenas y controlador sin duplicar el archivo.

## Helpers creados

Archivo:

```txt
src/utils/mediaLibrary.js
```

Exports principales:

- `MEDIA_LIBRARY_COLLECTION`
- `MEDIA_TYPES`
- `MEDIA_PROVIDERS`
- `MEDIA_STATUS`
- `normalizeMediaText()`
- `normalizeMediaTags()`
- `detectMediaTypeFromUrl()`
- `detectMediaProvider()`
- `extractCloudinaryPublicId()`
- `extractFirebaseStoragePath()`
- `createMediaLibraryDocument()`
- `validateMediaLibraryDocument()`
- `createMediaReference()`
- `normalizeLegacyMediaResource()`

## Compatibilidad

Las canciones actuales siguen funcionando aunque no exista `mediaLibrary`.

`sectionMedia` actual sigue siendo compatible porque los recursos por URL se pueden
normalizar con `normalizeLegacyMediaResource()` sin migracion manual.

Los recursos antiguos con `title`, `name`, `titulo`, `type`, `tipo` o solo `url`
se pueden convertir a referencia minima.

## Riesgos

- Para eliminar archivos fisicos en Cloudinary o Firebase Storage se necesita
  conservar `cloudinaryPublicId` o `storagePath`.
- Los recursos externos por URL pueden dejar de responder y deben validarse en
  futuras fases.
- `usageCount` debe mantenerse sincronizado cuando se conecte la UI; esta fase
  aun no escribe en Firestore.
- Firestore Rules deberan actualizarse en una fase posterior antes de exponer
  escritura real sobre `mediaLibrary`.
