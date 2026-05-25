# Whitelist de registro — Beta privada

## Que hace

Restringe el registro de medicos a una lista de emails autorizados. Cualquier email que no este en la lista recibe: "Docto esta en beta privada. Tu acceso sera habilitado proximamente."

Si la variable de entorno no existe o esta vacia, el registro funciona normalmente (abierto).

## Como activar

En Vercel > Settings > Environment Variables, crear:

```
SIGNUP_WHITELIST_EMAILS=diegocartu@gmail.com
```

No requiere deploy. Toma efecto inmediato en el proximo request serverless.

## Como agregar un nuevo email autorizado

Editar la variable en Vercel, separando emails con coma:

```
SIGNUP_WHITELIST_EMAILS=diegocartu@gmail.com,paancogliandro@gmail.com,mgiselagunther@gmail.com
```

## Como desactivar completamente (cerrar todo post-QA)

Dos pasos:

1. Borrar la variable `SIGNUP_WHITELIST_EMAILS` en Vercel (o dejar su valor vacio)
2. Desactivar el feature flag en Supabase:
```sql
UPDATE feature_flags SET activo = false WHERE key = 'registro_medicos_publico';
```

Con ambos pasos, el registro queda cerrado: el layout redirige a `/auth/registro-cerrado`.

Si solo queres cerrar el registro pero dejar la whitelist configurada para futuro, solo desactiva el flag.

## Detalles tecnicos

- **Archivo:** `src/app/auth/registro-medico/actions.ts`
- **Punto de check:** despues de extraer el email del formulario, antes de `supabase.auth.signUp()`
- **Case-insensitive:** el check normaliza a lowercase tanto el email ingresado como los de la whitelist
- **Trim:** elimina espacios en blanco antes y despues de cada email
- **Coexiste con feature flag:** el flag `registro_medicos_publico` sigue funcionando como kill switch global. La whitelist es una capa adicional que solo aplica si la variable existe.

## Emails autorizados (estado actual)

| Email | Rol previsto | Fecha de alta |
|---|---|---|
| diegocartu@gmail.com | Medico QA (Diego ficticio) | 2026-05-25 |

## Dependencias

La whitelist **requiere** que el feature flag `registro_medicos_publico` este activo (`activo: true`) en la tabla `feature_flags`. Sin el flag activo, el layout redirige a `/auth/registro-cerrado` antes de que el usuario llegue al form.

Flujo completo:
1. Layout verifica flag `registro_medicos_publico` → si false, redirect a registro-cerrado
2. Server action verifica `SIGNUP_WHITELIST_EMAILS` → si el email no esta, error "beta privada"
3. Server action verifica rate limit, validaciones, duplicados, etc.
4. `supabase.auth.signUp()` crea el usuario

## Historial

| Fecha | Accion |
|---|---|
| 2026-05-25 | Whitelist creada. Solo diegocartu@gmail.com habilitado para QA E2E pre-F&F. |
| 2026-05-25 | Feature flag `registro_medicos_publico` activado para permitir acceso al form. |
