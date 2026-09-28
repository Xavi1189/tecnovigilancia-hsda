# Video informativo · Tecnovigilancia HSDA

`guia-tecnovigilancia-hsda.mp4` (1920×1080, ~6 min, sin audio, con textos en pantalla) enseña al personal a reportar un incidente con un dispositivo médico en la app y muestra los errores de llenado más comunes junto con su corrección.

Se grabó sobre la app real (`index.html`) con un **caso ficticio**: en UCI, una bomba de infusión no suena la alarma de oclusión. No se envió ningún correo, porque el envío al Apps Script se intercepta durante la grabación.

## Contenido

| Parte | Qué se ve |
|---|---|
| Portada | Título y Unidad de Tecnovigilancia |
| ¿Por qué reportar? | NOM-240-SSA1-2012: todo incidente o sospecha se notifica |
| Fácil y accesible | Vista en celular. No pide usuario ni contraseña, son 6 pasos guiados, acepta dictado por voz y genera el formato COFEPRIS |
| Paso 1 · ¿Quién reporta? | ✗ Avanzar sin llenar los campos obligatorios → ✓ iniciales empezando por el apellido paterno, área, profesión |
| Paso 2 · Operador y paciente | ✗ Nombre completo del paciente → ✓ solo iniciales o clave · ✗ estatura 1.68 → ✓ 168 cm |
| Paso 3 · ¿Qué pasó? | ✗ Sin fecha del incidente (es la fecha en que ocurrió) · ✗ “Otros” sin especificar |
| Paso 4 · Descripción | ✗ “No sirvió la bomba.” → ✓ qué se hacía, qué falló, qué se observó en el paciente, qué se hizo |
| Paso 5 · Dispositivo | ✗ “Bomba” → ✓ nombre completo, lote o serie y registro de la etiqueta |
| Paso 6 · Finalizar | ✗ Tirar el dispositivo → ✓ separarlo y etiquetarlo con el folio. Envío y folio |
| Formato COFEPRIS | El PDF oficial que la app llenó con los datos |
| Repaso | Tabla de errores comunes: evita / mejor |
| Cierre | “Ante la duda, repórtalo”, con el código QR y el enlace de la app |

## Volver a grabarlo

Si la app cambia, se puede regenerar el video. Hace falta node con `playwright` y Chromium, `ffmpeg`, python3 con `pymupdf`, y `pdf-lib` 1.17.1 instalado con npm.

```sh
npm i pdf-lib@1.17.1 playwright
pip install pymupdf
node video/grabar-video.js          # escribe video/guia-tecnovigilancia-hsda.mp4
```

Variables opcionales: `FFMPEG`, `PDFLIB_JS`, `PLAYWRIGHT`, `OUT`, `WORK`. Los textos y los tiempos de cada escena están en `grabar-video.js`.
