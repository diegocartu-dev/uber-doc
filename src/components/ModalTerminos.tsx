"use client";

import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ModalTerminos({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Términos y Condiciones de Uso
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm leading-relaxed text-gray-700">
          <p className="mb-4 text-xs text-gray-500">
            Versión vigente desde el 26 de abril de 2026
          </p>

          <div className="mb-4 rounded-lg bg-blue-50 p-3 text-[13px] font-medium text-gray-800">
            IMPORTANTE: Docto es una plataforma de telemedicina electiva. No es un servicio de emergencias ni urgencias médicas. Ante una urgencia o emergencia, llamá al SAME (107) o concurrí al centro de salud más cercano.
          </div>

          <Section title="1. Introducción y aceptación">
            <p>Docto es una plataforma digital de telemedicina operada por Diego Oscar González (CUIT 20-25086458-3), con domicilio en Olga Cossettini 1540, Piso 6, Of. 601, Puerto Madero, Ciudad Autónoma de Buenos Aires, Argentina. La plataforma es accesible a través del sitio web docto.com.ar.</p>
            <p>Al registrarte, acceder o utilizar Docto — ya sea como paciente o como profesional de la salud — aceptás en forma plena e irrestricta estos Términos y Condiciones de Uso. Si no estás de acuerdo con alguna de las condiciones aquí establecidas, no deberás utilizar la plataforma.</p>
            <p>Docto se reserva el derecho de modificar estos Términos en cualquier momento. Las modificaciones entrarán en vigencia desde su publicación en la plataforma. El uso continuado de Docto luego de publicados los cambios implica la aceptación de los nuevos términos.</p>
          </Section>

          <Section title="2. Naturaleza del servicio y limitaciones">
            <p className="font-medium">2.1 Qué es Docto</p>
            <p>Docto es una plataforma tecnológica que facilita la conexión entre pacientes y profesionales de la salud habilitados para realizar consultas médicas a distancia mediante videoconferencia, en el marco de la Ley 27.553 de Recetas Digitales y demás normativa aplicable.</p>
            <p>Docto actúa como intermediario tecnológico. La relación médico-paciente se establece exclusivamente entre el profesional y el paciente. Docto no ejerce la medicina ni presta servicios médicos directamente.</p>
            <p className="font-medium mt-2">2.2 Lo que Docto NO es</p>
            <p className="font-semibold">Docto NO es un servicio de emergencias ni urgencias médicas.</p>
            <p>Docto no debe ser utilizado en ninguna de las siguientes situaciones:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Emergencias médicas o situaciones que pongan en riesgo la vida.</li>
              <li>Dolor en el pecho, dificultad para respirar o pérdida del conocimiento.</li>
              <li>Accidentes o traumatismos graves.</li>
              <li>Cuadros que requieran atención presencial inmediata.</li>
              <li>Crisis de salud mental con riesgo para la integridad del paciente o terceros.</li>
            </ul>
            <p>En cualquiera de los casos anteriores, el paciente deberá llamar al número de emergencias de su localidad (107 en AMBA), llamar a una ambulancia o concurrir al hospital o guardia más cercano.</p>
            <p className="font-medium mt-2">2.3 Alcance de las consultas</p>
            <p>Las consultas realizadas a través de Docto son de carácter electivo y complementario a la atención médica presencial. El profesional de la salud determinará, según su criterio clínico, si la consulta puede resolverse de forma remota o si el paciente requiere atención presencial.</p>
            <p>Docto no garantiza diagnósticos, resultados de tratamientos ni la disponibilidad permanente de profesionales en ninguna especialidad.</p>
          </Section>

          <Section title="3. Registro, cuenta y responsabilidades del usuario">
            <p>Para utilizar Docto debés registrarte con información verídica, completa y actualizada. Sos responsable de mantener la confidencialidad de tus credenciales de acceso y de todas las actividades realizadas desde tu cuenta.</p>
            <p>Al registrarte declarás que:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sos mayor de 18 años, o contás con autorización de tu representante legal.</li>
              <li>La información que proporcionás es verdadera y está actualizada.</li>
              <li>Utilizarás la plataforma únicamente con fines lícitos y de acuerdo a estos Términos.</li>
            </ul>
            <p>Docto podrá suspender o eliminar tu cuenta si detecta información falsa, uso indebido de la plataforma o incumplimiento de estos Términos.</p>
          </Section>

          <Section title="4. Profesionales de la salud en la plataforma">
            <p>Los profesionales de la salud que operan en Docto son profesionales independientes habilitados por los organismos competentes (Ministerio de Salud, colegios profesionales u organismos equivalentes). Docto verifica la matrícula vigente de cada profesional a través del sistema SISA/REFEPS antes de habilitar su perfil.</p>
            <p>Los profesionales son exclusivamente responsables de:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>El contenido de sus diagnósticos, indicaciones terapéuticas y recetas.</li>
              <li>El ejercicio ético y legal de su profesión.</li>
              <li>La determinación de si una consulta puede resolverse en forma remota.</li>
              <li>La derivación del paciente cuando la situación clínica lo requiera.</li>
            </ul>
            <p>Docto no es responsable por las decisiones clínicas de los profesionales ni por los resultados de los tratamientos indicados.</p>
          </Section>

          <Section title="5. Pagos, aranceles y política de reembolsos">
            <p className="font-medium">5.1 Estructura de pagos</p>
            <p>Los pagos se procesan a través de Mercado Pago mediante el sistema de pagos divididos. Docto retiene una comisión del 15% sobre el valor de cada consulta como contraprestación por el uso de la plataforma. El 85% restante es acreditado al profesional de la salud.</p>
            <p>Los precios de cada consulta son establecidos por el profesional y se muestran claramente antes de confirmar la reserva. Al confirmar y pagar, aceptás el arancel informado.</p>
            <p className="font-medium mt-2">5.2 Reembolsos — Consulta Inmediata</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Si ningún profesional toma la consulta dentro de los 30 minutos: reembolso del 100%.</li>
              <li>Si la consulta fue atendida, no procede reembolso salvo lo dispuesto en el punto 5.4.</li>
            </ul>
            <p className="font-medium mt-2">5.3 Reembolsos — Turnos programados</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Cancelación por el paciente con más de 48 horas de anticipación: reembolso del 100%.</li>
              <li>Cancelación por el paciente con menos de 48 horas de anticipación: sin reembolso.</li>
              <li>Cancelación por el profesional en cualquier momento: reembolso del 100% al paciente.</li>
              <li>Inasistencia del paciente sin cancelación previa: sin reembolso.</li>
              <li>El crédito por cancelación del profesional puede aplicarse a una nueva reserva dentro de los 7 días corridos.</li>
            </ul>
            <p className="font-medium mt-2">5.4 Reembolsos por problemas técnicos</p>
            <p>Si la consulta no pudo realizarse por fallas técnicas imputables a la plataforma Docto, se reembolsará el 100% del importe abonado o se ofrecerá la reprogramación sin cargo. Los problemas de conectividad del paciente o del profesional no son imputables a Docto y no generan derecho a reembolso automático.</p>
            <p className="font-medium mt-2">5.5 Procesamiento de reembolsos</p>
            <p>Los reembolsos se acreditan al medio de pago original dentro de los plazos que establezca Mercado Pago (generalmente 3 a 10 días hábiles). Docto no tiene control sobre los tiempos internos de acreditación del procesador de pagos.</p>
          </Section>

          <Section title="6. Recetas digitales">
            <p>Las recetas emitidas a través de Docto son recetas digitales con validez legal en todo el territorio nacional, en el marco de la Ley 27.553 y el Decreto 63/2024. Las recetas incluyen la firma digital del profesional y el código de identificación correspondiente.</p>
            <p>La emisión de una receta es una decisión exclusiva del profesional interviniente. Docto no puede garantizar que toda consulta resulte en la emisión de una receta. El paciente no tiene derecho a exigir la prescripción de medicamentos específicos.</p>
            <p>Docto se encuentra inscripto ante el Registro Nacional de Plataformas Digitales de Salud (ReNaPDiS) bajo el expediente en trámite, y ante la Agencia de Acceso a la Información Pública (AAIP) bajo el legajo RL-2026-36086505.</p>
          </Section>

          <Section title="7. Privacidad y protección de datos personales">
            <p>El tratamiento de datos personales en Docto se realiza conforme a la Ley 25.326 de Protección de Datos Personales y las disposiciones de la Agencia de Acceso a la Información Pública (AAIP).</p>
            <p>Los datos de salud son considerados datos sensibles y son tratados con el máximo nivel de protección. Docto implementa:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Cifrado TLS en tránsito para todas las comunicaciones.</li>
              <li>Cifrado AES-256 en reposo para datos almacenados.</li>
              <li>Row Level Security en la base de datos — cada usuario solo accede a sus propios datos.</li>
              <li>Autenticación segura mediante contraseña y Google OAuth.</li>
            </ul>
            <p>Los datos no son vendidos ni cedidos a terceros con fines comerciales. El titular de los datos puede ejercer sus derechos de acceso, rectificación, actualización y supresión enviando un correo a soporte@docto.com.ar. Los datos se conservan por un plazo de 5 años desde la última actividad.</p>
          </Section>

          <Section title="8. Conducta del usuario y usos prohibidos">
            <p>Al utilizar Docto, el usuario se compromete a no:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Proporcionar información falsa sobre su identidad o estado de salud.</li>
              <li>Suplantar la identidad de otra persona.</li>
              <li>Grabar, reproducir o distribuir el contenido de las videoconsultas sin consentimiento expreso del profesional.</li>
              <li>Utilizar la plataforma para fines distintos a la consulta médica legítima.</li>
              <li>Intentar acceder a datos de otros usuarios o vulnerar la seguridad del sistema.</li>
              <li>Hostigar, amenazar o faltar el respeto a los profesionales de la salud.</li>
              <li>Solicitar prescripciones de medicamentos controlados de forma reiterada y sin justificación clínica.</li>
            </ul>
          </Section>

          <Section title="9. Limitación de responsabilidad">
            <p>Docto no será responsable por:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Las decisiones clínicas, diagnósticos o tratamientos indicados por los profesionales de la salud.</li>
              <li>Los resultados de los tratamientos médicos seguidos por el paciente.</li>
              <li>Daños derivados del uso incorrecto de la plataforma o de la información proporcionada por el usuario.</li>
              <li>Interrupciones del servicio por causas de fuerza mayor o fallas de terceros proveedores.</li>
              <li>El uso de la plataforma en situaciones de emergencia o urgencia.</li>
              <li>Demoras en la atención derivadas de la disponibilidad de profesionales.</li>
            </ul>
            <p>La responsabilidad máxima de Docto ante el usuario, en cualquier circunstancia, no podrá exceder el importe abonado por la consulta en cuestión.</p>
          </Section>

          <Section title="10. Propiedad intelectual">
            <p>Todo el contenido de la plataforma Docto — incluyendo su diseño, código fuente, marca, logotipo, textos e interfaz — es propiedad exclusiva de Diego Oscar González y está protegido por las leyes de propiedad intelectual vigentes en Argentina. Queda prohibida la reproducción, distribución o modificación de cualquier elemento de la plataforma sin autorización expresa y por escrito.</p>
          </Section>

          <Section title="11. Modificaciones del servicio">
            <p>Docto se reserva el derecho de modificar, suspender o discontinuar, en forma temporal o permanente, cualquier aspecto de la plataforma. En caso de cambios significativos que afecten los derechos del usuario, se notificará por correo electrónico con al menos 15 días de anticipación.</p>
          </Section>

          <Section title="12. Ley aplicable y jurisdicción">
            <p>Estos Términos se rigen por las leyes de la República Argentina. Para cualquier disputa derivada del uso de la plataforma, las partes se someten a la jurisdicción de los tribunales ordinarios de la Ciudad Autónoma de Buenos Aires, renunciando expresamente a cualquier otro fuero que pudiera corresponder.</p>
          </Section>

          <Section title="13. Contacto y soporte">
            <ul className="list-disc pl-5 space-y-1">
              <li>Correo electrónico: soporte@docto.com.ar</li>
              <li>Sitio web: docto.com.ar</li>
              <li>Domicilio: Olga Cossettini 1540, Piso 6, Of. 601, Puerto Madero, CABA, Argentina.</li>
              <li>Horario de atención: lunes a viernes de 9 a 18hs (horario Argentina).</li>
            </ul>
          </Section>

          <div className="mt-6 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
            Docto — docto.com.ar — Última actualización: 26 de abril de 2026
            <br />
            AAIP RL-2026-36086505 | soporte@docto.com.ar
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
          style={{ backgroundColor: "#378ADD" }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="mb-2 font-semibold text-gray-900">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
