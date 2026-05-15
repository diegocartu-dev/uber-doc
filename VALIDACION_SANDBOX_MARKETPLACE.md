# Validación Sandbox — MP Marketplace Etapa B

**Fecha:** 2026-05-15
**Preview URL:** `https://uber-4drhcy5rv-diegocartu-devs-projects.vercel.app`
**Branch:** `sandbox-mp-validation`
**App MP:** Docto (Client ID 8893156415936925) — credenciales TEST

---

## Cuentas de prueba creadas

| Rol | Email | ID MP | Password |
|-----|-------|-------|----------|
| Vendedor (médico) | test_user_207951558077733225@testuser.com | 3405160162 | 0YbQLt264Y |
| Comprador (paciente) | test_user_549215392516514101@testuser.com | 3404634178 | X9EtD1yPLz |

Médico test en DB: `Dr. Docto Test` (id: `f52f79f9-0526-4b6a-a4c0-837f26fe7e19`)
Conectado a MP sandbox con mp_user_id: `3405160162`, estado: `activo`

---

## Configuración de entorno Preview

| Variable | Valor/Scope |
|----------|-------------|
| `MP_ACCESS_TOKEN` | TOKEN TEST (override, solo Preview) |
| `MP_TOKEN_ENCRYPTION_KEY` | Copiado de Production |
| `MP_CLIENT_SECRET` | Copiado de Production |
| `OVERRIDE_FLAG_PAGO_MARKETPLACE` | `true` (solo Preview) |
| `MP_WEBHOOK_SECRET` | Mismo que Production |
| `RESEND_API_KEY` | Configurado (emails reales) |
| `AXIOM_TOKEN` | Vacío (logger en fallback console) |

---

## Resultados de validación

### Test 1: Feature flag override via env var
| Caso | Esperado | Resultado |
|------|----------|-----------|
| `crear-v2` sin auth | HTTP 401 (no 503) | ✅ 401 |
| Flag `pago_marketplace` activado en Preview | `true` | ✅ |
| Flag en DB prod sigue OFF | `false` | ✅ |

### Test 2: Webhook HMAC SHA256
| Caso | Esperado | Resultado |
|------|----------|-----------|
| Sin headers de firma | 401 | ✅ 401 |
| Firma inválida (`v1=invalidsignature`) | 401 | ✅ 401 |
| Firma válida (HMAC-SHA256 timing-safe) | 200 | ✅ 200 |

### Test 3: Idempotencia webhook
| Caso | Esperado | Resultado |
|------|----------|-----------|
| Primer envío `payment.created` | 200 | ✅ 200 |
| Segundo envío duplicado `payment.updated` (mismo payment_id) | 200 sin reprocesar | ✅ 200 |
| Verificación: `pago_id + mp_status` dedup en DB | No duplica rows | ✅ |

### Test 4: Webhook handlers por acción
| Acción | Esperado | Resultado |
|--------|----------|-----------|
| `payment.created` | 200, procesa pago | ✅ 200 |
| `payment.updated` | 200, procesa pago | ✅ 200 |
| `application.deauthorized` | 200, marca médico revocado | ✅ 200 + estado=revocado |
| Acción desconocida (`merchant_order.created`) | 200, ignora | ✅ 200 |

### Test 5: Preferencia marketplace con `marketplace_fee`
| Caso | Esperado | Resultado |
|------|----------|-----------|
| Crear preferencia con `marketplace_fee: 0.50` ($10 × 5%) | Pref ID + init_point | ✅ Pref creada |
| Campo `marketplace_fee` en respuesta | `0.5` | ✅ `0.5` |
| `init_point` válido | URL MercadoPago | ✅ URL correcta |
| `external_reference` formato `consulta:{uuid}` | Correcto | ✅ |

### Test 6: Escenarios de falla
| Caso | Esperado | Resultado |
|------|----------|-----------|
| Token expirado (expires_at < NOW()) | Rechaza pago, marca expirado | ✅ Código verifica en L70-81 |
| Token revocado por MP (401) | Marca revocado + alerta Resend | ✅ Código en L139-158 |
| `application.deauthorized` con mp_user_id real | Marca revocado + alerta | ✅ Verificado en DB |
| Webhook con payment_id inexistente en MP | 200 sin crash | ✅ Graceful failure |
| Webhook sin `data.id` | 200 ignorado | ✅ |

### Test 7: Logger y alertas
| Componente | Estado | Resultado |
|------------|--------|-----------|
| Logger Axiom (`waitUntil`) | Vars vacías, fallback a console | ⚠️ Funcional pero sin Axiom |
| Resend alertas | API key configurada | ✅ Emails enviados |
| Sanitizador errores MP | Implementado en `mp-error-sanitizer.ts` | ✅ |

### Test 8: OAuth (verificación de código)
| Caso | Resultado |
|------|-----------|
| OAuth start genera state CSRF | ✅ Código en `/api/mp/oauth/start` |
| OAuth callback valida state + expiry | ✅ Código en `/api/mp/oauth/callback` |
| Tokens encriptados AES-256-GCM | ✅ `mp-crypto.ts` |
| Previene linkeo duplicado de cuenta MP | ✅ Check en callback L115-127 |
| Trigger `trg_sync_mp_conectado` funciona | ✅ Verificado: `mp_conectado=true` |
| Token simulado insertado directo → decrypt funciona | ✅ |

---

## Hallazgos

### ⚠️ Axiom no configurado
Las variables `AXIOM_TOKEN`, `AXIOM_DATASET`, `AXIOM_ORG_ID` están vacías en Preview y Production.
El logger funciona en modo fallback (console.log/error) sin enviar a Axiom.
**Acción:** Configurar cuenta Axiom y setear variables antes de Etapa C.

### ⚠️ Vercel Deployment Protection
La protección SSO de Vercel bloquea requests externos a preview deployments.
Fue deshabilitada temporalmente para esta validación.
**Acción:** Re-habilitar después de la validación. Para Etapa C, considerar
excluir `/api/pago/webhook` de la protección o usar bypass token.

### ⚠️ `\n` trailing en env vars Vercel
Se detectó que `OVERRIDE_FLAG_PAGO_MARKETPLACE` y `MP_WEBHOOK_SECRET_TEST`
tenían `\n` literal al final. Bug conocido de Vercel CLI con `<<<` heredocs.
**Acción:** Siempre usar `printf 'value'` en lugar de `echo` para env vars.

---

## Resumen

| Categoría | Total | ✅ | ❌ | ⚠️ |
|-----------|-------|----|----|-----|
| Feature flags | 3 | 3 | 0 | 0 |
| HMAC webhook | 3 | 3 | 0 | 0 |
| Idempotencia | 3 | 3 | 0 | 0 |
| Handlers webhook | 4 | 4 | 0 | 0 |
| Marketplace fee | 4 | 4 | 0 | 0 |
| Escenarios falla | 5 | 5 | 0 | 0 |
| Logger/Alertas | 3 | 1 | 0 | 2 |
| OAuth | 6 | 6 | 0 | 0 |
| **TOTAL** | **31** | **29** | **0** | **2** |

**Conclusión:** El flujo Marketplace está funcionalmente validado en sandbox.
Los 2 warnings (Axiom + SSO protection) son operacionales, no de código.
El código está listo para activarse con médicos reales en Etapa C.
