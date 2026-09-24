/**
 * Tecnovigilancia HSDA — receptor de reportes
 * Recibe cada reporte de la app, envía un correo con el formato COFEPRIS (PDF) adjunto
 * y guarda una fila en la hoja "Registro" de esta hoja de cálculo.
 */

// Correo(s) que reciben los reportes. Por defecto, la cuenta dueña del script.
// Para agregar más: 'correo1@dominio.com, correo2@dominio.com'
const DESTINATARIOS = Session.getEffectiveUser().getEmail();
const HOJA = 'Registro';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const r = d.resumen || {};
    const pdf = Utilities.newBlob(Utilities.base64Decode(d.pdfBase64), 'application/pdf', d.archivo);

    const filas = [
      ['Folio', d.folio],
      ['Fecha del incidente', r.fechaIncidente],
      ['Fecha de notificación', r.fechaNotificacion],
      ['Área o servicio', r.area],
      ['Notifica (iniciales)', r.iniciales],
      ['Profesión', r.profesion],
      ['¿Presentó el incidente?', r.presento],
      ['Operador del dispositivo', r.operador],
      ['Paciente', r.paciente],
      ['Dispositivo', r.dispositivo],
      ['Marca / modelo', [r.marca, r.modelo].filter(Boolean).join(' / ')],
      ['Lote o serie', r.lote],
      ['Registro sanitario', r.registro],
      ['Fabricante / distribuidor', r.fabricante],
      ['Consecuencias', r.consecuencias],
      ['Descripción', r.descripcion]
    ];
    const tabla = filas.map(function (f) {
      return '<tr><td style="padding:6px 10px;color:#3C5775;font-weight:bold;vertical-align:top;white-space:nowrap">' +
        esc(f[0]) + '</td><td style="padding:6px 10px;color:#33394C">' + esc(f[1] || '—') + '</td></tr>';
    }).join('');
    const html =
      '<div style="font-family:Arial,sans-serif">' +
      '<h2 style="color:#3C5775;margin:0 0 12px">Nuevo reporte de tecnovigilancia</h2>' +
      '<table style="border-collapse:collapse;font-size:14px">' + tabla + '</table>' +
      '<p style="color:#5C6275;font-size:13px">Se adjunta el formato COFEPRIS de notificación llenado.</p></div>';

    MailApp.sendEmail({
      to: DESTINATARIOS,
      subject: '[Tecnovigilancia] ' + d.folio + ' · ' + (r.dispositivo || '') + ' · ' + (r.area || ''),
      htmlBody: html,
      attachments: [pdf],
      name: 'Tecnovigilancia HSDA'
    });

    registrar(d, r);
    return json({ ok: true, folio: d.folio });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json({ ok: true, servicio: 'Tecnovigilancia HSDA' });
}

function registrar(d, r) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  const sh = ss.getSheetByName(HOJA) || ss.insertSheet(HOJA);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Recibido', 'Folio', 'Fecha incidente', 'Área', 'Iniciales', 'Profesión', 'Operador',
      'Paciente', 'Dispositivo', 'Marca', 'Modelo', 'Lote/serie', 'Registro sanitario', 'Fabricante',
      'Consecuencias', 'Descripción', 'Estado']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([new Date(), d.folio, r.fechaIncidente, r.area, r.iniciales, r.profesion, r.operador,
    r.paciente, r.dispositivo, r.marca, r.modelo, r.lote, r.registro, r.fabricante,
    r.consecuencias, r.descripcion, 'Recibido']);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
