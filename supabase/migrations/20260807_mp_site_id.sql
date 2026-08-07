-- País de la cuenta de Mercado Pago del médico (caso real 07/08/2026).
--
-- Un médico tenía conectada una cuenta de Mercado Pago de otro país: todas sus
-- preferencias salían en la moneda y el checkout de ese país, así que ningún
-- paciente argentino podía pagarle — y no lo detectaba nadie. Guardamos el sitio
-- que devuelve GET https://api.mercadopago.com/users/me para poder verlo en el
-- panel y para que el cron diario (verificar-cuentas-mp) tenga dónde marcarlo.
--
-- NADA depende de estas columnas para funcionar: el código las escribe y las lee
-- best-effort (UPDATE aparte, SELECT aparte) justamente para poder deployarse
-- ANTES de aplicar esta migración sin romper el OAuth ni el panel de médicos.

ALTER TABLE medicos_mp_accounts
  ADD COLUMN IF NOT EXISTS site_id TEXT,
  ADD COLUMN IF NOT EXISTS site_verificado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS site_extranjera_desde TIMESTAMPTZ;

COMMENT ON COLUMN medicos_mp_accounts.site_id IS
  'Sitio de Mercado Pago de la cuenta conectada (users/me → site_id). MLA = Argentina, único válido para cobrar en Docto. NULL = todavía no verificada.';
COMMENT ON COLUMN medicos_mp_accounts.site_verificado_at IS
  'Última vez que se confirmó el país de la cuenta contra la API de Mercado Pago.';
COMMENT ON COLUMN medicos_mp_accounts.site_extranjera_desde IS
  'Desde cuándo sabemos que la cuenta es de otro país. Alimenta la cadencia del mail de alerta (diario los primeros 3 días, después semanal) para que un rojo permanente no se vuelva paisaje. Se borra al volver a ser argentina o al desconectar.';
