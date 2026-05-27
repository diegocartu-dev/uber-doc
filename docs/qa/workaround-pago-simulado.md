# Workaround: Simular pago aprobado para QA E2E

## Cuando usar

El sandbox de Mercado Pago tiene problemas de redirect loops (ERR_TOO_MANY_REDIRECTS)
que bloquean el login de test users. Este workaround permite avanzar con el QA
del flujo post-pago (video, receta, PDF) sin depender del sandbox.

**SOLO PARA QA. JAMAS EN PRODUCCION.**

## Prerequisitos

- Consulta creada y en estado `aceptada` (el medico ya la acepto)
- Acceso a Supabase SQL Editor o script con SUPABASE_SERVICE_ROLE_KEY

## Opcion A: SQL directo en Supabase SQL Editor

```sql
-- Reemplazar CONSULTA_ID con el UUID de la consulta
UPDATE consultas
SET
  estado = 'pagada',
  pago_id = 'QA-SIMULATED-' || extract(epoch from now())::bigint,
  monto = 5000,
  mp_status = 'approved'
WHERE id = 'CONSULTA_ID'
  AND estado = 'aceptada';
```

## Opcion B: Script one-liner con Node

```bash
# Desde la raiz del proyecto, con .env.local configurado:
SRK="TU_SERVICE_ROLE_KEY" node -e "
const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://irpupskopjahbqqvckue.supabase.co', process.env.SRK);
s.from('consultas').update({
  estado: 'pagada',
  pago_id: 'QA-SIMULATED-' + Date.now(),
  monto: 5000,
  mp_status: 'approved'
}).eq('id', 'CONSULTA_ID').eq('estado', 'aceptada').then(({error}) => {
  console.log(error ? 'Error: ' + error.message : 'Pago simulado OK');
});
"
```

## Despues del pago simulado

1. Recargar la pagina del paciente — deberia ver la consulta como pagada
   y avanzar al paso siguiente (info medica -> consentimiento -> sala de espera)
2. El medico ve la consulta lista para atender en el dashboard
3. El webhook de MP NO se dispara (no hay pago real), pero el flujo
   no depende del webhook para avanzar — el estado ya esta en `pagada`

## Columnas relevantes de la tabla consultas

| Columna | Valor simulado | Descripcion |
|---|---|---|
| estado | 'pagada' | Estado del flujo |
| pago_id | 'QA-SIMULATED-{timestamp}' | Identificable como simulado |
| monto | 5000 | Precio de la consulta en pesos |
| mp_status | 'approved' | Status de MP |

## Notas

- El pago_id con prefijo QA-SIMULATED- permite identificar pagos falsos
  en caso de que se mezclen con datos reales por error
- No se genera registro en la tabla de pagos/transacciones porque no hay
  webhook — esto es intencional para QA
- Para testear el flujo de webhook/IPN por separado, usar la API de MP
  sandbox directamente (no este workaround)
