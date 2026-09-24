# Tecnovigilancia HSDA

Formulario de notificación de incidentes de dispositivos médicos (formato COFEPRIS, NOM-240-SSA1-2012) del Hospital San Diego de Alcalá.

- `index.html`: la aplicación.
- `formato-cofepris.pdf`: formato oficial que se llena.
- `mapa-formato.json`: posiciones de cada campo en el PDF.
- `apps-script-Codigo.gs`: copia del Apps Script que envía el reporte por correo (vive en Google, no en Vercel).

Vercel: comando de build `sh build.sh`, carpeta de salida `public`.
