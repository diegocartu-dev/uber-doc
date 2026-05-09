# Pendientes para proximo sprint — Panel Admin V2

Funcionalidades del brief original que no entraron en este sprint por tiempo o porque requieren logica que no se puede agregar sin tocar flujos existentes.

## Seccion Usuarios (Dia 6 del brief)
- Vista unificada de medicos + pacientes + admins en una sola tabla
- Requiere refactoring de queries para unificar schemas distintos (medicos tiene nombre_completo, pacientes tambien pero con campos distintos)
- No es critico: cada seccion individual ya tiene su gestion

## Seccion Especialidades (Dia 10 del brief)
- Mapa de especialidades con cobertura por provincia
- Tab Triage analitico con tabla de motivos y deteccion de gaps
- Requiere datos de triage que se acumulen (tabla consultas.motivo_triage)
- Implementar cuando haya masa critica de datos

## Seccion Finanzas (Dia 11 del brief)
- Vista de pagos, reembolsos, GMV, precios/honorarios, comisiones cobradas
- Requiere integracion con datos reales de Mercado Pago (webhooks)
- La tabla de pagos no tiene suficiente data aun para que la seccion sea util
- La config de comisiones (porcentajes, regimen) SI quedo implementada en Configuracion

## Mejoras a Consultas (Dia 9 del brief)
- Tab "Pacientes esperando" con polling 10s
- Tab "Cancelaciones" con tasa por medico
- Filtros por especialidad y motivo de triage
- Requiere verificar nombres reales de columnas en tabla consultas para estado de espera
- El monitor en tiempo real existente sigue funcionando

## Generador automatico de alertas
- La tabla alertas_admin existe, el panel la lee/resuelve
- Falta el cron/trigger que genere alertas automaticamente
- Definir reglas con Diego: que condiciones disparan alertas

## Deteccion de DNIs duplicados en UI
- La funcion SQL detectar_dnis_duplicados() esta creada
- Falta el banner DuplicatesBanner.tsx en la seccion de pacientes
- Falta el endpoint /api/admin/duplicados
- El unique index en DNI ya esta aplicado, asi que nuevos duplicados no pueden entrar

## PaginatedTable generico
- Actualmente la paginacion esta inline en PacientesClient
- Extraer a componente reutilizable para aplicar en otras secciones
- No es critico, es refactoring de UI

## Tab Audit en SidePanel
- El componente AuditTabContent esta creado y funciona
- Falta integrarlo como tab en los side panels de medicos y pacientes
- Requiere agregar tabs al SidePanel (actualmente es contenido libre)

## Integraciones: health check real
- Actualmente verifica existencia de env vars
- Implementar pings reales: Supabase health, Daily.co API ping, MP status, Resend verify
- No critico, la verificacion de env vars ya es util

## Sistema de autenticacion admin con 2FA
- Proximo sprint segun brief original
- Subdominio admin.docto.com.ar + login dedicado + 2FA
- No bloquea el panel actual
