# VideoMaker v2

Aplicacion local para planificar, producir y empaquetar videos de YouTube con una pipeline editorial asistida por LLMs.

La app no intenta ser un generador automatico de videos de principio a fin. Su funcion principal es mantener ordenado el estado de cada video: idea, guion, plan visual, prompts de imagen, assets, voiceover, subtitulos, render, thumbnail y metadata. Desde ahi prepara prompts completos para pegarlos en otro LLM o para conectar despues automatizaciones reales.

Este README esta pensado tambien como contexto para otro LLM: si necesitas generar prompts para un canal, lee primero las secciones **Modelo Mental**, **Canales**, **Pipeline**, **Prompts** y **Contratos De Salida**.

## Modelo Mental

Cada video es una pieza de produccion completa.

Un `Video` contiene:

- canal y categoria editorial
- topic y titulo de trabajo
- `ideaJson` con el brief estructurado
- script completo
- escenas ordenadas
- prompts de imagen y assets locales
- voiceover y subtitulos
- render draft
- thumbnail
- metadata final

Una `Scene` es la unidad visual principal. Cada escena conecta un fragmento de narracion con una intencion visual, un prompt de imagen, una duracion y el asset generado/importado.

La app trabaja en modo local sobre SQLite y filesystem. El estado estructurado vive en Prisma/SQLite; los archivos pesados viven bajo `storage/`.

## Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui-style components
- Radix UI primitives
- lucide-react
- Prisma
- SQLite para desarrollo local
- FFmpeg para render local
- Integraciones preparadas para Google Flow y ElevenLabs

## Canales

Los canales estan definidos en `src/lib/channels.ts`.

Canales actuales:

- `wealth-insights`: finanzas personales, inversion y decisiones economicas explicadas con claridad visual, sin hype y sin promesas financieras.
- `christian-life`: storytelling reflexivo basado en fe.

Cada canal puede tener:

- `projectBiblePath`: reglas editoriales centrales.
- `imagePromptBiblePath`: estilo y reglas de imagen.
- `characterBiblePath`: personajes o consistencia visual, si aplica.
- prompts por etapa: angle builder, script writer, visual planner y metadata writer.
- defaults de voz, pacing, thumbnail o sistema de temas.

Documentacion por canal:

```txt
docs/channels/wealth-insights/
|-- project-bible.md
|-- character-bible.md
|-- image-prompt-bible.md
|-- editorial-instructions.md
`-- topic-system.md

docs/channels/christian-life/
|-- project-bible.md
|-- character-bible.md
`-- image-prompt-bible.md
```

Prompts por canal:

```txt
prompts/channels/wealth-insights/
|-- angle-builder.md
|-- script-writer.md
|-- visual-planner.md
`-- metadata-writer.md

prompts/channels/christian-life/
|-- angle-builder.md
|-- script-writer.md
|-- visual-planner.md
`-- metadata-writer.md
```

`prompts/_legacy/` conserva prompts antiguos y no deberia ser la fuente principal para trabajo nuevo.

## Pipeline De Produccion

La ruta principal de un video es:

```txt
Idea -> Script -> Visual Plan -> Assets -> Voiceover & Subtitles -> Render Draft -> Thumbnail -> Metadata
```

La app calcula automaticamente el estado global basandose en datos minimos:

- sin `ideaJson`: `idea`
- con `ideaJson` pero sin script: `script`
- con script pero sin escenas o sin prompts de imagen completos: `visual_plan`
- con escenas y prompts de imagen, pero sin metadata: `metadata`
- con metadata: `done`

Los estados tecnicos de voiceover, subtitulos, render y thumbnail tienen campos propios. No todos cambian el `status` editorial global.

## Rutas

### Dashboard

Ruta: `/`

Archivo: `src/app/page.tsx`

Muestra todos los videos ordenados por actualizacion. Cada item muestra titulo, topic, estado calculado, numero de escenas y fecha de actualizacion.

### Crear Video

Ruta: `/videos/new`

Archivo: `src/app/videos/new/page.tsx`

Permite crear un video nuevo con canal, topic, titulo, categoria y `ideaJson` inicial. Para Wealth Insights tambien muestra la `Daily Topic Queue`, desde donde se pueden importar lotes de ideas, filtrar por categoria/estado y crear videos desde una idea guardada.

### Detalle De Video

Ruta: `/videos/:id`

Archivo: `src/app/videos/[id]/page.tsx`

Es la pantalla de produccion. Contiene tabs para idea, guion, plan visual, assets, voiceover/subtitulos, render, thumbnail y metadata.

## Tabs Del Detalle

### Idea

Guarda el brief editorial base:

- canal
- categoria de tema, si el canal la usa
- topic
- titulo de trabajo
- `ideaJson`

Tambien permite copiar el `Angle Builder Prompt` completo del canal activo. Ese prompt incluye perfil de canal, project bible, instrucciones de categoria cuando aplica, prompt base y datos actuales del video.

Para Wealth Insights, el `ideaJson` puede enlazarse a una `TopicIdea` de la cola diaria.

### Script

Guarda el guion de narracion completo en `Video.script`.

El boton `Copy Script Writer Request` genera un prompt con:

- perfil del canal
- project bible
- prompt de script del canal
- `ideaJson` actual aplanado
- metadata de la idea de origen, si existe
- guia adicional para respetar `coreAngle`, `uniqueMechanism`, `emotionalHook`, `mainPromise`, `visualAnchor` y `thumbnailIdea`

El script debe ser narracion final, no notas de produccion.

### Visual Plan

Convierte el script en escenas. Sirve para importar, revisar y editar la estructura visual.

Funciones principales:

- resumen de escenas, duracion estimada, tipos de escena y prompts faltantes
- importacion de Visual Plan JSON
- importacion de patches de escena
- herramientas para reparar hook inicial
- deteccion y borrado de escenas duplicadas
- reset de referencias de imagen duplicadas
- creacion, edicion, borrado, merge y split de escenas

Tipos de escena aceptados actualmente:

- `avatar`
- `insert`
- `space`

### Assets

Gestiona prompts e imagenes por escena.

Funciones principales:

- editar `imagePrompt`, `imageUrl`, `imageLocalPath`, `imageFileName` y estados
- preparar batches de imagenes
- generar batches con Google Flow
- importar imagenes descargadas desde una carpeta local
- reintentar escenas fallidas
- resetear referencias de imagen
- marcar escenas para regenerar prompt

Los assets generados/importados se guardan bajo:

```txt
storage/generated-images/
storage/batches/
```

### Voiceover & Subtitles

Gestiona audio de narracion, voz por escena o por segmento, subtitulos y captions.

Funciones principales:

- guardar informacion de voiceover manual
- generar voiceovers de escena con ElevenLabs
- generar solo escenas seleccionadas, faltantes o fallidas
- coser voiceovers por escena en un master
- crear segmentos de voiceover desde escenas
- generar/regenerar voiceover por segmento
- aplicar pacing y pausas
- generar subtitulos con alineacion de ElevenLabs
- combinar subtitulos de segmentos
- limpiar puntuacion de subtitulos
- elegir preset de captions
- exportar SRT, VTT, ASS y JSON de active-word captions

Archivos de audio:

```txt
storage/voiceovers/:videoId/
storage/voiceovers/:videoId/scenes/
storage/voiceovers/:videoId/segments/
```

### Render Draft

Renderiza un draft local con FFmpeg usando imagenes, audio y subtitulos.

Funciones principales:

- validar readiness del render
- ver diagnosticos de FFmpeg
- renderizar video draft
- reproducir preview local
- borrar draft
- marcar estado del render

Salida esperada:

```txt
storage/renders/:videoId/draft.mp4
```

Para captions quemadas se necesita un FFmpeg con filtro `ass`. Ver `docs/local-rendering.md`.

### Thumbnail

Gestiona el brief, conceptos, prompt final, generacion y estado de la miniatura.

Funciones principales:

- guardar thumbnail brief
- generar conceptos
- seleccionar concepto
- generar prompt final
- generar imagen con Google Flow
- guardar imagen final o URL
- resetear thumbnail

Archivos:

```txt
storage/thumbnails/:videoId/
```

### Metadata

Guarda `metadataJson` final o parcial. Este JSON alimenta el paquete exportado y cierra el estado editorial como `done`.

El boton de metadata copia el prompt del canal con el paquete actual del video: idea, script, escenas y metadata existente.

## Prompts

La generacion de prompts vive en `src/lib/video-prompts.ts`.

Kinds soportados:

- `angle-builder`
- `script-writer`
- `visual-planner`
- `metadata-writer`

Endpoint:

```txt
/api/videos/:id/prompts/:kind
```

Los botones `Copy ... Prompt` no llaman directamente a un modelo. Construyen texto contextual listo para copiar y pegar en ChatGPT u otro LLM.

Cada prompt se compone con secciones separadas por `---`. Segun la etapa puede incluir:

- `Channel Profile`
- `Project Bible`
- `Image Prompt Bible`
- `Character Bible`
- instrucciones de categoria para Wealth Insights
- prompt base de la etapa
- datos actuales del video
- escenas actuales
- metadata existente

### Regla Para Crear Nuevos Prompts

Cuando generes prompts nuevos para un canal, deben respetar:

- la identidad del canal en `docs/channels/<channel>/project-bible.md`
- la consistencia visual en `image-prompt-bible.md`
- personajes/host en `character-bible.md`, si existe
- el contrato de salida de cada etapa
- el estado real que la app guarda en Prisma

No conviene pedir al LLM texto libre si la app espera JSON. Tampoco conviene meter instrucciones contradictorias con el canal activo.

## Contratos De Salida Para LLMs

### Angle Builder

Debe devolver un JSON estructurado para guardar en `Video.ideaJson`.

Campos recomendados:

```json
{
  "rawIdea": "",
  "workingTitle": "",
  "topicCategory": "",
  "coreAngle": "",
  "uniqueMechanism": "",
  "viewerProblem": "",
  "emotionalHook": "",
  "centralQuestion": "",
  "mainPromise": "",
  "simpleThesis": "",
  "whyNow": "",
  "visualAnchor": "",
  "thumbnailIdea": "",
  "repetitionRisk": "",
  "titleOptions": [],
  "thumbnailConcepts": [],
  "scriptDirection": {},
  "avoid": []
}
```

Para Wealth Insights, la idea debe explicar un mecanismo unico y evitar consejo financiero directo.

### Script Writer

Debe devolver solo la narracion final del video. No debe devolver JSON, encabezados tecnicos, notas de direccion ni markdown innecesario, salvo que el prompt del canal lo pida explicitamente.

La app guarda el resultado en `Video.script`.

### Visual Planner

Debe devolver escenas importables. La app acepta un array directo o un objeto con propiedad `scenes`.

Formato recomendado:

```json
{
  "scenes": [
    {
      "scriptText": "",
      "sceneType": "avatar",
      "visualPurpose": "",
      "visualIdea": "",
      "duration": 8,
      "imagePrompt": "",
      "status": "planned"
    }
  ]
}
```

Reglas importantes:

- `scriptText` debe contener el fragmento de narracion de esa escena.
- `sceneType` debe ser `avatar`, `insert` o `space`.
- `visualPurpose` explica para que sirve la escena narrativamente.
- `visualIdea` describe la imagen o composicion.
- `imagePrompt` debe ser util para generar el asset.
- `duration` es en segundos.

### Scene Patch

Cuando se quiera corregir solo parte del plan visual, conviene usar patches en vez de reemplazar todo. Un patch debe identificar escenas por `id` u `order` y proponer campos modificados.

Campos seguros para modificar:

- `scriptText`
- `sceneType`
- `visualPurpose`
- `visualIdea`
- `imagePrompt`
- `duration`
- `status`

### Metadata Writer

Debe devolver JSON valido para guardar en `Video.metadataJson`.

Campos recomendados:

```json
{
  "youtubeTitle": "",
  "description": "",
  "chapters": [],
  "tags": [],
  "thumbnailText": "",
  "pinnedComment": "",
  "shortDescription": ""
}
```

## Modelo De Datos

Archivo: `prisma/schema.prisma`

Modelos principales:

- `Video`: pieza completa.
- `TopicIdea`: idea editorial guardada para Wealth Insights.
- `Scene`: unidad visual ordenada.
- `ImageBatch`: batch de imagenes.
- `VoiceoverSegment`: segmento de narracion y audio.
- `SubtitleSegment`: subtitulos alineados a un segmento.
- `RenderDraft`: salida de render local.
- `ProcessRun`: tracking de procesos largos.

### Video

Campos clave:

- `channelKey`: canal del video.
- `topicCategory`: categoria editorial, usada especialmente por Wealth Insights.
- `topic`: idea base.
- `title`: titulo de trabajo.
- `ideaJson`: salida del Angle Builder.
- `script`: narracion completa.
- `metadataJson`: metadata final.
- `voiceoverAudioPath`, `voiceoverDurationSec`, `voiceoverStatus`: estado de audio master.
- `formattedSubtitleJson`, `styledSubtitleJson`, `styledSubtitleAss`: subtitulos y captions.
- `renderDraftStatus`: estado del render.
- `thumbnail*`: brief, prompt, imagen y estado de miniatura.

### Scene

Campos clave:

- `sortOrder`: orden narrativo, mapeado en SQLite como columna `order`.
- `scriptText`: texto narrado en esa escena.
- `sceneType`: `avatar`, `insert` o `space`.
- `visualPurpose`: funcion narrativa.
- `visualIdea`: composicion visual.
- `imagePrompt`: prompt para imagen.
- `duration`: duracion estimada.
- `imageStatus`, `imageLocalPath`, `imageFileName`, `imageError`: estado de imagen.
- `voiceoverStatus`, `voiceoverLocalPath`, `voiceoverDuration`: audio por escena.
- `pauseAfterMs`: pausa despues de la escena.
- `status`: estado editorial de la escena.

## Estructura Del Proyecto

```txt
.
|-- docs
|   |-- channels
|   `-- local-rendering.md
|-- prisma
|   |-- migrations
|   |-- schema.prisma
|   `-- dev.db
|-- prompts
|   |-- _legacy
|   `-- channels
|-- src
|   |-- app
|   |   |-- actions.ts
|   |   |-- api
|   |   |-- page.tsx
|   |   `-- videos
|   |-- components
|   `-- lib
`-- storage
    |-- batches
    |-- generated-images
    |-- renders
    |-- thumbnails
    `-- voiceovers
```

## APIs Locales

Endpoints principales:

- `/api/videos/:id/prompts/:kind`: devuelve el prompt completo para una etapa.
- `/api/videos/:id/export-package`: descarga el paquete JSON completo del video.
- `/api/videos/:id/draft-preview`: sirve el draft renderizado.
- `/api/generated-images/:videoId/:fileName`: sirve imagenes generadas.
- `/api/generated-audio/...`: sirve audio generado.
- `/api/thumbnails/:videoId/:fileName`: sirve thumbnails.
- `/api/image-batches/:id/payload`: descarga payloads de batch.
- `/api/process-runs`: estado de procesos.

## Export Video Package

El boton `Export Video Package` descarga un JSON con:

- datos base del video
- canal y categoria
- `ideaJson` parseado
- `topicIdea` enlazada, si existe
- script
- escenas ordenadas
- voiceover master y segmentos
- subtitulos por segmento y combinados
- captions SRT/VTT/ASS/active-word JSON
- render draft
- thumbnail
- `metadataJson` parseado
- `exportedAt`

Este paquete es el mejor snapshot para pasar a otro proceso o LLM cuando se necesita contexto completo del video.

## Comandos

Instalar dependencias:

```bash
npm install
```

Levantar desarrollo:

```bash
npm run dev
```

Build de produccion:

```bash
npm run build
```

Generar Prisma Client:

```bash
npm run prisma:generate
```

Migraciones:

```bash
npm run prisma:migrate
```

Seed local:

```bash
npm run db:seed
```

Prisma Studio:

```bash
npm run prisma:studio
```

## Entorno

Ejemplo portable:

```env
DATABASE_URL="file:./dev.db"
```

La base local actual esta en:

```txt
prisma/dev.db
```

Para ElevenLabs o Google Flow se requieren las variables/API keys correspondientes segun la integracion que se vaya a usar. La app tambien permite trabajar de forma manual copiando prompts e importando resultados.

## Render Local

Render Draft usa FFmpeg.

Instalacion basica en macOS:

```bash
brew install ffmpeg
```

Para quemar captions ASS con active-word highlight, se necesita un build con `libass`. Ver:

```txt
docs/local-rendering.md
```

## Notas De Desarrollo

No ejecutes `npm run build` mientras `npm run dev` sigue corriendo. Ambos escriben en `.next` y pueden dejar errores de runtime.

Si ocurre un error raro de `.next`, para el dev server y limpia cache:

```bash
rm -rf .next
npm run dev
```

Si aparece `Server Action was not found on the server`, normalmente el navegador envio un formulario viejo despues de recompilar. Recarga la pagina completa.

## Guia Rapida Para Otro LLM

Si eres un LLM ayudando a crear prompts para esta app:

1. Identifica el canal (`channelKey`) y lee su project bible, image prompt bible y character bible si existe.
2. Respeta la etapa: Angle Builder produce JSON de idea, Script Writer produce narracion, Visual Planner produce escenas JSON, Metadata Writer produce metadata JSON.
3. No mezcles reglas de Wealth Insights con Christian Life.
4. No devuelvas texto explicativo cuando la app necesita JSON importable.
5. Usa los nombres de campos reales: `ideaJson`, `scriptText`, `sceneType`, `visualPurpose`, `visualIdea`, `imagePrompt`, `duration`, `metadataJson`.
6. Para Wealth Insights, prioriza claridad, mecanismo unico, ejemplos visuales y cero consejo financiero directo.
7. Para Visual Planner, piensa en escenas generables: composicion clara, duracion concreta y prompt de imagen accionable.
8. Para metadata, genera JSON valido y util para YouTube, no una lista informal.

La meta de la app es que el proceso sea repetible: cada prompt debe producir una salida que pueda pegarse, validarse, importarse y seguir avanzando en la pipeline.
