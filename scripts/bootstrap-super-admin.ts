// scripts/bootstrap-super-admin.ts
// Ejecutar UNA SOLA VEZ con:
// SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/bootstrap-super-admin.ts

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_EMAIL = 'diegocartu@me.com';

async function bootstrap() {
  console.log('Verificando si el email ya existe en auth.users...');

  // Verificar si el usuario ya existe
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existing = existingUsers?.users?.find(u => u.email === ADMIN_EMAIL);

  let userId: string;

  if (existing) {
    console.log(`Usuario ${ADMIN_EMAIL} ya existe en auth.users con id ${existing.id}`);
    userId = existing.id;
  } else {
    // Generar contrasena inicial fuerte
    const tempPassword = randomBytes(16).toString('base64').replace(/[+/=]/g, '').slice(0, 20);

    // Crear usuario en auth.users
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        tipo: 'admin',
        bootstrap: true,
      },
    });

    if (userError) {
      console.error('Error creando usuario:', userError);
      process.exit(1);
    }

    userId = userData.user.id;
    console.log('====================================');
    console.log('USUARIO CREADO');
    console.log('Email:', ADMIN_EMAIL);
    console.log('Contrasena inicial:', tempPassword);
    console.log('====================================');
  }

  // Verificar que NO exista en pacientes ni medicos
  const { data: pacienteCheck } = await supabaseAdmin
    .from('pacientes')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle();

  if (pacienteCheck) {
    console.warn('ADVERTENCIA: Email existe como paciente. Procediendo de todas formas (admin puro).');
  }

  const { data: medicoCheck } = await supabaseAdmin
    .from('medicos')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle();

  if (medicoCheck) {
    console.warn('ADVERTENCIA: Email existe como medico. Procediendo de todas formas.');
  }

  // Verificar si ya es admin
  const { data: adminCheck } = await supabaseAdmin
    .from('admin_users')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (adminCheck) {
    console.log('Ya existe como admin en admin_users. No se duplica.');
    process.exit(0);
  }

  // Insertar en admin_users como super_admin
  const { error: adminError } = await supabaseAdmin
    .from('admin_users')
    .insert({
      user_id: userId,
      nivel: 'super_admin',
      activo: true,
      creado_por: null, // bootstrap: no hay quien lo creo
    });

  if (adminError) {
    console.error('Error creando admin_users:', adminError);
    process.exit(1);
  }

  console.log('====================================');
  console.log('SUPER ADMIN REGISTRADO EXITOSAMENTE');
  console.log('====================================');
  console.log('Email:', ADMIN_EMAIL);
  console.log('Nivel: super_admin');
  console.log('====================================');
  console.log('PASOS PARA DIEGO:');
  console.log('1. Ir a docto.com.ar/auth/login');
  console.log('2. Loguearse con email + contrasena');
  console.log('3. Ir a docto.com.ar/admin para acceder al panel');
  console.log('====================================');
}

bootstrap().catch(console.error);
