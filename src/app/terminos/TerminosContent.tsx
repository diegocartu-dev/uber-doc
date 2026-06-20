export default function TerminosContent({ hideTitle = false }: { hideTitle?: boolean }) {
  return (
    <article className="prose prose-sm prose-gray max-w-none">
      {!hideTitle && (
        <>
          <h1 className="text-center text-2xl font-bold text-gray-900">
            Términos y Condiciones de Uso
          </h1>
          <p className="text-center text-sm text-gray-500">
            Versión vigente desde el 1 de junio de 2026
          </p>
        </>
      )}

      <div className="my-6 rounded-lg bg-blue-50 p-4 text-sm font-medium text-gray-800">
        IMPORTANTE: Docto es una plataforma de telemedicina electiva. No es un servicio de emergencias ni urgencias médicas. Ante una urgencia o emergencia, llamá al SAME (107) o concurrí al centro de salud más cercano.
      </div>

      <h2>1. Introducción y aceptación</h2>
      <p><strong>Docto</strong> es una plataforma digital de telemedicina inscripta en el Registro Nacional de Plataformas Digitales de Salud (ReNaPDiS) bajo el N° 0270 y ante la Agencia de Acceso a la Información Pública (AAIP) bajo el legajo RL-2026-36086505. La plataforma es accesible a través del sitio web docto.com.ar. Para cualquier consulta, contactá a soporte@docto.com.ar.</p>
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

      <h2>3. Salud y atención médica</h2>
      <h3>3.1 Naturaleza de la teleconsulta y sus límites</h3>
      <p>La teleconsulta en Docto es un acto médico real: un profesional habilitado te atiende a distancia por videollamada, evalúa tu caso y puede diagnosticar, indicar tratamiento o emitir una receta cuando corresponda.</p>
      <p>Tiene límites propios de la atención a distancia. Hay situaciones que no pueden resolverse por telemedicina y requieren atención presencial: cuadros que necesitan examen físico, estudios complementarios, procedimientos, o cualquier situación donde el profesional, según su criterio clínico, considere que no puede atenderte con seguridad de forma remota. En esos casos el profesional te lo va a indicar y te va a derivar a una consulta presencial. La decisión sobre si tu caso puede resolverse de forma remota o necesita atención presencial es siempre del profesional que te atiende.</p>
      <h3>3.2 Consentimiento informado y autonomía</h3>
      <p>Tenés derecho a recibir, antes y durante la consulta, información clara, suficiente y adecuada a tu capacidad de comprensión sobre tu estado de salud, el procedimiento propuesto, sus beneficios, riesgos y las alternativas disponibles (Ley 26.529).</p>
      <p>Sobre esa información, tenés derecho a aceptar o rechazar los tratamientos o procedimientos indicados, así como a revocar tu decisión posteriormente. La atención por videollamada implica además tu consentimiento para que el acto médico se realice de forma remota; podés interrumpir la teleconsulta en cualquier momento.</p>
      <p>Tenés derecho a tu historia clínica: es tuya, podés acceder a ella y solicitar una copia. Los documentos que se generen en tu consulta (receta, indicaciones, constancias) quedan disponibles para vos en la plataforma.</p>
      <h3>3.3 Confidencialidad y secreto profesional</h3>
      <p>Todo lo que compartas en una consulta está protegido por el secreto profesional y por la confidencialidad de tus datos de salud. El profesional que te atiende y Docto están obligados a no revelar la información vinculada a tu atención, salvo en los casos en que la ley lo exija expresamente o cuando vos lo autorices. Tus datos de salud son datos sensibles y reciben el máximo nivel de protección (ver §8, Privacidad y protección de datos personales).</p>

      <h2>4. Registro, cuenta y responsabilidades del usuario</h2>
      <p>Para utilizar Docto debés registrarte con información verídica, completa y actualizada. Sos responsable de mantener la confidencialidad de tus credenciales de acceso y de todas las actividades realizadas desde tu cuenta.</p>
      <p>Al registrarte declarás que:</p>
      <ul>
        <li>Sos mayor de 18 años, o contás con autorización de tu representante legal.</li>
        <li>La información que proporcionás es verdadera y está actualizada.</li>
        <li>Utilizarás la plataforma únicamente con fines lícitos y de acuerdo a estos Términos.</li>
      </ul>
      <p>Docto podrá suspender o eliminar tu cuenta si detecta información falsa, uso indebido de la plataforma o incumplimiento de estos Términos.</p>

      <h2>5. Profesionales de la salud en la plataforma</h2>
      <p>Los profesionales de la salud que operan en Docto son profesionales independientes habilitados por los organismos competentes (Ministerio de Salud, colegios profesionales u organismos equivalentes). Docto verifica la matrícula vigente de cada profesional a través del sistema SISA/REFEPS antes de habilitar su perfil.</p>
      <p>Los profesionales son exclusivamente responsables de:</p>
      <ul>
        <li>El contenido de sus diagnósticos, indicaciones terapéuticas y recetas.</li>
        <li>El ejercicio ético y legal de su profesión.</li>
        <li>La determinación de si una consulta puede resolverse en forma remota.</li>
        <li>La derivación del paciente cuando la situación clínica lo requiera.</li>
      </ul>
      <p>Docto no es responsable por las decisiones clínicas de los profesionales ni por los resultados de los tratamientos indicados.</p>

      <h2>6. Pagos, aranceles y política de reembolsos</h2>
      <h3>6.1 Estructura de pagos</h3>
      <p>Los pagos se procesan a través de Mercado Pago mediante el sistema de pagos divididos. Docto retiene una comisión sobre el valor de cada consulta como contraprestación por el uso de la plataforma. El porcentaje de comisión depende de la categoría del profesional y se informa de forma transparente antes de la primera publicación de turnos. El resto es acreditado directamente al profesional de la salud.</p>
      <p>Los precios de cada consulta son establecidos por el profesional y se muestran claramente antes de confirmar la reserva. Al confirmar y pagar, aceptás el arancel informado.</p>
      <h3>6.2 Cancelaciones y reembolsos</h3>
      <p>Tu reembolso depende de quién cancela, con cuánta anticipación y de qué tipo de consulta se trata:</p>
      <ul>
        <li><strong>Turno — cancelás con más de 48 hs de anticipación:</strong> reembolso del 100%.</li>
        <li><strong>Turno — cancelás con menos de 48 hs de anticipación:</strong> sin reembolso, pero podés reprogramar tu consulta sin costo con el mismo profesional.</li>
        <li><strong>Turno — no te presentás y no cancelaste:</strong> sin reembolso.</li>
        <li><strong>El profesional cancela (en cualquier momento):</strong> elegís vos — reprogramás sin costo o te reembolsamos el 100%.</li>
        <li><strong>Consulta Inmediata — ningún profesional la toma en 30 minutos:</strong> reembolso del 100%.</li>
        <li><strong>Falla técnica imputable a Docto:</strong> reembolso del 100% o reprogramación sin cargo, a tu elección.</li>
      </ul>
      <p>Reprogramar no es un reembolso: el pago se mantiene asociado al nuevo turno, no se devuelve dinero ni se genera saldo a favor. Los problemas de conectividad del paciente o del profesional no son imputables a Docto y no generan reembolso automático.</p>
      <h3>6.3 Procesamiento de reembolsos</h3>
      <p>Los reembolsos se acreditan al mismo medio de pago con el que abonaste. El tiempo de acreditación depende del procesador de pagos (Mercado Pago) y puede demorar algunos días hábiles; Docto no tiene control sobre esos plazos internos. Si transcurrido un plazo razonable no ves acreditado tu reembolso, escribinos a soporte@docto.com.ar.</p>
      <h3>6.4 Derecho de revocación (compras a distancia)</h3>
      <p>Como contratás a distancia, la ley te reconoce el derecho de revocar la operación dentro de los 10 días corridos (art. 34, Ley 24.240). Ese derecho no aplica a las consultas de Docto, porque se trata de un servicio que se agenda y presta en una fecha y hora determinadas elegidas por vos, supuesto expresamente excluido de la revocación. La cancelación y los reembolsos de tu consulta se rigen por la política de cancelaciones de §6.2.</p>

      <h2>7. Recetas y documentos médicos digitales</h2>
      <h3>7.1 Recetas digitales</h3>
      <p>Las recetas emitidas a través de Docto son recetas digitales con validez legal en todo el territorio nacional, en el marco de la Ley 27.553 y el Decreto 63/2024. Las recetas incluyen la firma electrónica del profesional y el código de identificación correspondiente.</p>
      <p>La emisión de una receta es una decisión exclusiva del profesional interviniente. Docto no puede garantizar que toda consulta resulte en la emisión de una receta. El paciente no tiene derecho a exigir la prescripción de medicamentos específicos.</p>
      <p>Docto se encuentra inscripto ante el Registro Nacional de Plataformas Digitales de Salud (ReNaPDiS) bajo el N° 0270, y ante la Agencia de Acceso a la Información Pública (AAIP) bajo el legajo RL-2026-36086505.</p>

      <h3>7.2 Otros documentos médicos</h3>
      <p>Además de la receta, el profesional puede emitir a través de Docto otros documentos —indicaciones médicas, órdenes de estudios y certificados médicos— firmados electrónicamente. Cada documento se emite bajo la exclusiva responsabilidad profesional del médico interviniente, quien decide su contenido y procedencia. Docto provee la plataforma de emisión, no interviene en el criterio clínico.</p>

      <h3>7.3 Certificados médicos de reposo laboral</h3>
      <p>A través de Docto el profesional interviniente puede emitir certificados de reposo o licencia laboral, firmados electrónicamente. El certificado consigna el diagnóstico, el tratamiento indicado y los días de reposo, según el criterio del profesional. La Ley 27.802 y su Decreto reglamentario 407/2026 regulan, entre otros aspectos, el artículo 210 de la Ley de Contrato de Trabajo, relativo al control del estado de salud del trabajador.</p>
      <p><strong>Derecho de control del empleador.</strong> El artículo 210 de la Ley de Contrato de Trabajo reconoce al empleador la facultad de verificar el estado de salud del trabajador mediante un control a cargo del facultativo que aquél designe. La emisión de un certificado a través de Docto no sustituye, limita ni excluye ese derecho de control del empleador, ni la eventual intervención de una junta médica cuando corresponda. El trabajador es responsable de presentar el certificado a su empleador en los plazos y formas que su relación laboral exija.</p>

      <h2>8. Privacidad y protección de datos personales</h2>
      <p>El tratamiento de datos personales en Docto se realiza conforme a la Ley 25.326 de Protección de Datos Personales y las disposiciones de la Agencia de Acceso a la Información Pública (AAIP).</p>
      <p>Los datos de salud son considerados datos sensibles y son tratados con el máximo nivel de protección. Docto implementa:</p>
      <ul>
        <li>Cifrado TLS en tránsito para todas las comunicaciones.</li>
        <li>Cifrado AES-256 en reposo para datos almacenados.</li>
        <li>Row Level Security en la base de datos — cada usuario solo accede a sus propios datos.</li>
        <li>Autenticación segura mediante contraseña y Google OAuth.</li>
      </ul>
      <p>Los datos no son vendidos ni cedidos a terceros con fines comerciales. El titular de los datos puede ejercer sus derechos de acceso, rectificación, actualización y supresión enviando un correo a soporte@docto.com.ar. Los datos clínicos (diagnósticos, recetas, indicaciones, historia clínica) se conservan por un plazo mínimo de 10 años desde la última actuación, conforme al art. 18 de la Ley 26.529. Los datos de perfil e identificación se conservan por 5 años desde la última actividad o hasta que el titular solicite su supresión. Para más información, consultá nuestra <a href="/privacidad" className="underline">Política de Privacidad</a>.</p>

      <h2>9. Conducta del usuario y usos prohibidos</h2>
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

      <h2>10. Limitación de responsabilidad</h2>
      <p>Docto no será responsable por:</p>
      <ul>
        <li>Las decisiones clínicas, diagnósticos o tratamientos indicados por los profesionales de la salud.</li>
        <li>Los resultados de los tratamientos médicos seguidos por el paciente.</li>
        <li>Daños derivados del uso incorrecto de la plataforma o de la información proporcionada por el usuario.</li>
        <li>Interrupciones del servicio por causas de fuerza mayor o fallas de terceros proveedores.</li>
        <li>El uso de la plataforma en situaciones de emergencia o urgencia.</li>
        <li>Demoras en la atención derivadas de la disponibilidad de profesionales.</li>
      </ul>

      <h2>11. Propiedad intelectual</h2>
      <p>Todo el contenido de la plataforma Docto — incluyendo su diseño, código fuente, marca, logotipo, textos e interfaz — es propiedad exclusiva de Docto y está protegido por las leyes de propiedad intelectual vigentes en Argentina. Queda prohibida la reproducción, distribución o modificación de cualquier elemento de la plataforma sin autorización expresa y por escrito.</p>

      <h2>12. Modificaciones del servicio</h2>
      <p>Docto se reserva el derecho de modificar, suspender o discontinuar, en forma temporal o permanente, cualquier aspecto de la plataforma. En caso de cambios significativos que afecten los derechos del usuario, se notificará por correo electrónico con al menos 15 días de anticipación.</p>

      <h2>13. Ley aplicable y jurisdicción</h2>
      <p>Estos Términos se rigen por las leyes de la República Argentina. Para cualquier disputa derivada del uso de la plataforma, las partes se someten a la jurisdicción de los tribunales ordinarios de la Ciudad Autónoma de Buenos Aires, renunciando expresamente a cualquier otro fuero que pudiera corresponder.</p>

      <h2>14. Defensa del Consumidor</h2>
      <p>Si tenés un reclamo como consumidor, podés iniciarlo ante la <strong>Ventanilla Única Federal de Defensa del Consumidor</strong>, disponible para todo el país en <a href="https://www.argentina.gob.ar/servicio/iniciar-un-reclamo-ante-defensa-del-consumidor" className="underline" target="_blank" rel="noopener noreferrer">consumidor.gob.ar</a>. En la Ciudad Autónoma de Buenos Aires, también podés comunicarte con la Dirección General de Defensa y Protección al Consumidor llamando al <strong>147</strong>.</p>
      <p>Si te arrepentiste de una contratación a distancia, podés ejercer tu derecho de revocación conforme a lo indicado en §6.4.</p>

      <h2>15. Contacto y soporte</h2>
      <ul>
        <li>Correo electrónico: soporte@docto.com.ar</li>
        <li>Sitio web: docto.com.ar</li>
        <li>Horario de atención: lunes a viernes de 9 a 18hs (horario Argentina).</li>
      </ul>

      <div className="mt-8 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
        Docto — docto.com.ar
        <br />
        AAIP RL-2026-36086505 | ReNaPDiS Plataforma 0270 | soporte@docto.com.ar
        <br />
        Última actualización: junio de 2026
      </div>
    </article>
  );
}
