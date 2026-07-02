# Calendario CRP — Eliminar fechas + Sync bidireccional con Google Calendar

**Fecha:** 2026-07-02
**Alcance:** WEB CRP (worker + GAS + CORE admin). KUERRE hereda la UI de CORE en su próximo build, pero la sync automática se implementa solo en el worker CRP en esta fase.

## Objetivo

1. Poder eliminar una fecha agendada desde el admin (panel del día y Próximas fechas), borrándola de D1 y de Google Calendar.
2. Sync bidireccional automática entre la agenda del sistema y Google Calendar: lo creado/borrado/movido en GCal impacta en el sistema, y viceversa, sin intervención manual. El botón "Sincronizar" queda como disparo inmediato.

## Decisiones tomadas (con el usuario)

- **Alta desde GCal:** cualquier evento creado a mano en GCal se importa al sistema como entrada genérica tipo "nota" (no hace falta formato de título).
- **Borrado desde GCal:** GCal manda — si un evento del sistema ya no está en GCal, se limpia en D1. La sync devuelve resumen de lo aplicado.
- **Automático:** reconciliación en el cron del worker CRP cada 10 minutos; el botón llama al mismo módulo.

## Arquitectura

### Fuente del problema actual
La sync existente (GAS `syncCalendar`) solo crea eventos deduplicando por título+día y no guarda el ID del evento de GCal. Sin ID no se puede distinguir "borrado en GCal" de "nunca sincronizado", ni detectar renombres/movimientos. Se agrega tracking de IDs.

### Nuevas tablas D1 (crclub-db)

```sql
CREATE TABLE IF NOT EXISTS gcal_map (
  solicitud_id TEXT NOT NULL,
  tipo         TEXT NOT NULL,            -- evento|book|civil|religiosa
  gcal_id      TEXT NOT NULL,
  PRIMARY KEY (solicitud_id, tipo)
);

CREATE TABLE IF NOT EXISTS agenda (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo     TEXT NOT NULL,
  fecha      TEXT NOT NULL,              -- YYYY-MM-DD
  hora       TEXT DEFAULT '',            -- HH:MM
  lugar      TEXT DEFAULT '',
  gcal_id    TEXT UNIQUE,                -- evento externo importado de GCal
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Módulo de sync en el worker CRP (`calendarSync(env)`)

Corre en el cron (cada 10 min, gateado por minuto) y bajo demanda vía `POST /calendario/sync` (admin JWT).

1. **Leer estado del sistema desde D1:** fechas de evento (`eventos.fecha` vía `solicitudes.evento_id`), book, civil, religiosa + `gcal_map` + `agenda`.
2. **Leer URL del GAS** desde la config sincronizada (`crd_contratos_cfg` en el storage del worker). Si no hay URL configurada, la sync se saltea silenciosamente (cron) o devuelve error claro (botón).
3. **Llamar al GAS** `action=fullSync` (POST server-side, sin JSONP) con:
   - `system`: lista de `{ key: solicitud_id+tipo, titulo, fecha, hora, lugar, gcal_id|null }`
   - `known_external_ids`: gcal_ids de la tabla `agenda`
   - `calendarId` de la config (mismo criterio que hoy)
4. **El GAS responde** con: `created` (nuevos gcal_id para system sin id), `deleted` (keys del sistema cuyo gcal_id ya no existe), `moved` (keys con fecha/hora nueva tomada de GCal), `externals_new` (eventos de GCal sin mapear: gcal_id, titulo, fecha, hora, lugar), `externals_gone` (gcal_ids de agenda que ya no están).
   - Ventana de escaneo GCal: hoy−1 mes → hoy+24 meses.
5. **Aplicar a D1:** guardar ids en `gcal_map`; limpiar fechas de `deleted` (evento → `eventos.fecha=''`; book/civil/religiosa → limpiar campos) y quitar su fila de `gcal_map`; actualizar fechas de `moved`; insertar `externals_new` en `agenda`; borrar `externals_gone` de `agenda`.
6. Devolver resumen `{ created, deleted, moved, imported, removed }`.

### Push inmediato desde el admin

- Al guardar una fecha (`/agendar`): el worker, además del update en D1, empuja a GCal vía GAS (`createOrUpdate` con gcal_id si existe) usando `ctx.waitUntil` para no demorar la respuesta. Reemplaza el `calSyncEvento` JSONP del frontend (se elimina esa llamada del admin).
- Al borrar una fecha (nuevo `DELETE /solicitudes/:id/agendar?tipo=X` y `DELETE /agenda/:id`): limpia D1 + borra en GCal por gcal_id (`ctx.waitUntil`).

### Acciones nuevas en el GAS (Code.gs + SheetService.gs)

- `fullSync(payload)` — reconciliación descrita arriba. Identifica eventos del sistema por gcal_id (no por título).
- `upsertCalendarEvent(ev)` — crea o actualiza por gcal_id; devuelve gcal_id.
- `deleteCalendarEvent(gcal_id)` — borra; tolera "ya no existe".

Se editan en `WEB CRP/Productivo/Skills/ContractSystem/` y se deployan con clasp **verificando el script ID de CRP y probando después del deploy** (regla de memoria).

### UI (CORE admin.html)

- Botón 🗑 por entrada en el panel del día y en Próximas fechas, con `confirm()`. Para tipo nota borra de `agenda`; para el resto llama al DELETE de agendar.
- Tipo nuevo **nota** (gris `var(--gray)`, 📌) en grid, panel del día y próximas. Las notas vienen de `GET /agenda` (se suma al load del calendario).
- Botón "Sincronizar con Google Calendar" pasa a llamar `POST /calendario/sync` del worker y muestra el resumen (`X creados, Y borrados, Z importados…`).
- El calendario de CRP deja de leer `data_json` para civil/religiosa (CRP usa columnas `civil_*`/`reli_*`); verificar que loadCalendarioPage arma esos tipos desde los campos que el GET expone.

## Manejo de errores

- GAS caído / URL inválida: cron loguea y reintenta al próximo ciclo; botón muestra toast con el error.
- Borrado en GCal de un evento con contrato: se limpia la fecha igual (GCal manda, decisión del usuario); el resumen lo informa.
- Idempotencia: correr la sync dos veces seguidas no duplica nada (todo va por gcal_id).

## Testing

- Unit-style con wrangler local no cubre GAS; la verificación es end-to-end sobre el entorno real:
  1. Agendar en admin → aparece en GCal con ID mapeado.
  2. Borrar en admin → desaparece de GCal y de D1.
  3. Crear evento suelto en GCal → sync → aparece como nota en admin.
  4. Borrar en GCal (uno del sistema y una nota) → sync → se limpia en admin.
  5. Mover fecha en GCal → sync → fecha actualizada en admin.
  6. Correr sync dos veces → resumen segundo ciclo en cero.

## Fuera de alcance

- Sync automática para KUERRE (su worker no tiene este módulo aún; la UI queda lista vía CORE).
- Crear notas sin cliente desde el modal Agendar del admin.
- Recordatorios/notificaciones de GCal.
