# Mercado Pago Marketplace — Guía de Reactivación

> **Estado actual**: DESACTIVADO (flag `pago_marketplace = false`)  
> **Desactivado el**: 2026-05-28  
> **Motivo**: flujo de testing usa simulación de pago para agilidad. MP se reactiva cuando se vaya a producción con pacientes reales.

---

## 1. Cómo funciona el flujo de pagos

### Con MP activado (`pago_marketplace = true`)
```
Paciente toca "Pagar" → POST /api/pago/crear-v2
  → Crea preferencia en MP con token OAuth del médico
  → Retorna init_point (prod) o sandbox_init_point (test)
  → Paciente redirige al checkout de MP
  → MP cobra, retiene comisión Docto, deposita al médico
  → Webhook POST /api/pago/webhook notifica resultado
  → Consulta transiciona: aceptada → pagada
```

### Con MP desactivado (estado actual)
```
Paciente toca "Pagar" → POST /api/pago/crear-v2 retorna 503
  → Fallback a POST /api/pago/simular
  → Consulta transiciona: aceptada → pagada (sin cobro real)
  → Paciente redirige a info-medica → confirmación
```

---

## 2. Archivos del flujo MP

| Archivo | Función |
|---------|---------|
| `src/app/api/pago/crear-v2/route.ts` | Crea preferencia MP con token del seller. Usa `sandbox_init_point` si `live_mode=false` |
| `src/app/api/pago/webhook/route.ts` | Recibe webhooks de MP. HMAC SHA-256. Transiciona consulta/turno |
| `src/app/api/mp/oauth/callback/route.ts` | OAuth callback. Guarda tokens encriptados. Valida `live_mode` vs entorno |
| `src/app/api/mp/oauth/iniciar/route.ts` | Inicia flujo OAuth para conectar cuenta MP del médico |
| `src/app/api/mp/desconectar/route.ts` | Desconecta cuenta MP del médico |
| `src/app/api/pago/simular/route.ts` | Simulación de pago (sin MP). Transiciona estado directamente |
| `src/app/sala-espera/[consultaId]/SalaEsperaCliente.tsx` | UI del paciente. Intenta MP, fallback a simular |
| `src/lib/feature-flags.ts` | Sistema de flags. `pago_marketplace` controla crear-v2 |
| `src/lib/mp-crypto.ts` | Encriptación AES-256-GCM para tokens MP |
| `src/lib/mp-error-sanitizer.ts` | Sanitiza errores de MP para logging (sin tokens) |
| `src/lib/comisiones.ts` | Calcula comisión Docto por médico |

---

## 3. Cuentas MP vinculadas en DB

```sql
SELECT medico_id, mp_user_id, live_mode, estado, expires_at
FROM medicos_mp_accounts
WHERE estado = 'activo';
```

Al momento de desactivar:
- `f52f79f9` — mp_user `3410484183` — producción (`live_mode=true`) — activa
- `f9a9644d` — mp_user `3405160162` — sandbox (`live_mode=false`) — activa

---

## 4. Variables de entorno necesarias

### Producción (Vercel)
| Variable | Descripción |
|----------|-------------|
| `MP_CLIENT_ID` | App ID de Docto en MP (8893156415936925) |
| `MP_CLIENT_SECRET` | Secret de la app MP |
| `MP_ACCESS_TOKEN` | Token de la app Docto (owner 28443305, cuenta MP personal de Diego, nickname GREBA — RI persona física, sin SRL; cuenta compartida con el emprendimiento GREBA por decisión consciente) |
| `MP_ACCESS_TOKEN_TEST` | Token test de la app (sandbox) |
| `MP_WEBHOOK_SECRET` | Secret para validar HMAC de webhooks |
| `MP_TOKEN_ENCRYPTION_KEY` | Clave AES-256 para encriptar tokens OAuth |
| `MP_OAUTH_REDIRECT_URI` | URL de callback OAuth (debe coincidir con MP panel) |
| `MP_TEST_SELLERS_WHITELIST` | Lista de mp_user_ids test permitidos en producción |

### Preview (para testing)
| Variable | Estado |
|----------|--------|
| `OVERRIDE_FLAG_PAGO_MARKETPLACE` | **ELIMINADA** (antes forzaba `true` en preview) |

---

## 5. Checklist de reactivación

### Pre-requisitos
- [ ] Definir comisión Docto definitiva (hoy en `comisiones.ts`)
- [ ] Verificar que los tokens OAuth de los médicos no expiraron (`expires_at`)
- [ ] Si expiraron: los médicos deben reconectar desde `/medico/perfil?tab=cobros`
- [ ] Verificar que `MP_WEBHOOK_SECRET` en Vercel coincide con el configurado en panel MP

### Activar
1. **Flag en DB**:
   ```sql
   UPDATE feature_flags SET activo = true WHERE key = 'pago_marketplace';
   ```
2. **Verificar** que NO existe `OVERRIDE_FLAG_PAGO_MARKETPLACE` en Vercel env vars
3. **Testing**: crear una consulta, verificar que "Pagar" redirige a checkout MP

### Rollback inmediato
```sql
UPDATE feature_flags SET activo = false WHERE key = 'pago_marketplace';
```
Cache de flags es 5 segundos — el rollback es efectivo en <10s.

---

## 6. Limitaciones conocidas de MP sandbox

### OAuth + marketplace no funciona en sandbox
- OAuth **sin** `test_token:true` → token `APP_USR-` con `live_mode:true` → no procesa pagos de test users
- OAuth **con** `test_token:true` → token autentica como APP OWNER (28443305), no como seller
- **Conclusión**: no se puede hacer E2E completo en sandbox con marketplace. Solo se puede testear con dinero real o con simulación.

### CVV iframe PCI
El campo CVV del checkout de MP usa un iframe PCI-compliant que bloquea automatización. Cualquier test E2E de checkout requiere intervención humana.

### sandbox_init_point
`crear-v2` ya soporta `sandbox_init_point` — usa `mpAccount.live_mode` para decidir qué URL devolver. Cuando un seller tiene `live_mode=false`, el paciente va al checkout sandbox.

---

## 7. Webhook — validación HMAC

Verificado y funcionando (4/4 tests pasan). Formato del manifest:
```
id:{dataId};request-id:{requestId};ts:{ts};
```

HMAC SHA-256 con `MP_WEBHOOK_SECRET`. Signature viene en header `x-signature` formato `ts={ts},v1={hmac}`.

### Acciones que procesa
| Action | Resultado |
|--------|-----------|
| `payment.created` / `payment.updated` | Fetch payment de MP API → transiciona consulta/turno |
| `application.deauthorized` | Marca cuenta MP como revocada |
| Otros | Ignora (200 OK) |

### Estados de pago
| Status | Acción en DB |
|--------|-------------|
| `approved` | consulta → `pagada`, turno → `confirmado` |
| `rejected` | Solo actualiza `mp_status` |
| `refunded` | Solo actualiza `mp_status` |
| `charged_back` | Alerta crítica + tracking |

---

## 8. Token refresh

No implementado. Los tokens OAuth de MP tienen `expires_in` (~6 meses). Cuando expiran:
- `crear-v2` detecta token expirado → marca cuenta como `expirado`
- Si MP rechaza con 401 → marca como `revocado` + alerta a Docto
- El médico debe reconectar desde su perfil

**TODO para producción**: implementar cron de refresh automático antes de expiración.
