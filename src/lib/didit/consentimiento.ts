// ─── Consentimiento informado — verificación de identidad biométrica (Didit) ──
// Texto redactado por Carolina (legal) — dictamen 02/06/2026.
// Biometría = dato sensible (art. 7 Ley 25.326) → requiere consentimiento
// EXPRESO. Se registra en `aceptaciones_legales` (tipo 'datos_sensibles')
// ANTES de crear la sesión Didit. Sin aceptación, no se crea la sesión.
//
// IMPORTANTE: este texto es la fuente de verdad versionada. Si cambia, subir
// CONSENTIMIENTO_VERSION y re-sembrar la fila en versiones_textos_legales.

export const CONSENTIMIENTO_TIPO = "datos_sensibles" as const;
export const CONSENTIMIENTO_VERSION = "biometria_didit_v1" as const;

export const CONSENTIMIENTO_IDENTIDAD_TEXTO = `Verificación de identidad

Para protegerte a vos y a tus pacientes contra la suplantación de identidad, Docto verifica que sos efectivamente el titular de la matrícula que declarás. Esta verificación se hace una sola vez, ahora.

El proceso lo realiza Didit (Didit Inc.), un proveedor especializado en verificación de identidad. Vas a ser redirigido a su plataforma, donde se te pedirá:
- Escanear tu documento de identidad (DNI).
- Tomarte una selfie y realizar una prueba de vida (detección de que sos una persona real, presente en ese momento).

Didit comparará tu selfie con la foto de tu documento y validará tus datos contra el Registro Nacional de las Personas (RENAPER).

Qué pasa con tus datos:
- La imagen de tu rostro y tu documento, y los datos biométricos derivados, son procesados y almacenados por Didit, no por Docto.
- Docto recibe y conserva únicamente el resultado de la verificación (aprobada o rechazada) y los datos de tu documento: nombre, apellido, número de documento, fecha de nacimiento, sexo y nacionalidad. Docto no recibe ni almacena tu selfie ni ningún dato biométrico.
- Didit es una empresa con sede en el exterior, por lo que esta verificación implica una transferencia internacional de tus datos personales, que se realiza exclusivamente para esta finalidad. Podés consultar cómo Didit trata tus datos en su política de privacidad: didit.me.

El dato biométrico es un dato sensible (art. 7, Ley 25.326). Por eso necesitamos tu consentimiento expreso. Esta verificación es un requisito para operar como profesional en Docto.

Presto mi consentimiento expreso para que mi identidad sea verificada por Didit mediante el tratamiento de mi dato biométrico facial, y para la transferencia internacional de mis datos descripta arriba, con la finalidad exclusiva de validar mi identidad profesional en Docto.`;
