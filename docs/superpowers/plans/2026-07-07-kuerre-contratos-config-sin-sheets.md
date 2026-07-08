# Kuerre: portar config de contratos sin sheets (fix generación rota)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Kuerre vuelve a generar contratos: portar a `brands/kuerre` la simplificación de config que CRP ya tiene (patches 16–18 de `brands/crp`) y limpiar la config cloud con IDs de sheets inaccesibles.

**Causa raíz:** `crd_contratos_cfg` de kuerre manda `systemSheetId`/`presupuestosId` de planillas de la cuenta kuerre.digital, no compartidas con cristian.romero.digital (cuenta que corre el GAS `AKfycbzBVU7...`). Google devuelve página "sin permiso" sin CORS → el admin muestra "Error de conexión con Apps Script". Verificado por curl: POST sin esos params genera OK (contrato 6015, borrado), con ellos devuelve la página de error.

**Arquitectura:** El GAS queda intacto (usa su planilla default interna de CRP para numeración/cláusulas/carpetas — invisible al admin). Kuerre pasa a config solo-URL como CRP. Historial/servicios/solicitudes siguen en D1.

## Global Constraints
- NO tocar el deployment GAS `AKfycbzBVU7...` (prod de ambas marcas).
- NO deployar el WIP sin commitear de CORE `src/admin.html` (auto-creación de carpetas post-generar) — stashear antes de buildear.
- Build solo kuerre (`node build-admin.cjs kuerre`) — no regenerar CRP.
- Versión kuerre: V1.67 → V1.68 (patch 1 del config).
- Deploy kuerre = Productivo + main + gh-pages (memoria feedback_deploy_gh_pages).

---

### Task 1: Stash del WIP en CORE
- [ ] `cd /e/CLAUDE/CORE && git stash push -m "WIP carpetas auto-create post-generar" src/admin.html`
- [ ] Verificar `git status` limpio en src/admin.html.

### Task 2: Portar patches a brands/kuerre/config.json
**Files:** Modify: `e:\CLAUDE\CORE\brands\kuerre\config.json`
- [ ] Cambiar patch 1 replace `>V1.67<` → `>V1.68<`.
- [ ] Copiar los patches 16, 17 y 18 de `brands/crp/config.json` (comments "15. Contratos config HTML simplificado", "16. ctSaveCfg JS simplificado — primera linea", "17. ctSaveCfg JS simplificado — body") al final del array de patches de kuerre, textuales.
- [ ] Revisar que el patch 37 de kuerre (driveRoot hardcodeado en cmCrearCarpetas) no dependa del campo `ct-drive-root-id` eliminado.

### Task 3: Build y verificación del output
- [ ] `node build-admin.cjs kuerre` — debe terminar sin "Patch not found".
- [ ] Verificar en `WEB KUERRE/Desarrollo/admin.html`: contiene `>V1.68<`, NO contiene `ct-drive-root-id` ni `ct-system-sheet-id`, y `ctSaveCfg` guarda `{ url }`.
- [ ] Verificar que initContratosPage no referencie los inputs eliminados (no debe romper JS al abrir la página). Si referencia `ct-drive-root-id`/etc. fuera del bloque parcheado, portar también ese patch de CRP (verificar cómo lo resuelve CRP — mismo build sin error implica que CRP tampoco lo referencia).

### Task 4: Limpiar config cloud de kuerre
- [ ] KV: `PUT crd_contratos_cfg` = `{"url":"https://script.google.com/macros/s/AKfycbzBVU7Kt0Y2gCZ6y0T0JCX6mJjRPZCVUsIOSBcyjqPyYESVLfYJp-v9xYqY4r50Aj3U/exec"}` en namespace `d6467ee2136446f48c6bc2527d1e68a4` (token CF_API_TOKEN_KUERRE).
- [ ] D1: verificar si `fetchFromCloud` lee `/config/crd_contratos_cfg` de D1 primero; si la tabla config de KUERRE_DB tiene la clave, actualizarla también (via worker `POST /config/:key` con JWT, o pedirle al usuario un clic en "Guardar URL" tras el deploy).

### Task 5: Test de generación kuerre-style
- [ ] `curl POST` al GAS con payload CUMPLE SIN systemSheetId/presupuestosId → esperar `{"ok":true,"numero":N}`.
- [ ] Borrar el contrato de prueba: `{"action":"deleteContrato","numero":N}` + `{"action":"trashFiles",...}` → `{"ok":true}` ×2.

### Task 6: Commit + deploy
- [ ] CORE: `git add brands/kuerre/config.json docs/superpowers/plans/2026-07-07-*.md && git commit` (mensaje descriptivo con causa raíz).
- [ ] WEB KUERRE: commit Desarrollo+Productivo admin.html "fix: contratos config solo-URL como CRP — sheets de cuenta kuerre inaccesibles rompían la generación (V1.68)". Push main.
- [ ] Sync worktree gh-pages y push (deploy real de kuerre.com.ar).
- [ ] Verificar V1.68 en https://kuerre.com.ar/admin.html (cache GH Pages ~10 min).

### Task 7: Verificación con el usuario
- [ ] Usuario prueba generar contrato en kuerre (hard refresh) y en CRP.
- [ ] Recordarle: borrar contrato basura 6009 "wqreewr" desde el admin kuerre (botón Borrar). NO tocar 6010/6011 (clientes reales).
