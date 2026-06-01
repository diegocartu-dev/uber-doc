export default function PrivacidadContent() {
  return (
    <article className="prose prose-sm prose-gray max-w-none">
      <h1 className="text-center text-2xl font-bold text-gray-900">
        Política de Privacidad
      </h1>
      <p className="text-center text-sm text-gray-500">
        Última actualización: mayo de 2026
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <p><strong>Docto</strong> es una plataforma de telemedicina inscripta en el Registro Nacional de Plataformas Digitales de Salud (ReNaPDiS) bajo el N° 0270. Contacto: soporte@docto.com.ar.</p>
      <p>Docto se encuentra inscripto ante la Agencia de Acceso a la Información Pública (AAIP) como responsable de una base de datos de carácter personal bajo el legajo RL-2026-36086505-APN-DNPDP#AAIP (base de datos registrada: RL-2026-41929595-APN-DNPDP#AAIP).</p>

      <h2>2. Qué datos recolectamos</h2>

      <h3>a) Datos de identificación</h3>
      <p>Nombre y apellido, DNI, fecha de nacimiento, sexo, correo electrónico, número de teléfono, domicilio.</p>

      <h3>b) Datos de salud (datos sensibles)</h3>
      <p>Motivo de consulta, diagnósticos, indicaciones médicas, recetas, estudios aportados por el paciente, historia clínica generada en la plataforma, cobertura de salud y número de afiliado.</p>

      <h3>c) Datos de pago</h3>
      <p>Los datos de pago son procesados directamente por Mercado Pago. Docto no almacena números de tarjeta ni datos financieros del paciente. Solo se conserva el identificador de la transacción, el monto y el estado del pago.</p>

      <h3>d) Datos técnicos</h3>
      <p>Dirección IP, tipo de dispositivo y navegador, datos de sesión y logs de acceso con fines de seguridad.</p>

      <h2>3. Finalidad del tratamiento</h2>
      <ul>
        <li><strong>Datos de identificación:</strong> gestión de la cuenta, contacto con el usuario, verificación de identidad, emisión de recetas digitales.</li>
        <li><strong>Datos de salud:</strong> prestación de la teleconsulta médica, generación de documentación clínica (recetas, indicaciones), conformación de historia clínica.</li>
        <li><strong>Datos de pago:</strong> procesamiento de cobros, emisión de comprobantes, gestión de reembolsos.</li>
        <li><strong>Datos técnicos:</strong> seguridad de la plataforma, detección de accesos no autorizados, mejora del servicio.</li>
      </ul>

      <h2>4. Base legal del tratamiento</h2>
      <ul>
        <li><strong>Datos de identificación:</strong> consentimiento del titular (art. 5, Ley 25.326) y ejecución de la relación contractual.</li>
        <li><strong>Datos de salud:</strong> consentimiento expreso del titular (art. 5 inc. 2, Ley 25.326), por tratarse de datos sensibles. Este consentimiento se otorga al aceptar el consentimiento informado previo a cada teleconsulta.</li>
        <li><strong>Datos de pago:</strong> ejecución de la relación contractual.</li>
      </ul>

      <h2>5. Destinatarios y proveedores de servicios</h2>
      <p>Los datos personales podrán ser compartidos con los siguientes proveedores, exclusivamente para la prestación del servicio:</p>
      <ul>
        <li><strong>Supabase (AWS):</strong> alojamiento de base de datos y autenticación.</li>
        <li><strong>Mercado Pago:</strong> procesamiento de pagos.</li>
        <li><strong>LiveKit:</strong> provisión de la videollamada. LiveKit procesa datos de audio y video en tiempo real; no almacena grabaciones de las consultas.</li>
        <li><strong>Vercel:</strong> alojamiento de la aplicación web.</li>
        <li><strong>Resend:</strong> envío de correos electrónicos transaccionales.</li>
      </ul>
      <p>Los datos NO son vendidos, cedidos ni compartidos con terceros con fines comerciales, publicitarios o de perfilamiento.</p>

      <h2>6. Transferencia internacional de datos</h2>
      <p>Los proveedores de infraestructura (Supabase/AWS, Vercel, LiveKit) pueden alojar datos en servidores ubicados fuera de la República Argentina. Esta transferencia se realiza con el consentimiento del titular, conforme la excepción prevista en el art. 12 inc. a) de la Ley 25.326, y se limita estrictamente a lo necesario para la prestación del servicio.</p>

      <h2>7. Plazo de conservación</h2>
      <ul>
        <li><strong>Datos clínicos</strong> (diagnósticos, recetas, indicaciones, historia clínica): 10 (diez) años desde la última actuación, conforme al art. 18 de la Ley 26.529. Esta obligación legal prevalece sobre cualquier solicitud de supresión.</li>
        <li><strong>Datos de perfil e identificación:</strong> 5 (cinco) años desde la última actividad del usuario, o hasta que el titular solicite su supresión, lo que ocurra primero.</li>
        <li><strong>Datos de pago</strong> (identificadores de transacción): conforme a la normativa fiscal vigente.</li>
      </ul>

      <h2>8. Derechos del titular</h2>
      <p>Como titular de tus datos personales, tenés derecho a:</p>
      <ul>
        <li><strong>Acceso:</strong> conocer qué datos tuyos están almacenados.</li>
        <li><strong>Rectificación:</strong> corregir datos inexactos o incompletos.</li>
        <li><strong>Actualización:</strong> mantener tus datos al día.</li>
        <li><strong>Supresión:</strong> solicitar la eliminación de tus datos, con la excepción de los datos clínicos sujetos a retención legal obligatoria (10 años).</li>
      </ul>
      <p>Para ejercer cualquiera de estos derechos, enviá un correo a <strong>soporte@docto.com.ar</strong> indicando tu nombre, DNI y el derecho que deseás ejercer. Se responderá dentro de los 10 días hábiles.</p>
      <p>La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas de protección de datos personales. Sitio web: www.argentina.gob.ar/aaip.</p>

      <h2>9. Medidas de seguridad</h2>
      <p>Docto implementa las siguientes medidas técnicas y organizativas:</p>
      <ul>
        <li>Row Level Security (RLS): cada usuario solo puede acceder a sus propios datos.</li>
        <li>Cifrado AES-256 en reposo para datos almacenados.</li>
        <li>Cifrado TLS en tránsito para todas las comunicaciones.</li>
        <li>Autenticación segura.</li>
        <li>Registro de auditoría de acciones administrativas.</li>
      </ul>

      <h2>10. Modificaciones</h2>
      <p>Docto se reserva el derecho de actualizar esta Política de Privacidad. Las modificaciones se publicarán en docto.com.ar/privacidad con la fecha de última actualización. El uso continuado de la plataforma luego de publicados los cambios implica la aceptación de la nueva política.</p>

      <h2>11. Contacto</h2>
      <p>Para consultas sobre privacidad y protección de datos:</p>
      <ul>
        <li>Correo: soporte@docto.com.ar</li>
      </ul>

      <div className="mt-8 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
        Docto — docto.com.ar — Última actualización: mayo de 2026
        <br />
        AAIP RL-2026-36086505 | ReNaPDiS Plataforma 0270
      </div>
    </article>
  );
}
