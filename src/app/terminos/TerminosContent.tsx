export default function TerminosContent({ hideTitle = false }: { hideTitle?: boolean }) {
  return (
    <article className="prose prose-sm prose-gray max-w-none">
      {!hideTitle && (
        <>
          <h1 className="text-center text-2xl font-bold text-gray-900">
            Términos y Condiciones de Uso
          </h1>
          <p className="text-center text-sm text-gray-500">
            Versión vigente desde el 26 de abril de 2026
          </p>
        </>
      )}

      <div className="my-6 rounded-lg bg-blue-50 p-4 text-sm font-medium text-gray-800">
        IMPORTANTE: Docto es una plataforma de telemedicina electiva. No es un servicio de emergencias ni urgencias médicas. Ante una urgencia o emergencia, llamá al SAME (107) o concurrí al centro de salud más cercano.
      </div>

      <h2>1. Introducción y aceptación</h2>
      <p>Docto es una plataforma digital de telemedicina operada por Diego Oscar González (CUIT 20-25086458-3), con domicilio en Olga Cossettini 1540, Piso 6, Of. 601, Puerto Madero, Ciudad Autónoma de Buenos Aires, Argentina. La plataforma es accesible a través del sitio web docto.com.ar.</p>
      <p>Al registrarte, acceder o utilizar Docto — ya sea como paciente o como profesional de la salud — aceptás en forma plena e irrestricta estos Términos y Condiciones de Uso. Si no estás de acuerdo con alguna de las condiciones aquí establecidas, no deberás utilizar la plataforma.</p>
      <p>Docto se reserva el derecho de modificar estos Términos en cualquier momento. Las modificaciones entrarán en vigencia desde su publicación en la plataforma. El uso continuado de Docto luego de publicados los cambios implica la aceptación de los nuevos términos.</p>

      <h2>2. Naturaleza del servicio y limitaciones</h2>
      <h3>2.1 Qué es Docto</h3>
      <p>Docto es una plataforma tecnológica que facilita la conexión entre pacientes y profesionales de la salud habilitados para realizar consultas médicas a distancia mediante videoconferencia, en el marco de la Ley 27.553 de Recetas Digitales y demás normativa aplicable.</p>
      <p>Docto actúa como intermediario tecnológico. La relación médico-paciente se establece exclusivamente entre el profesional y el paciente. Docto no ejerce la medicina ni presta servicios médicos directamente.</p>
      <h3>2.2 Lo que Docto NO es</h3>
      <p><strong>Docto NO es un servicio de emergencias ni urgencias médicas.</strong></p>
      <p>Docto no debe ser utilizado en ninguna de las siguientes situaciones:</p>
      <ul>
        <li>Emergencias médicas o situaciones que pongan en riesgo la vida.</li>
        <li>Dolor en el pecho, dificultad para respirar o pérdida del conocimiento.</li>
        <li>Accidentes o traumatismos graves.</li>
        <li>Cuadros que requieran atención presencial inmediata.</li>
        <li>Crisis de salud mental con riesgo para la integridad del paciente o terceros.</li>
      </ul>
      <p>En cualquiera de los casos anteriores, el paciente deberá llamar al número de emergencias de su localidad (107 en AMBA), llamar a una ambulancia o concurrir al hospital o guardia más cercano.</p>
      <h3>2.3 Alcance de las consultas</h3>
      <p>Las consultas realizadas a través de Docto son de carácter electivo y complementario a la atención médica presencial. El profesional de la salud determinará, según su criterio clínico, si la consulta puede resolverse de forma remota o si el paciente requiere atención presencial.</p>
      <p>Docto no garantiza diagnósticos, resultados de tratamientos ni la disponibilidad permanente de profesionales en ninguna especialidad.</p>

      <h2>3. Registro, cuenta y responsabilidades del usuario</h2>
      <p>Para utilizar Docto debés registrarte con información verídica, completa y actualizada. Sos responsable de mantener la confidencialidad de tus credenciales de acceso y de todas las actividades realizadas desde tu cuenta.</p>
      <p>Al registrarte declarás que:</p>
      <ul>
        <li>Sos mayor de 18 años, o contás con autorización de tu representante legal.</li>
        <li>La información que proporcionás es verdadera y está actualizada.</li>
        <li>Utilizarás la plataforma únicamente con fines lícitos y de acuerdo a estos Términos.</li>
      </ul>
      <p>Docto podrá suspender o eliminar tu cuenta si detecta información falsa, uso indebido de la plataforma o incumplimiento de estos Términos.</p>

      <h2>4. Profesionales de la salud en la plataforma</h2>
      <p>Los profesionales de la salud que operan en Docto son profesionales independientes habilitados por los organismos competentes (Ministerio de Salud, colegios profesionales u organismos equivalentes). Docto verifica la matrícula vigente de cada profesional a través del sistema SISA/REFEPS antes de habilitar su perfil.</p>
      <p>Los profesionales son exclusivamente responsables de:</p>
      <ul>
        <li>El contenido de sus diagnósticos, indicaciones terapéuticas y recetas.</li>
        <li>El ejercicio ético y legal de su profesión.</li>
        <li>La determinación de si una consulta puede resolverse en forma remota.</li>
        <li>La derivación del paciente cuando la situación clínica lo requiera.</li>
      </ul>
      <p>Docto no es responsable por las decisiones clínicas de los profesionales ni por los resultados de los tratamientos indicados.</p>

      <h2>5. Pagos, aranceles y política de reembolsos</h2>
      <h3>5.1 Estructura de pagos</h3>
      <p>Los pagos se procesan a través de Mercado Pago mediante el sistema de pagos divididos. Docto retiene una comisión sobre el valor de cada consulta como contraprestación por el uso de la plataforma. El porcentaje de comisión depende de la categoría del profesional y se informa de forma transparente antes de la primera publicación de turnos. El resto es acreditado directamente al profesional de la salud.</p>
      <p>Los precios de cada consulta son establecidos por el profesional y se muestran claramente antes de confirmar la reserva. Al confirmar y pagar, aceptás el arancel informado.</p>
      <h3>5.2 Reembolsos — Consulta Inmediata</h3>
      <ul>
        <li>Si ningún profesional toma la consulta dentro de los 30 minutos: reembolso del 100%.</li>
        <li>Si la consulta fue atendida, no procede reembolso salvo lo dispuesto en el punto 5.4.</li>
      </ul>
      <h3>5.3 Reembolsos — Turnos programados</h3>
      <ul>
        <li>Cancelación por el paciente con más de 48 horas de anticipación: reembolso del 100%.</li>
        <li>Cancelación por el paciente con menos de 48 horas de anticipación: sin reembolso.</li>
        <li>Cancelación por el profesional en cualquier momento: reembolso del 100% al paciente.</li>
        <li>Inasistencia del paciente sin cancelación previa: sin reembolso.</li>
        <li>El crédito por cancelación del profesional puede aplicarse a una nueva reserva dentro de los 7 días corridos.</li>
      </ul>
      <h3>5.4 Reembolsos por problemas técnicos</h3>
      <p>Si la consulta no pudo realizarse por fallas técnicas imputables a la plataforma Docto, se reembolsará el 100% del importe abonado o se ofrecerá la reprogramación sin cargo. Los problemas de conectividad del paciente o del profesional no son imputables a Docto y no generan derecho a reembolso automático.</p>
      <h3>5.5 Procesamiento de reembolsos</h3>
      <p>Los reembolsos se acreditan al medio de pago original dentro de los plazos que establezca Mercado Pago (generalmente 3 a 10 días hábiles). Docto no tiene control sobre los tiempos internos de acreditación del procesador de pagos.</p>

      <h2>6. Recetas digitales</h2>
      <p>Las recetas emitidas a través de Docto son recetas digitales con validez legal en todo el territorio nacional, en el marco de la Ley 27.553 y el Decreto 63/2024. Las recetas incluyen la firma digital del profesional y el código de identificación correspondiente.</p>
      <p>La emisión de una receta es una decisión exclusiva del profesional interviniente. Docto no puede garantizar que toda consulta resulte en la emisión de una receta. El paciente no tiene derecho a exigir la prescripción de medicamentos específicos.</p>
      <p>Docto se encuentra inscripto ante el Registro Nacional de Plataformas Digitales de Salud (ReNaPDiS) bajo el expediente en trámite, y ante la Agencia de Acceso a la Información Pública (AAIP) bajo el legajo RL-2026-36086505.</p>

      <h2>7. Privacidad y protección de datos personales</h2>
      <p>El tratamiento de datos personales en Docto se realiza conforme a la Ley 25.326 de Protección de Datos Personales y las disposiciones de la Agencia de Acceso a la Información Pública (AAIP).</p>
      <p>Los datos de salud son considerados datos sensibles y son tratados con el máximo nivel de protección. Docto implementa:</p>
      <ul>
        <li>Cifrado TLS en tránsito para todas las comunicaciones.</li>
        <li>Cifrado AES-256 en reposo para datos almacenados.</li>
        <li>Row Level Security en la base de datos — cada usuario solo accede a sus propios datos.</li>
        <li>Autenticación segura mediante contraseña y Google OAuth.</li>
      </ul>
      <p>Los datos no son vendidos ni cedidos a terceros con fines comerciales. El titular de los datos puede ejercer sus derechos de acceso, rectificación, actualización y supresión enviando un correo a soporte@docto.com.ar. Los datos clínicos (diagnósticos, recetas, indicaciones, historia clínica) se conservan por un plazo mínimo de 10 años desde la última actuación, conforme al art. 18 de la Ley 26.529. Los datos de perfil e identificación se conservan por 5 años desde la última actividad o hasta que el titular solicite su supresión. Para más información, consultá nuestra <a href="/privacidad" className="underline">Política de Privacidad</a>.</p>

      <h2>8. Conducta del usuario y usos prohibidos</h2>
      <p>Al utilizar Docto, el usuario se compromete a no:</p>
      <ul>
        <li>Proporcionar información falsa sobre su identidad o estado de salud.</li>
        <li>Suplantar la identidad de otra persona.</li>
        <li>Grabar, reproducir o distribuir el contenido de las videoconsultas sin consentimiento expreso del profesional.</li>
        <li>Utilizar la plataforma para fines distintos a la consulta médica legítima.</li>
        <li>Intentar acceder a datos de otros usuarios o vulnerar la seguridad del sistema.</li>
        <li>Hostigar, amenazar o faltar el respeto a los profesionales de la salud.</li>
        <li>Solicitar prescripciones de medicamentos controlados de forma reiterada y sin justificación clínica.</li>
      </ul>

      <h2>9. Limitación de responsabilidad</h2>
      <p>Docto no será responsable por:</p>
      <ul>
        <li>Las decisiones clínicas, diagnósticos o tratamientos indicados por los profesionales de la salud.</li>
        <li>Los resultados de los tratamientos médicos seguidos por el paciente.</li>
        <li>Daños derivados del uso incorrecto de la plataforma o de la información proporcionada por el usuario.</li>
        <li>Interrupciones del servicio por causas de fuerza mayor o fallas de terceros proveedores.</li>
        <li>El uso de la plataforma en situaciones de emergencia o urgencia.</li>
        <li>Demoras en la atención derivadas de la disponibilidad de profesionales.</li>
      </ul>
      <p>La responsabilidad máxima de Docto ante el usuario, en cualquier circunstancia, no podrá exceder el importe abonado por la consulta en cuestión.</p>

      <h2>10. Propiedad intelectual</h2>
      <p>Todo el contenido de la plataforma Docto — incluyendo su diseño, código fuente, marca, logotipo, textos e interfaz — es propiedad exclusiva de Diego Oscar González y está protegido por las leyes de propiedad intelectual vigentes en Argentina. Queda prohibida la reproducción, distribución o modificación de cualquier elemento de la plataforma sin autorización expresa y por escrito.</p>

      <h2>11. Modificaciones del servicio</h2>
      <p>Docto se reserva el derecho de modificar, suspender o discontinuar, en forma temporal o permanente, cualquier aspecto de la plataforma. En caso de cambios significativos que afecten los derechos del usuario, se notificará por correo electrónico con al menos 15 días de anticipación.</p>

      <h2>12. Ley aplicable y jurisdicción</h2>
      <p>Estos Términos se rigen por las leyes de la República Argentina. Para cualquier disputa derivada del uso de la plataforma, las partes se someten a la jurisdicción de los tribunales ordinarios de la Ciudad Autónoma de Buenos Aires, renunciando expresamente a cualquier otro fuero que pudiera corresponder.</p>

      <h2>13. Contacto y soporte</h2>
      <ul>
        <li>Correo electrónico: soporte@docto.com.ar</li>
        <li>Sitio web: docto.com.ar</li>
        <li>Domicilio: Olga Cossettini 1540, Piso 6, Of. 601, Puerto Madero, CABA, Argentina.</li>
        <li>Horario de atención: lunes a viernes de 9 a 18hs (horario Argentina).</li>
      </ul>

      <div className="mt-8 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
        Docto — docto.com.ar — Diego Oscar González, CUIT 20-25086458-3
        <br />
        AAIP RL-2026-36086505 | ReNaPDiS Plataforma 0270 | soporte@docto.com.ar
        <br />
        Última actualización: mayo de 2026
      </div>
    </article>
  );
}
