export default function TerminosMedicoContent({ hideTitle = false }: { hideTitle?: boolean }) {
  return (
    <article className="prose prose-sm prose-gray max-w-none">
      {!hideTitle && (
        <>
          <h1 className="text-center text-2xl font-bold text-gray-900">
            Términos y Condiciones para Profesionales de la Salud
          </h1>
          <p className="text-center text-sm text-gray-500">
            Versión vigente desde el 29 de mayo de 2026
          </p>
        </>
      )}

      <h2>1. Objeto y naturaleza de la relación</h2>
      <p><strong>Docto</strong> es una plataforma tecnológica de telemedicina inscripta en el Registro Nacional de Plataformas Digitales de Salud (ReNaPDiS) bajo el N° 0270 y ante la Agencia de Acceso a la Información Pública (AAIP) bajo el legajo RL-2026-36086505.</p>
      <p>Al registrarte como profesional de la salud en Docto, adherís a estos Términos y Condiciones. Esta adhesión no genera relación de dependencia, asociación, sociedad ni vínculo laboral de ningún tipo entre vos y Docto. Actuás como profesional independiente y ejercés la medicina bajo tu propia matrícula, responsabilidad y criterio clínico.</p>
      <p>Docto actúa exclusivamente como intermediario tecnológico: facilita la conexión entre vos y los pacientes, provee la infraestructura para la videoconsulta, y gestiona el procesamiento de pagos. Docto no ejerce la medicina ni interviene en las decisiones clínicas.</p>

      <h2>2. Requisitos para operar en la plataforma</h2>
      <p>Al registrarte y al mantener tu perfil activo en Docto, declarás y garantizás que:</p>
      <ul>
        <li>Contás con título habilitante y matrícula profesional vigente, emitida por la autoridad competente de tu jurisdicción.</li>
        <li>Tu matrícula no se encuentra suspendida, cancelada ni sujeta a restricciones que impidan el ejercicio de tu profesión.</li>
        <li>Cumplís con los requisitos legales para el ejercicio de la telemedicina conforme a la Ley 27.553 y la normativa aplicable.</li>
        <li>Los datos de matrícula, especialidad y formación que proporcionás son verídicos y están actualizados.</li>
        <li>Contás con seguro de responsabilidad profesional vigente o asumís personalmente la responsabilidad derivada de tu ejercicio profesional.</li>
      </ul>
      <p>Docto verifica la matrícula informada a través del sistema SISA/REFEPS del Ministerio de Salud de la Nación. Si la verificación resulta negativa o la matrícula se encontrara vencida o inhabilitada, Docto suspenderá tu perfil hasta que regularices la situación.</p>
      <p>Es tu responsabilidad informar a Docto cualquier cambio en el estado de tu matrícula dentro de las 48 horas de producido.</p>

      <h2>3. Responsabilidad profesional</h2>
      <p>Toda decisión clínica adoptada durante una teleconsulta — incluyendo diagnósticos, indicaciones terapéuticas, prescripción de medicamentos y derivaciones — es de tu exclusiva responsabilidad profesional.</p>
      <p>Docto no responde por actos médicos, omisiones profesionales ni por los resultados de los tratamientos indicados. La relación médico-paciente se establece exclusivamente entre vos y el paciente.</p>
      <p>Te comprometés a:</p>
      <ul>
        <li>Ejercer tu profesión conforme a las normas éticas, legales y de buena práctica médica vigentes.</li>
        <li>Evaluar en cada caso si la consulta puede resolverse de forma remota o si el paciente requiere atención presencial, y en ese caso indicarlo expresamente.</li>
        <li>No utilizar la plataforma para atender emergencias ni urgencias médicas.</li>
        <li>Completar la documentación clínica de cada consulta (diagnóstico, indicaciones y, si corresponde, receta) antes de finalizarla.</li>
      </ul>

      <h2>4. Recetas digitales y firma electrónica</h2>
      <p>Las recetas emitidas a través de Docto son recetas digitales en los términos de la Ley 27.553 y el Decreto 63/2024.</p>
      <p>Al emitir recetas en la plataforma, utilizás firma electrónica conforme al art. 5 de la Ley 25.506. Esto significa que la receta se firma con tu identidad verificada en la plataforma (usuario autenticado + matrícula validada), sin requerir un certificado de firma digital emitido por un certificador licenciado.</p>
      <p>Al aceptar estos Términos, prestás tu consentimiento para el uso de firma electrónica en todos los documentos que generes en la plataforma, incluyendo recetas, indicaciones médicas e informes.</p>
      <p>La emisión de cada receta es una decisión exclusivamente tuya. Docto no puede obligarte a prescribir ni condicionar el contenido de una prescripción.</p>

      <h2>5. Comisión por intermediación</h2>
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-gray-800">
        <p className="font-semibold mb-2">Docto cobra una comisión sobre cada consulta efectivamente realizada como contraprestación por el uso de la plataforma.</p>
        <p>El porcentaje de comisión se establece según el perfil del profesional y se informa de forma clara antes de la activación de tu cuenta. Los rangos vigentes son del 5%, 10% o 15% según la categoría asignada.</p>
        <p className="mb-0">La comisión se descuenta automáticamente del pago del paciente mediante el sistema de pagos divididos (application_fee) de Mercado Pago. Vos recibís el importe neto directamente en tu cuenta de Mercado Pago. Docto no retiene ni transfiere fondos en ningún momento: el procesamiento lo realiza íntegramente Mercado Pago.</p>
      </div>
      <p>El porcentaje de comisión podrá ser modificado por Docto con un preaviso mínimo de 30 días corridos, notificado por correo electrónico. Si no estás de acuerdo con el nuevo porcentaje, podés dar de baja tu perfil sin penalidad.</p>

      <h2>5 bis. Recupero de reembolsos cubiertos por Docto</h2>
      <p>En Docto cobrás directo: el importe de cada consulta se acredita en tu cuenta de Mercado Pago, descontada la comisión de la plataforma. Eso te da liquidez inmediata, sin esperar liquidaciones ni cierres mensuales. Es una de las cosas que más cuidamos del modelo.</p>
      <p>Ese mismo modelo tiene una contracara que resolvemos juntos. Cuando corresponde reembolsar a un paciente por una cancelación o reprogramación atribuible a tu lado (por ejemplo, una consulta que cancelaste, una inasistencia tuya, o un reembolso que Docto adelanta para cuidar la experiencia del paciente), el dinero de esa consulta ya está en tu cuenta, no en la nuestra. Para que el paciente reciba su reembolso sin fricción y en el momento, Docto lo cubre primero y después lo recupera de tu saldo.</p>
      <p>Por eso, <strong>autorizás de forma expresa e irrevocable a Docto a recuperar de tu cuenta y/o a compensar contra tus liquidaciones futuras</strong> todo importe que Docto haya reembolsado a un paciente por causas atribuibles a vos o a tu prestación, así como las comisiones y cargos asociados a ese reembolso. Esta autorización incluye el ajuste sobre la comisión de tus próximas consultas y la retención sobre acreditaciones pendientes o futuras, hasta cubrir el monto adeudado.</p>
      <p>Esta cláusula es una condición esencial para operar con cobro directo en Docto y la aceptás al adherir a estos Términos. Su aplicación es la ejecución de una autorización que ya prestaste: no constituye una modificación de términos y, por lo tanto, no requiere un preaviso adicional para cada recupero. Mantener saldo suficiente en tu cuenta asegura que estos reembolsos se procesen sin demoras y que, entre los dos, le demos al paciente la experiencia que esperamos de Docto.</p>
      <p>Cada vez que se ejecute un recupero te vamos a notificar el detalle (consulta, paciente, motivo e importe) para que tengas total trazabilidad.</p>

      <h2>6. Cuenta de Mercado Pago</h2>
      <p>Para recibir los pagos de tus consultas, debés vincular una cuenta de Mercado Pago activa a tu perfil en Docto. El proceso de vinculación se realiza mediante el flujo de autorización (OAuth) de Mercado Pago.</p>
      <p>Docto no tiene acceso a los fondos de tu cuenta de Mercado Pago ni interviene en el retiro de los mismos. La relación con Mercado Pago se rige por los términos de uso de dicha plataforma.</p>

      <h2>7. Establecimiento de aranceles</h2>
      <p>Vos establecés el precio de tus consultas. Docto no fija ni limita los aranceles. El precio que establezcas es el que se muestra al paciente antes de confirmar la reserva.</p>

      <h2>8. Protección de datos personales</h2>
      <p>Al atender pacientes a través de Docto, accedés a datos de salud que son datos sensibles conforme a la Ley 25.326 (art. 2). Te comprometés a:</p>
      <ul>
        <li>Tratar los datos de los pacientes exclusivamente para la finalidad de la atención médica.</li>
        <li>No copiar, descargar ni almacenar datos de pacientes fuera de la plataforma, salvo lo estrictamente necesario para la continuidad asistencial y conforme a la normativa vigente.</li>
        <li>Mantener el secreto profesional respecto de toda información obtenida durante las consultas.</li>
      </ul>
      <p>Para más información, consultá nuestra <a href="/privacidad" className="underline">Política de Privacidad</a>.</p>

      <h2>9. Suspensión y baja del perfil</h2>
      <p>Podés solicitar la baja de tu perfil en cualquier momento enviando un correo a soporte@docto.com.ar. La baja no genera penalidad ni cargo alguno. Las consultas pendientes al momento de la baja deberán ser atendidas o reprogramadas.</p>
      <p>Docto podrá suspender o dar de baja tu perfil en los siguientes casos:</p>
      <ul>
        <li>Matrícula vencida, suspendida o inhabilitada.</li>
        <li>Información falsa en tu perfil.</li>
        <li>Reclamos reiterados de pacientes que evidencien incumplimiento de buenas prácticas.</li>
        <li>Incumplimiento de estos Términos.</li>
      </ul>

      <h2>10. Propiedad intelectual</h2>
      <p>La plataforma Docto — incluyendo su diseño, marca, código fuente e interfaz — es propiedad de Docto. Tu adhesión no te otorga ningún derecho sobre la marca ni la plataforma más allá del uso de la misma como herramienta para la prestación de servicios profesionales.</p>

      <h2>11. Modificaciones</h2>
      <p>Docto se reserva el derecho de modificar estos Términos. Las modificaciones se notificarán por correo electrónico con al menos 15 días de anticipación. El uso continuado de la plataforma luego de publicados los cambios implica la aceptación de los nuevos términos. Si no estás de acuerdo, podés dar de baja tu perfil sin penalidad.</p>

      <h2>12. Ley aplicable y jurisdicción</h2>
      <p>Estos Términos se rigen por las leyes de la República Argentina. Para cualquier disputa derivada de esta relación, las partes se someten a la jurisdicción de los tribunales ordinarios de la Ciudad Autónoma de Buenos Aires.</p>

      <h2>13. Contacto</h2>
      <ul>
        <li>Correo electrónico: soporte@docto.com.ar</li>
        <li>Sitio web: docto.com.ar</li>
      </ul>

      <div className="mt-8 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
        Docto — docto.com.ar
        <br />
        AAIP RL-2026-36086505 | ReNaPDiS Plataforma 0270 | soporte@docto.com.ar
        <br />
        Última actualización: mayo de 2026
      </div>
    </article>
  );
}
