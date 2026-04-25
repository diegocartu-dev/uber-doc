-- Quality Gate: crear cuentas de prueba
-- Este script crea auth users + filas en pacientes/medicos con es_cuenta_test = true

-- ═══ MÉDICO DE PRUEBA ═══

-- Crear auth user para médico (si no existe)
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'medico.test@docto.com.ar';

  IF v_user_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated',
      'medico.test@docto.com.ar',
      crypt('DoctoTest2026!', gen_salt('bf')),
      now(),
      '{"full_name": "Dr. Docto Test", "role": "medico"}'::jsonb,
      now(), now(), '', '', '', ''
    )
    RETURNING id INTO v_user_id;

    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (v_user_id, v_user_id, v_user_id::text, jsonb_build_object('sub', v_user_id::text, 'email', 'medico.test@docto.com.ar'), 'email', now(), now(), now());

    RAISE NOTICE 'Médico auth user created: %', v_user_id;
  ELSE
    RAISE NOTICE 'Médico auth user already exists: %', v_user_id;
  END IF;

  -- Upsert médico row (all NOT NULL columns included)
  INSERT INTO medicos (
    user_id, email, nombre_completo, especialidad, slug,
    tipo_matricula, numero_matricula, titulo, modalidad_atencion,
    precio_consulta, duracion_consulta, disponible, verificado,
    estado_registro, oculto_clinica, es_cuenta_test
  ) VALUES (
    v_user_id, 'medico.test@docto.com.ar', 'Dr. Docto Test', 'Clínica Médica', 'docto-test',
    'MN', 'TEST-000', 'Dr.', 'ambas',
    10, 30, true, true,
    'aprobado', false, true
  )
  ON CONFLICT (user_id) DO UPDATE SET
    nombre_completo = EXCLUDED.nombre_completo,
    email = EXCLUDED.email,
    especialidad = EXCLUDED.especialidad,
    slug = EXCLUDED.slug,
    precio_consulta = EXCLUDED.precio_consulta,
    disponible = EXCLUDED.disponible,
    verificado = EXCLUDED.verificado,
    estado_registro = EXCLUDED.estado_registro,
    es_cuenta_test = true;

  RAISE NOTICE 'Médico row upserted';
END $$;


-- ═══ PACIENTES DE PRUEBA ═══

DO $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_nombre text;
  v_dni text;
  v_sexo text;
  v_fecha date;
  v_cobertura boolean;
  v_completo boolean;
  v_i int;
  v_emails text[] := ARRAY[
    'paciente.test1@docto.com.ar', 'paciente.test2@docto.com.ar',
    'paciente.test3@docto.com.ar', 'paciente.test4@docto.com.ar',
    'paciente.test5@docto.com.ar', 'paciente.test6@docto.com.ar',
    'paciente.test7@docto.com.ar', 'paciente.test8@docto.com.ar',
    'paciente.test9@docto.com.ar', 'paciente.test10@docto.com.ar'
  ];
  v_nombres text[] := ARRAY[
    'Paciente Test Normal', 'Paciente Test Sin OS',
    'Paciente Test Incompleto', 'Paciente Test Distraido',
    'Paciente Test Canceladora', 'Paciente Test Reprogramadora',
    'Paciente Test Interior', 'Paciente Test Ansiosa',
    'Paciente Test DNI Invalido', 'Paciente Test Mobile'
  ];
  v_dnis text[] := ARRAY[
    '30000001', '30000002', '30000003', '30000004', '30000005',
    '30000006', '30000007', '30000008', '30000009', '30000010'
  ];
  v_sexos text[] := ARRAY[
    'femenino', 'masculino', 'femenino', 'masculino', 'femenino',
    'femenino', 'femenino', 'femenino', 'masculino', 'femenino'
  ];
  v_fechas date[] := ARRAY[
    '1990-05-15'::date, '1985-03-20'::date, NULL::date, '1992-11-08'::date,
    '1988-07-25'::date, '1995-01-12'::date, '1983-09-30'::date,
    '1997-06-18'::date, '1991-12-05'::date, '1994-04-22'::date
  ];
BEGIN
  FOR v_i IN 1..10 LOOP
    v_email := v_emails[v_i];
    v_nombre := v_nombres[v_i];
    v_dni := v_dnis[v_i];
    v_sexo := v_sexos[v_i];
    v_fecha := v_fechas[v_i];
    v_cobertura := (v_i = 1); -- solo paciente 1 tiene cobertura
    v_completo := (v_i != 3); -- paciente 3 tiene perfil incompleto

    -- Check if auth user exists
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

    IF v_user_id IS NULL THEN
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(), 'authenticated', 'authenticated',
        v_email,
        crypt('DoctoTest2026!', gen_salt('bf')),
        now(),
        jsonb_build_object('full_name', v_nombre),
        now(), now(), '', '', '', ''
      )
      RETURNING id INTO v_user_id;

      INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (v_user_id, v_user_id, v_user_id::text, jsonb_build_object('sub', v_user_id::text, 'email', v_email), 'email', now(), now(), now());

      RAISE NOTICE 'Created auth user %: %', v_i, v_email;
    ELSE
      RAISE NOTICE 'Auth user % already exists: %', v_i, v_email;
    END IF;

    -- Upsert paciente row
    INSERT INTO pacientes (user_id, nombre_completo, email, dni, sexo_dni, fecha_nacimiento, tiene_cobertura, obra_social, nro_afiliado, perfil_medico_completado, es_cuenta_test)
    VALUES (
      v_user_id, v_nombre, v_email, v_dni, v_sexo, v_fecha,
      v_cobertura,
      CASE WHEN v_cobertura THEN 'OSDE' ELSE NULL END,
      CASE WHEN v_cobertura THEN 'TEST-001' ELSE NULL END,
      v_completo,
      true
    )
    ON CONFLICT (user_id) DO UPDATE SET
      nombre_completo = EXCLUDED.nombre_completo,
      email = EXCLUDED.email,
      dni = EXCLUDED.dni,
      sexo_dni = EXCLUDED.sexo_dni,
      fecha_nacimiento = EXCLUDED.fecha_nacimiento,
      tiene_cobertura = EXCLUDED.tiene_cobertura,
      obra_social = EXCLUDED.obra_social,
      nro_afiliado = EXCLUDED.nro_afiliado,
      perfil_medico_completado = EXCLUDED.perfil_medico_completado,
      es_cuenta_test = true;

    RAISE NOTICE 'Paciente % upserted: %', v_i, v_nombre;
  END LOOP;
END $$;
