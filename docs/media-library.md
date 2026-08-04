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
  usedBy: [
    {
      songId: "songId",
      songTitle: "No hay lugar mas alto",
      location: "section",
      sectionKey: "2_coro",
      sectionTitle: "Coro"
    }
  ],
  firstUsedAt: null,
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

## Sincronizador reutilizable - Fase 3.5

Archivo:

```txt
src/utils/mediaLibrarySync.js
```

La Fase 3.5 prepara un sincronizador permanente para reconstruir la biblioteca
desde canciones existentes sin escribir todavia en Firestore.

Entradas:

```js
buildMediaLibrarySyncPlan(canciones)
```

El sincronizador escanea cada cancion y detecta:

- `fondoUrl`
- `recursos[]`
- `sectionMedia{}`

Cada recurso encontrado se normaliza usando los helpers existentes de
`mediaLibrary.js`, especialmente `normalizeLegacyMediaResource()` y
`createMediaLibraryDocument()`.

### Deduplicacion

Para evitar registros repetidos, cada recurso se agrupa por la mejor identidad
disponible, en este orden:

1. `mediaId`
2. `cloudinaryPublicId`
3. `storagePath`
4. URL normalizada

Esto permite que el mismo archivo usado como fondo, recurso o multimedia de
seccion termine en un unico documento candidato de `mediaLibrary`.

### Usos exactos

Cada documento generado queda preparado con:

```js
{
  usageCount: 2,
  usedBy: [
    {
      songId: "abc",
      songTitle: "Cancion",
      location: "background"
    },
    {
      songId: "abc",
      songTitle: "Cancion",
      location: "section",
      sectionKey: "2_coro",
      sectionTitle: "Coro"
    }
  ],
  firstUsedAt: null,
  lastUsedAt: null
}
```

`firstUsedAt` y `lastUsedAt` quedan preparados para futuras fases. Si los datos
actuales no incluyen fechas reales de uso, permanecen en `null`.

### Resultado

`buildMediaLibrarySyncPlan()` devuelve:

```js
{
  generatedAt,
  mediaDocuments,
  duplicates,
  invalidResources,
  stats: {
    totalSongsScanned,
    totalMediaDocuments,
    totalUsages,
    duplicateGroups,
    invalidResources
  }
}
```

Este resultado esta listo para que una fase posterior lo escriba en Firestore,
muestre "usado en X canciones", detalle canciones/secciones, detecte duplicados
y encuentre recursos invalidos.

## Compatibilidad

Las canciones actuales siguen funcionando aunque no exista `mediaLibrary`.

`sectionMedia` actual sigue siendo compatible porque los recursos por URL se pueden
normalizar con `normalizeLegacyMediaResource()` sin migracion manual.

Los recursos antiguos con `title`, `name`, `titulo`, `type`, `tipo` o solo `url`
se pueden convertir a referencia minima.

El sincronizador de Fase 3.5 no modifica `canciones`, `fondoUrl`, `recursos` ni
`sectionMedia`; solo genera una estructura en memoria lista para guardar en una
fase posterior.

## Riesgos

- Para eliminar archivos fisicos en Cloudinary o Firebase Storage se necesita
  conservar `cloudinaryPublicId` o `storagePath`.
- Los recursos externos por URL pueden dejar de responder y deben validarse en
  futuras fases.
- `usageCount` debe mantenerse sincronizado cuando se conecte la UI; esta fase
  aun no escribe en Firestore.
- Firestore Rules deberan actualizarse en una fase posterior antes de exponer
  escritura real sobre `mediaLibrary`.

## Sincronizacion hacia Firestore - Fase 4B

Archivo:

```txt
src/utils/mediaLibraryFirestoreSync.js
```

La Fase 4B agrega una capa reutilizable para escribir en Firestore el resultado
generado por `buildMediaLibrarySyncPlan()`. No se ejecuta automaticamente y no
crea botones de interfaz todavia.

Funciones principales:

- `loadSongsForMediaLibrarySync()`
- `syncMediaLibraryFromSongs(canciones, options)`
- `syncMediaLibraryFromFirestoreSongs(options)`

### Flujo

```txt
canciones
  -> buildMediaLibrarySyncPlan()
  -> buscar documentos existentes en mediaLibrary
  -> crear o actualizar mediaLibrary
```

`syncMediaLibraryFromFirestoreSongs()` lee todas las canciones desde la coleccion
`canciones`, genera el plan con el sincronizador existente y escribe la coleccion
`mediaLibrary`.

`syncMediaLibraryFromSongs()` permite reutilizar el mismo flujo cuando las
canciones ya fueron cargadas por otra pantalla o proceso administrativo.

### Idempotencia

La sincronizacion puede ejecutarse varias veces. Para evitar duplicados reutiliza
la misma identidad calculada en `mediaLibrarySync.js`:

1. `mediaId`
2. `cloudinaryPublicId`
3. `storagePath`
4. URL normalizada

Si el recurso ya existe, solo actualiza datos de uso:

- `usageCount`
- `usedBy`
- `firstUsedAt`
- `lastUsedAt`
- `updatedAt`

Si el recurso no existe, crea un documento completo a partir del documento
generado por `createMediaLibraryDocument()` dentro del plan de sincronizacion.

### Escritura segura

Los documentos nuevos usan un ID estable derivado de la identidad del recurso.
Esto evita duplicados aunque la sincronizacion se repita o se reconstruya la
biblioteca en el futuro.

Las escrituras se hacen en batches para respetar los limites de Firestore.

### Compatibilidad

Esta fase no modifica:

- `canciones`
- `fondoUrl`
- `recursos`
- `sectionMedia`
- editores de canciones
- proyector
- eventos
- medleys

El sistema actual sigue funcionando aunque la sincronizacion nunca se ejecute.
La siguiente fase podra llamar esta funcion desde un boton administrativo como
"Sincronizar Biblioteca".
