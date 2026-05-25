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

## Como desactivar completamente

Borrar la variable `SIGNUP_WHITELIST_EMAILS` en Vercel, o dejar su valor vacio. El registro vuelve a estar abierto (sujeto al feature flag `registro_medicos_publico`).

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

## Historial

| Fecha | Accion |
|---|---|
| 2026-05-25 | Whitelist creada. Solo diegocartu@gmail.com habilitado para QA E2E pre-F&F. |
