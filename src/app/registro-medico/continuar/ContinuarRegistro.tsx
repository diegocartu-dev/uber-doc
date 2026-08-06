"use client";

import { useState, useRef, useEffect } from "react";
import { comprimirImagen, comprimirImagenesDeFormData, pesoTotal } from "@/lib/imagenes/comprimir";
import { trackFunnel } from "@/lib/funnel-client";
import { normalizarTelefonoAR } from "@/lib/telefono";
import { Stethoscope, X, Upload, CheckCircle, ChevronLeft, Camera, Lightbulb } from "lucide-react";
import { completarRegistroMedico } from "@/app/auth/registro-medico/actions";
import FirmaCanvas, { type FirmaCanvasHandle } from "@/components/firma/FirmaCanvas";
import LoadingButton from "@/components/ui/LoadingButton";
import ModalTerminos from "@/components/ModalTerminos";

const ESPECIALIDADES = [
  "Alergia e inmunología",
  "Anatomía patológica",
  "Anestesiología",
  "Cardiología",
  "Cirugía cardiovascular",
  "Cirugía general",
  "Cirugía pediátrica",
  "Cirugía plástica y reparadora",
  "Cirugía torácica",
  "Cirugía vascular",
  "Clínica médica",
  "Coloproctología",
  "Cuidados paliativos",
  "Dermatología",
  "Diagnóstico por imágenes",
  "Emergentología",
  "Endocrinología",
  "Farmacología clínica",
  "Fisiatría",
  "Flebología",
  "Gastroenterología",
  "Genética médica",
  "Geriatría",
  "Ginecología",
  "Hematología",
  "Hemoterapia e inmunohematología",
  "Hepatología",
  "Infectología",
  "Mastología",
  "Medicina del deporte",
  "Medicina del trabajo",
  "Medicina familiar",
  "Medicina general y familiar",
  "Medicina legal",
  "Medicina nuclear",
  "Nefrología",
  "Neonatología",
  "Neumonología",
  "Neurocirugía",
  "Neurología",
  "Nutrición",
  "Obstetricia",
  "Oftalmología",
  "Oncología",
  "Ortopedia y traumatología",
  "Otorrinolaringología",
  "Patología",
  "Pediatría",
  "Psiquiatría",
  "Radioterapia",
  "Reumatología",
  "Terapia intensiva",
  "Toxicología",
  "Urología",
];

const PROVINCIAS = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// ─── Autosave del borrador (auditoría 06/08) ─────────────────────────────────
// El form pide 12 campos + credencial + firma, y cualquier recarga (sesión que
// expira, salir de la app a buscar el CUIT, batería) borraba TODO — el médico
// no volvía a empezar (~15 registros reales perdidos en 3 semanas). Guardamos un
// borrador en localStorage con los campos de texto/select + el paso. Archivos,
// firma y checkboxes legales NO se guardan: se re-adjuntan / re-aceptan al retomar.
const BORRADOR_KEY = "docto_borrador_registro_medico";
const BORRADOR_MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7 días y el borrador expira
const BORRADOR_DEBOUNCE_MS = 800;

type Borrador = {
  guardadoEn: number;
  paso: number;
  campos: Record<string, string>;
  tipoMatricula: string;
  numeroMatricula: string;
  tieneMatriculaExtra: boolean;
};

// Errores del server que en realidad pertenecen a un campo del PASO 1. Cuando
// llegan, el médico está parado en el paso 3 (firma): sin este mapa, el banner
// señalaba un campo que ni siquiera estaba en pantalla y el médico abandonaba.
// El orden importa: "El DNI no coincide con ... el CUIT" debe enfocar el DNI, y
// "la provincia de tu matrícula" la provincia (no el número de matrícula).
const ERRORES_SERVER_PASO1: { patron: RegExp; campo: string }[] = [
  { patron: /celular/i, campo: "celular_personal" },
  { patron: /dni/i, campo: "dni" },
  { patron: /cuit/i, campo: "cuit" },
  { patron: /provincia/i, campo: "provincia" },
  { patron: /matr[ií]cula/i, campo: "numero_matricula" },
];

function campoDelErrorServer(mensaje: string): string | null {
  // "Debés aceptar los términos y la declaración de matrícula" menciona
  // "matrícula" pero es del paso 2 — no hay que rebotar al médico al paso 1.
  if (/t[eé]rminos|declaraci[oó]n/i.test(mensaje)) return null;
  for (const { patron, campo } of ERRORES_SERVER_PASO1) {
    if (patron.test(mensaje)) return campo;
  }
  return null;
}

// Encabezado de bloque — SIN número: los números quedan reservados para la barra
// de progreso (pasos 1·2·3). Acento azul a la izquierda para jerarquía, sin badge
// circular que el ojo confunda con un "paso".
function BloqueHeader({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <div className="mb-1 border-l-2 border-[#378ADD] pl-3">
      <p className="text-[15px] font-semibold text-gray-900">{titulo}</p>
      <p className="mt-0.5 text-[13px] text-gray-500">{subtitulo}</p>
    </div>
  );
}

// Rediseño 14/07/2026 — FASE B del registro médico. El médico ya creó su cuenta
// (Fase A) y confirmó el mail → llega acá YA LOGUEADO. Completa datos + credencial
// → se crea la ficha de `medicos` → biometría (/registro-medico/identidad).
// La cuenta (nombre/email/password) ya existe: acá NO se pide de nuevo.
export default function ContinuarRegistro({ nombre }: { nombre: string }) {
  const [paso, setPaso] = useState(1);
  const [tipoMatricula, setTipoMatricula] = useState(""); // nada prellenado
  const [tieneMatriculaExtra, setTieneMatriculaExtra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkTerminos, setCheckTerminos] = useState(false);
  const [checkMatricula, setCheckMatricula] = useState(false);
  const [modalTerminos, setModalTerminos] = useState(false);
  const [modalMatricula, setModalMatricula] = useState(false);
  const [fotoCredencial, setFotoCredencial] = useState<File | null>(null);
  const [fotoPerfil, setFotoPerfil] = useState<File | null>(null);
  const [numeroMatricula, setNumeroMatricula] = useState("");
  const [borradorRestaurado, setBorradorRestaurado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const firmaRef = useRef<FirmaCanvasHandle>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Campos de texto/select del borrador que faltan aplicar al DOM (ver efecto).
  const camposPendientesRef = useRef<Record<string, string> | null>(null);
  // Espejo de los estados que el autosave lee desde un listener montado UNA vez
  // (evita closures viejas sin tener que re-atar el listener en cada render).
  const estadoRef = useRef({ paso, tipoMatricula, numeroMatricula, tieneMatriculaExtra });
  estadoRef.current = { paso, tipoMatricula, numeroMatricula, tieneMatriculaExtra };

  // Junta los campos de texto/select del form (uncontrolled: la verdad vive en el
  // DOM) + los estados controlados, y persiste el borrador. Archivos, firma y
  // checkboxes legales quedan afuera a propósito. TODO acceso a localStorage va
  // con try/catch: Safari en modo privado lanza al escribir.
  function guardarBorrador() {
    const form = formRef.current;
    if (!form) return;
    const { paso, tipoMatricula, numeroMatricula, tieneMatriculaExtra } = estadoRef.current;
    const campos: Record<string, string> = {};
    for (const el of Array.from(form.elements)) {
      if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "tel") && el.name) {
        campos[el.name] = el.value;
      } else if (el instanceof HTMLSelectElement && el.name) {
        campos[el.name] = el.value;
      }
    }
    const hayAlgo = Object.values(campos).some((v) => v.trim() !== "") || tieneMatriculaExtra;
    if (!hayAlgo) return; // no crear borradores vacíos con solo abrir la página
    const borrador: Borrador = { guardadoEn: Date.now(), paso, campos, tipoMatricula, numeroMatricula, tieneMatriculaExtra };
    try {
      localStorage.setItem(BORRADOR_KEY, JSON.stringify(borrador));
    } catch {
      // Safari privado / cuota llena: seguimos sin autosave, jamás romper el form.
    }
  }

  function limpiarBorrador() {
    // Cancelar el debounce pendiente: si quedara vivo, re-escribiría el borrador
    // DESPUÉS de borrado y el próximo médico vería "retomamos tu registro" fantasma.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    try {
      localStorage.removeItem(BORRADOR_KEY);
    } catch {
      // sin acceso a localStorage no hay borrador que limpiar
    }
  }

  // Restaurar el borrador al montar (si existe y tiene menos de 7 días). Los
  // campos uncontrolled se aplican en el efecto SIGUIENTE: los condicionales
  // (provincia, matrícula provincial) recién existen en el render posterior a
  // restaurar los estados controlados. El médico retoma en el paso 1: credencial
  // y firma no se guardan, así que los pasos 2-3 hay que rehacerlos igual.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BORRADOR_KEY);
      if (!raw) return;
      const b = JSON.parse(raw) as Partial<Borrador> | null;
      if (!b || typeof b !== "object" || typeof b.guardadoEn !== "number" || Date.now() - b.guardadoEn > BORRADOR_MAX_MS) {
        localStorage.removeItem(BORRADOR_KEY);
        return;
      }
      const campos = { ...(b.campos ?? {}) };
      // Los controlados se restauran por estado, no por DOM (React los pisaría).
      delete campos["tipo_matricula"];
      delete campos["numero_matricula"];
      camposPendientesRef.current = campos;
      if (typeof b.tipoMatricula === "string") setTipoMatricula(b.tipoMatricula);
      if (typeof b.numeroMatricula === "string") setNumeroMatricula(b.numeroMatricula);
      if (b.tieneMatriculaExtra === true) setTieneMatriculaExtra(true);
      setBorradorRestaurado(true); // banner discreto en el paso 1
      trackFunnel("registro_medico_paso", { paso: 1, borrador_restaurado: true });
    } catch {
      // localStorage bloqueado (Safari privado) o JSON roto: registro desde cero.
    }
  }, []);

  // Aplica al DOM los campos de texto/select del borrador. Corre al montar y cada
  // vez que cambian los condicionales: "provincia" existe recién cuando
  // tipoMatricula ya se restauró a "MP". Idempotente: cada campo se aplica una
  // sola vez (se saca de pendientes) para no pisar ediciones posteriores.
  useEffect(() => {
    const pendientes = camposPendientesRef.current;
    const form = formRef.current;
    if (!pendientes || !form) return;
    for (const [name, value] of Object.entries(pendientes)) {
      const el = form.elements.namedItem(name);
      if (
        (el instanceof HTMLInputElement && (el.type === "text" || el.type === "tel")) ||
        el instanceof HTMLSelectElement
      ) {
        el.value = value;
        delete pendientes[name];
      }
    }
    if (Object.keys(pendientes).length === 0) camposPendientesRef.current = null;
  }, [borradorRestaurado, tipoMatricula, tieneMatriculaExtra]);

  // Autosave con debounce (~800ms): un solo listener a nivel form — los eventos
  // "input"/"change" de todos los campos burbujean hasta acá.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onEdicion = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(guardarBorrador, BORRADOR_DEBOUNCE_MS);
    };
    form.addEventListener("input", onEdicion);
    form.addEventListener("change", onEdicion);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      form.removeEventListener("input", onEdicion);
      form.removeEventListener("change", onEdicion);
    };
    // guardarBorrador lee todo de refs (formRef/estadoRef): seguro de capturar una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guardado extra al cambiar de paso (además del debounce): el momento de mayor
  // riesgo de pérdida es justo después de completar un paso entero.
  useEffect(() => {
    guardarBorrador();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  // Instrumentación del form (decisión Diego 04/08): los 16 registros trabados
  // de jul/ago murieron ACÁ adentro sin dejar rastro de en qué paso. Un evento
  // por paso visto y uno por cada error mostrado — fire-and-forget, jamás
  // bloquea al médico.
  useEffect(() => {
    trackFunnel("registro_medico_paso", { paso });
  }, [paso]);

  function reportarError(donde: string, msg: string) {
    setError(msg);
    trackFunnel("registro_medico_error", { donde, motivo: msg });
  }

  // Error de un campo puntual del paso 1: banner + foco + scroll al campo. En un
  // form de 12 campos, el banner solo no alcanza para encontrar cuál corregir.
  function errorCampo(name: string, msg: string): false {
    reportarError("paso1", msg);
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLElement) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return false;
  }

  /**
   * Prepara un archivo recién elegido: lo COMPRIME primero y recién después
   * chequea el tope. Devuelve el archivo listo, o `undefined` si fue rechazado.
   *
   * El orden importa y ya nos costó caro dos veces (credencial 01/08, firma
   * 04/08): una foto de celular pesa 4-8 MB, así que rechazar ANTES de
   * comprimir deja al médico sin salida — no tiene cómo achicarla desde el
   * teléfono. Comprimida, una credencial de 8 MB queda en ~600 KB legibles.
   * Los PDF no se comprimen: ahí el tope se aplica con un mensaje que dice
   * qué hacer.
   */
  async function prepararImagen(input: HTMLInputElement, etiqueta: string): Promise<File | null> {
    const original = input.files?.[0] ?? null;
    if (!original) return null;
    setError(null);

    const file = await comprimirImagen(original);
    if (file.size > MAX_FILE_SIZE) {
      reportarError(
        "archivo",
        file.type === "application/pdf"
          ? `El PDF de la ${etiqueta} es muy pesado (más de 5 MB). Probá sacarle una foto en vez de subir el PDF.`
          : `No pudimos achicar la ${etiqueta} lo suficiente. Probá sacar la foto de nuevo con menos zoom.`
      );
      input.value = "";
      // Devuelve null (no undefined): el estado tiene que quedar VACÍO igual que
      // el input. Si conservaba el archivo anterior, la pantalla mostraba el
      // tilde verde con un input vacío → el envío fallaba con "Subí la foto de
      // tu credencial" sobre una pantalla que decía que estaba subida, y el
      // médico quedaba en un loop cerrado (auditoría 06/08).
      return null;
    }
    return file;
  }

  // Paso 1 — "Completá tus datos": valida los 3 bloques. Teléfono profesional y
  // foto de perfil son OPCIONALES. La cuenta (email/password/nombre) ya existe.
  function validarPaso1(): boolean {
    const form = formRef.current;
    if (!form) return false;
    const requeridos: { name: string; label: string }[] = [
      { name: "titulo", label: "Título profesional" },
      { name: "especialidad", label: "Especialidad" },
      { name: "tipo_matricula", label: "Tipo de matrícula" },
      { name: "numero_matricula", label: "Número de matrícula" },
      { name: "dni", label: "DNI" },
      { name: "cuit", label: "CUIT" },
      { name: "domicilio_consultorio", label: "Domicilio del consultorio" },
      { name: "celular_personal", label: "Celular personal" },
    ];
    for (const { name, label } of requeridos) {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
      if (!el || !el.value.trim()) {
        reportarError("paso1", `Completá el campo "${label}".`);
        el?.focus();
        return false;
      }
    }
    if (tipoMatricula === "MP") {
      const prov = (form.elements.namedItem("provincia") as HTMLSelectElement)?.value;
      if (!prov) {
        reportarError("paso1", "Seleccioná la provincia de tu matrícula.");
        return false;
      }
    }
    // DNI: aceptar que el médico lo escriba con puntos ("25.086.458") — limpiar
    // puntos/espacios/guiones ANTES de validar, y dejar el valor limpio en el
    // input para que el server (que cruza DNI vs CUIT dígito a dígito y lo
    // persiste) reciba solo números.
    const dniInput = form.elements.namedItem("dni") as HTMLInputElement;
    const dni = dniInput.value.replace(/[.\s-]/g, "");
    if (!/^\d{7,8}$/.test(dni)) {
      return errorCampo("dni", "El DNI debe tener 7 u 8 dígitos numéricos.");
    }
    dniInput.value = dni;

    // CUIT: 11 dígitos + cruce con el DNI (dígitos 3-10 del CUIT = DNI). Antes
    // esto validaba recién en el server y el error aparecía en el paso 3, a dos
    // pantallas del campo (auditoría 06/08 — así se perdían registros reales).
    const cuitInput = form.elements.namedItem("cuit") as HTMLInputElement;
    const cuitLimpio = cuitInput.value.replace(/[.\s-]/g, "");
    if (!/^\d{11}$/.test(cuitLimpio)) {
      return errorCampo("cuit", "El CUIT debe tener 11 dígitos (formato: XX-XXXXXXXX-X).");
    }
    if (cuitLimpio.substring(2, 10) !== dni.padStart(8, "0")) {
      return errorCampo("cuit", "El DNI no coincide con los dígitos centrales del CUIT. Revisá los dos.");
    }

    // Celular: la MISMA regla que aplica el server al normalizar para WhatsApp
    // (normalizarTelefonoAR) — si acá pasa, allá pasa.
    const celularInput = form.elements.namedItem("celular_personal") as HTMLInputElement;
    if (!normalizarTelefonoAR(celularInput.value)) {
      return errorCampo(
        "celular_personal",
        "Revisá el celular: tiene que ser un móvil argentino de 10 dígitos (código de área + número, ej: 11 4028 9141)."
      );
    }
    return true;
  }

  // Paso 2 — credencial obligatoria + ambos checks legales, ANTES de avanzar
  // al paso de firma (spec Sofía 20/07: el submit real ocurre en el paso 3).
  function validarPaso2(): boolean {
    if (!fotoCredencial) {
      reportarError("paso2", "Subí la foto de tu credencial médica para continuar.");
      return false;
    }
    if (!checkTerminos || !checkMatricula) {
      reportarError("paso2", "Aceptá los términos y la declaración de matrícula para continuar.");
      return false;
    }
    return true;
  }

  function siguiente() {
    setError(null);
    if (paso === 1 && validarPaso1()) {
      setPaso(2);
      // El paso 1 es largo: al cambiar de paso el scroll queda al pie y el
      // médico ve el paso nuevo "desde abajo" (bug reportado por Diego 15/07).
      window.scrollTo(0, 0);
      return;
    }
    if (paso === 2 && validarPaso2()) {
      setPaso(3);
      window.scrollTo(0, 0);
    }
  }

  function anterior() {
    setError(null);
    setPaso((p) => Math.max(1, p - 1));
    window.scrollTo(0, 0);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (paso < 3) { siguiente(); return; }
    // Firma OBLIGATORIA (Diego 20/07, "todo de un tirón"): sin ficha creada
    // todavía, el blob viaja en el MISMO FormData del registro y la action lo
    // sube con service role (insert atómico — patrón credencial).
    if (firmaRef.current?.isEmpty()) {
      // El mensaje habla del gesto que el médico está intentando: decirle
      // "dibujá" a quien está subiendo una imagen era un callejón sin salida
      // (caso Davide 03/08 — la foto >2MB se rechazaba y esto lo confundía más).
      reportarError(
        "firma",
        firmaRef.current.modo() === "subir"
          ? "Subí la imagen de tu firma (o dibujala en el recuadro) para continuar."
          : "Dibujá tu firma para continuar."
      );
      window.scrollTo(0, 0); // el banner de error vive arriba del form
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const firmaBlob = await firmaRef.current?.getBlob();
      if (!firmaBlob) {
        reportarError(
          "firma",
          firmaRef.current?.modo() === "subir"
            ? "Subí la imagen de tu firma (o dibujala en el recuadro) para continuar."
            : "Dibujá tu firma para continuar."
        );
        setLoading(false);
        window.scrollTo(0, 0);
        return;
      }
      formData.append("firma_manuscrita", firmaBlob, "firma.png");

      // Achicar las fotos ACÁ, en el teléfono del médico: Vercel rechaza los
      // envíos de más de ~4,5 MB con un error que el usuario no entiende, y era
      // la causa de que ~la mitad de los registros murieran en este paso
      // (hallazgo 01/08). Una credencial de 5 MB queda en ~600 KB legibles.
      await comprimirImagenesDeFormData(formData, ["foto_credencial", "foto_perfil"]);

      // Red de contención: si aun comprimido el envío sigue siendo enorme, se lo
      // decimos en criollo en vez de dejar que la plataforma lo corte en silencio.
      if (pesoTotal(formData) > 4 * 1024 * 1024) {
        reportarError("peso", "Las fotos son demasiado pesadas. Probá sacarlas de nuevo con menos zoom o subir una imagen más liviana.");
        setLoading(false);
        window.scrollTo(0, 0);
        return;
      }

      const result = await completarRegistroMedico(formData);
      // Éxito = redirect server-side a /registro-medico/identidad (no vuelve).
      if (result?.error) {
        reportarError("envio", result.error);
        setLoading(false);
        // Si el error del server pertenece a un campo del paso 1 (celular, CUIT,
        // DNI, matrícula), volver al paso 1 y enfocar ese campo: el médico está
        // parado en el paso de firma y el banner solo no dice DÓNDE corregir.
        const campo = campoDelErrorServer(result.error);
        if (campo) setPaso(1);
        window.scrollTo(0, 0);
        if (campo) {
          // El foco recién puede aplicarse cuando React ya re-renderizó el paso 1
          // (los pasos ocultos tienen display:none y focus() ahí es un no-op).
          setTimeout(() => {
            const el = formRef.current?.elements.namedItem(campo);
            if (el instanceof HTMLElement) el.focus({ preventScroll: true });
          }, 50);
        }
      }
    } catch (err) {
      // El redirect() del server action viaja como excepción (NEXT_REDIRECT).
      // NO es un error: atraparlo mostraba "Error al enviar el registro" con la
      // ficha YA creada y la navegación en curso — el médico creía que falló y
      // abandonaba (cazado por la instrumentación en la prueba de Diego 05/08).
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
      ) {
        // Envío EXITOSO (navegando a la biometría): el borrador ya no sirve.
        // Limpiarlo ANTES de relanzar — después del throw no corre nada más.
        // Es el ÚNICO lugar donde se borra: un envío fallido debe conservarlo.
        limpiarBorrador();
        throw err; // Next completa la navegación a /registro-medico/identidad
      }
      reportarError("envio", "Error al enviar el registro. Recargá la página e intentá de nuevo.");
      setLoading(false);
      window.scrollTo(0, 0);
    }
  }

  const inputClass =
    "mt-1 block w-full h-11 rounded-[var(--radius-md)] border border-gray-300 px-3 text-[15px] shadow-sm focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/30";
  const labelClass = "block text-[13px] font-medium text-gray-700";
  const hintClass = "mt-1 text-[13px] text-gray-500";
  const pasoTitulos = ["Completá tus datos", "Tu credencial", "Tu firma", "Verificá tu identidad"];

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </div>

        {/* Progreso — 4 pasos: datos, credencial, firma, identidad (este form cubre 1-3). */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  n === paso
                    ? "bg-[#378ADD] text-white"
                    : n < paso
                      ? "bg-[#378ADD]/20 text-[#378ADD]"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {n < paso ? "✓" : n}
              </div>
              {n < 4 && (
                <div className={`h-0.5 w-6 rounded transition-colors ${n < paso ? "bg-[#378ADD]/40" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        {paso === 1 && nombre && (
          <p className="mb-1 text-center text-sm text-gray-500">
            Hola, <strong className="text-gray-800">{nombre}</strong> 👋 Tu cuenta ya está creada.
          </p>
        )}
        <h2 className="text-center text-xl font-semibold text-gray-900">
          {pasoTitulos[paso - 1]}
        </h2>
        <p className="mt-1 text-center text-sm text-gray-500">Paso {paso} de 4</p>

        {/* noValidate: las burbujas nativas del navegador se disparaban ANTES del
            onSubmit y esos rebotes no dejaban rastro en la instrumentación.
            Nuestra validación (validarPaso1/2 + firma) ya cubre todo. */}
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          {error && (
            <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "rgba(226,75,74,0.08)", color: "#E24B4A" }}>
              {error}
            </div>
          )}
          {borradorRestaurado && paso === 1 && (
            <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "rgba(55,138,221,0.08)", color: "#2d75c4" }}>
              Retomamos tu registro donde lo dejaste — tus datos están guardados.
              Volvé a adjuntar la credencial y la firma al avanzar.
            </div>
          )}

          {/* ═══ PASO 1: Completá tus datos (3 bloques por propósito) ═══ */}
          <div className={paso === 1 ? "space-y-6" : "hidden"}>
            {/* 1 · Tus datos profesionales */}
            <div className="space-y-3">
              <BloqueHeader titulo="Tus datos profesionales" subtitulo="Con esto validamos tu matrícula y te mostramos a los pacientes." />
              <div>
                <label htmlFor="titulo" className={labelClass}>Título profesional</label>
                <select id="titulo" name="titulo" required className={inputClass} defaultValue="">
                  <option value="" disabled>Elegí tu título</option>
                  <option value="Dr.">Dr.</option>
                  <option value="Dra.">Dra.</option>
                </select>
              </div>
              <div>
                <label htmlFor="especialidad" className={labelClass}>Especialidad</label>
                <select id="especialidad" name="especialidad" required className={inputClass} defaultValue="">
                  <option value="" disabled>Seleccioná tu especialidad</option>
                  {ESPECIALIDADES.map((esp) => (
                    <option key={esp} value={esp}>{esp}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="w-40">
                  <label htmlFor="tipo_matricula" className={labelClass}>Matrícula</label>
                  <select
                    id="tipo_matricula"
                    name="tipo_matricula"
                    required
                    className={inputClass}
                    value={tipoMatricula}
                    onChange={(e) => {
                      setTipoMatricula(e.target.value);
                      if (e.target.value === "MP") setTieneMatriculaExtra(false);
                    }}
                  >
                    <option value="" disabled>Elegí</option>
                    <option value="MN">MN — Nacional</option>
                    <option value="MP">MP — Provincial</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label htmlFor="numero_matricula" className={labelClass}>Número</label>
                  <input id="numero_matricula" name="numero_matricula" type="text" required inputMode="numeric" className={inputClass} placeholder="123456" value={numeroMatricula} onChange={(e) => setNumeroMatricula(e.target.value)} />
                </div>
              </div>
              {tipoMatricula === "MP" && (
                <div>
                  <label htmlFor="provincia" className={labelClass}>Provincia de la matrícula</label>
                  <select id="provincia" name="provincia" required className={inputClass} defaultValue="">
                    <option value="" disabled>Seleccioná tu provincia</option>
                    {PROVINCIAS.map((prov) => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                </div>
              )}
              {tipoMatricula === "MN" && (
                <div>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={tieneMatriculaExtra}
                      onChange={(e) => setTieneMatriculaExtra(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    También tengo matrícula provincial
                  </label>
                  {tieneMatriculaExtra && (
                    <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
                      <div>
                        <label htmlFor="matricula_provincial" className={labelClass}>Número de matrícula provincial</label>
                        <input id="matricula_provincial" name="matricula_provincial" type="text" className={inputClass} placeholder="MP 45678" />
                      </div>
                      <div>
                        <label htmlFor="provincia_matricula" className={labelClass}>Provincia</label>
                        <select id="provincia_matricula" name="provincia_matricula" className={inputClass} defaultValue="">
                          <option value="">Seleccioná</option>
                          {PROVINCIAS.map((prov) => (
                            <option key={prov} value={prov}>{prov}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label htmlFor="dni" className={labelClass}>DNI</label>
                  {/* maxLength 10: "25.086.458" ocupa 10 caracteres — con maxLength 8
                      el navegador truncaba el pegado EN SILENCIO y el DNI quedaba mocho. */}
                  <input id="dni" name="dni" type="text" required inputMode="numeric" maxLength={10} className={inputClass} placeholder="25086458" />
                </div>
                <div className="flex-1">
                  <label htmlFor="cuit" className={labelClass}>CUIT</label>
                  <input id="cuit" name="cuit" type="text" required inputMode="numeric" className={inputClass} placeholder="27-25086458-4" />
                </div>
              </div>
            </div>

            {/* 2 · Tu consultorio */}
            <div className="space-y-3">
              <BloqueHeader titulo="Tu consultorio" subtitulo="Estos datos aparecen impresos en tus recetas." />
              <div>
                <label htmlFor="domicilio_consultorio" className={labelClass}>Domicilio del consultorio</label>
                <input id="domicilio_consultorio" name="domicilio_consultorio" type="text" required className={inputClass} placeholder="Av. Rivadavia 4500, CABA" />
                <p className={hintClass}>Va en el pie de tus recetas, como pide la normativa.</p>
              </div>
              <div>
                <label htmlFor="telefono" className={labelClass}>Teléfono profesional <span className="font-normal text-gray-400">(opcional)</span></label>
                <input id="telefono" name="telefono" type="tel" className={inputClass} placeholder="11 4000-0000" />
                <p className={hintClass}>Este teléfono sí aparece en tus recetas.</p>
              </div>
              <div>
                <label htmlFor="foto_perfil" className={labelClass}>Foto de perfil <span className="font-normal text-gray-400">(opcional)</span></label>
                <label
                  htmlFor="foto_perfil"
                  className="mt-1 flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 transition hover:border-gray-400 hover:bg-gray-50"
                >
                  {fotoPerfil ? (
                    <>
                      <CheckCircle size={20} className="text-[#1D9E75]" />
                      <span className="text-gray-700">{fotoPerfil.name}</span>
                    </>
                  ) : (
                    <>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#378ADD]/10 text-[#378ADD]"><Camera size={18} /></span>
                      <span>Subir foto</span>
                    </>
                  )}
                </label>
                <input
                  id="foto_perfil"
                  name="foto_perfil"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    setFotoPerfil(await prepararImagen(e.target, "foto de perfil"));
                  }}
                />
                <p className={hintClass}>La ven los pacientes en tu bio. Distinta de la credencial (próximo paso).</p>
              </div>
            </div>

            {/* 3 · Cómo te avisamos */}
            <div className="space-y-3">
              <BloqueHeader titulo="Cómo te avisamos" subtitulo="Solo uso interno administrativo." />
              <div>
                <label htmlFor="celular_personal" className={labelClass}>Celular personal</label>
                <input id="celular_personal" name="celular_personal" type="tel" required className={inputClass} placeholder="11 2345-6789" />
                <p className={hintClass}>Te avisamos acá cuando un paciente te está esperando. Los pacientes no ven este teléfono.</p>
              </div>
            </div>
          </div>

          {/* ═══ PASO 2: Tu credencial + términos ═══ */}
          <div className={paso === 2 ? "space-y-4" : "hidden"}>
            <p className="text-sm text-gray-500">
              Así confirmamos que la matrícula{" "}
              <strong className="text-gray-700">{tipoMatricula} {numeroMatricula || "…"}</strong> es tuya.
            </p>
            <div>
              <label
                htmlFor="foto_credencial"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 transition hover:border-gray-400 hover:bg-gray-50"
              >
                {fotoCredencial ? (
                  <>
                    <CheckCircle size={22} className="text-[#1D9E75]" />
                    <span className="text-gray-700">{fotoCredencial.name}</span>
                  </>
                ) : (
                  <>
                    <Upload size={22} />
                    <span className="font-medium text-gray-700">Sacale una foto o subila</span>
                    <span className="text-xs text-gray-400">JPG, PNG o PDF · hasta 5 MB</span>
                  </>
                )}
              </label>
              <input
                id="foto_credencial"
                name="foto_credencial"
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={async (e) => {
                  setFotoCredencial(await prepararImagen(e.target, "credencial"));
                }}
              />
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <p className="font-medium text-gray-900">¿Qué es la credencial?</p>
              <ul className="mt-2 space-y-1.5">
                <li className="flex items-start gap-2 text-gray-600"><CheckCircle size={16} className="mt-0.5 shrink-0 text-[#1D9E75]" /><span>El carnet o certificado de tu matrícula profesional (el que emite el Ministerio o el Colegio Médico).</span></li>
                <li className="flex items-start gap-2 text-gray-600"><X size={16} className="mt-0.5 shrink-0 text-[#E24B4A]" /><span>No es tu DNI ni tu CV ni tu título.</span></li>
                <li className="flex items-start gap-2 text-gray-600"><Lightbulb size={16} className="mt-0.5 shrink-0 text-[#BA7517]" /><span>Que se lea completa: tu nombre y el número de matrícula, sin reflejos.</span></li>
              </ul>
            </div>

            {/* Términos y declaración — antes de crear la ficha */}
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <label className="flex cursor-pointer items-start gap-3 py-1">
                <input
                  type="checkbox"
                  checked={checkTerminos}
                  onChange={(e) => setCheckTerminos(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">
                  Leí y acepto los{" "}
                  <button type="button" onClick={() => setModalTerminos(true)} className="font-medium underline" style={{ color: "#378ADD" }}>
                    términos y condiciones
                  </button>{" "}
                  de Docto
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 py-1">
                <input
                  type="checkbox"
                  checked={checkMatricula}
                  onChange={(e) => setCheckMatricula(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">
                  Declaro que la información de mi matrícula profesional es
                  verídica y que soy responsable de mis actos médicos como{" "}
                  <button type="button" onClick={() => setModalMatricula(true)} className="font-medium underline" style={{ color: "#378ADD" }}>
                    profesional independiente
                  </button>
                </span>
              </label>
            </div>
            {checkTerminos && <input type="hidden" name="terminos_aceptados" value="true" />}
            {checkMatricula && <input type="hidden" name="declaracion_matricula" value="true" />}
          </div>

          {/* ── Paso 3: Tu firma (spec Sofía 20/07 — "todo de un tirón") ── */}
          <div className={paso === 3 ? "space-y-4" : "hidden"}>
            <p className="text-sm text-gray-600">
              Aparece impresa en cada receta, certificado e indicación que
              emitas. Firmá en el recuadro como lo hacés en papel.
            </p>
            <FirmaCanvas
              ref={firmaRef}
              activo={paso === 3}
              altura={200}
              onErrorArchivo={(motivo) =>
                trackFunnel("registro_medico_error", { donde: "firma_archivo", motivo })
              }
            />
          </div>

          {/* Navegación */}
          <div className="flex gap-3 pt-2">
            {paso > 1 && (
              <button
                type="button"
                onClick={anterior}
                className="flex h-11 items-center gap-1 rounded-[var(--radius-md)] border border-gray-200 px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-50 active:scale-[0.97]"
              >
                <ChevronLeft size={16} />
                Atrás
              </button>
            )}

            {paso < 3 ? (
              <button
                type="button"
                onClick={siguiente}
                className="flex-1 h-11 rounded-[var(--radius-md)] bg-[#378ADD] text-sm font-semibold text-white shadow-sm transition hover:bg-[#2d75c4] active:scale-[0.97]"
              >
                Siguiente
              </button>
            ) : (
              <LoadingButton
                type="submit"
                isLoading={loading}
                className="flex-1 h-11 rounded-[var(--radius-md)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "#378ADD" }}
              >
                Continuar a la verificación
              </LoadingButton>
            )}
          </div>
        </form>

        <ModalTerminos open={modalTerminos} onClose={() => setModalTerminos(false)} perfil="medico" />

        {modalMatricula && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Declaración de responsabilidad profesional
                </h2>
                <button onClick={() => setModalMatricula(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} strokeWidth={1.75} />
                </button>
              </div>
              <div className="mt-4 h-72 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
                <h3 className="font-semibold">Declaración jurada de responsabilidad profesional</h3>
                <p className="mt-2">Al aceptar esta declaración, el profesional médico certifica que:</p>
                <p className="mt-2"><strong>1.</strong> La información de matrícula profesional proporcionada es verídica, se encuentra vigente y corresponde a su persona. Cualquier falsedad constituye un delito penal conforme al artículo 292 del Código Penal Argentino.</p>
                <p className="mt-2"><strong>2.</strong> Actúa como profesional independiente conforme a la Ley 17.132 de Ejercicio de la Medicina. Es el único responsable de sus actos profesionales, diagnósticos, indicaciones y prescripciones realizadas a través de la plataforma.</p>
                <p className="mt-2"><strong>3.</strong> Se compromete a ejercer la telemedicina dentro de los límites de su especialidad y competencia, derivando a atención presencial cuando la situación clínica lo requiera.</p>
                <p className="mt-2"><strong>4.</strong> Docto no interviene en las decisiones médicas del profesional ni asume responsabilidad por las mismas. La plataforma actúa exclusivamente como intermediaria tecnológica.</p>
                <p className="mt-2"><strong>5.</strong> Se compromete a mantener actualizada su información profesional y a informar inmediatamente cualquier cambio en el estado de su matrícula.</p>
              </div>
              <button
                onClick={() => setModalMatricula(false)}
                className="mt-4 w-full rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "#378ADD" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
