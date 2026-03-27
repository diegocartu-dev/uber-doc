-- Trigger: crear perfil automáticamente cuando se registra un usuario
-- Esto es un fallback — si el INSERT desde la app falla, el trigger lo crea
create or replace function public.handle_new_user()
returns trigger as $$
begin
  if new.raw_user_meta_data->>'role' = 'paciente' then
    insert into public.pacientes (user_id, nombre_completo, email, dni, fecha_nacimiento, telefono)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      new.email,
      '',
      '2000-01-01',
      ''
    )
    on conflict (user_id) do nothing;
  elsif new.raw_user_meta_data->>'role' = 'medico' then
    insert into public.medicos (user_id, nombre_completo, email, especialidad, tipo_matricula, numero_matricula, precio_consulta, duracion_consulta, modalidad_atencion)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      new.email,
      'Clínica médica',
      'MN',
      '',
      0,
      30,
      'programada'
    )
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Eliminar trigger si ya existe
drop trigger if exists on_auth_user_created on auth.users;

-- Crear trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
