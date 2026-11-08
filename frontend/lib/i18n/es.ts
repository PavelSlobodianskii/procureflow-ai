import { pluralWord } from "./plural";
import type { Dictionary } from "./types";

export const es: Dictionary = {
  nativeName: "Español",
  site: {
    skipToContent: "Saltar al contenido principal",
    devBadge: "Vista previa de desarrollo · Solo datos sintéticos",
    footer: "Proyecto de aprendizaje. Todos los nombres, artículos e importes son inventados.",
    languageLabel: "Idioma",
    themeLabel: "Modo oscuro",
  },
  page: {
    docTitle: "Nueva solicitud de compra",
    heroTitle: "Nueva solicitud de compra",
    introBefore: "Describe el artículo o servicio que necesitas. Esto solo guarda un ",
    introStrong: "borrador",
    introAfter: ".",
    chips: ["Solo borrador", "Datos sintéticos", "Total calculado por el servidor"],
    aboutTitle: "Sobre este formulario",
    about: [
      "Crea un borrador y nada más.",
      "Después de guardar, no se envía nada a nadie.",
      "Usa solo nombres y artículos inventados. Es un proyecto de aprendizaje.",
      "Los borradores se guardan en un almacenamiento de desarrollo temporal y desaparecen cuando el servidor se reinicia.",
      "El total estimado lo calcula el servidor, no tu navegador.",
    ],
  },
  form: {
    ariaLabel: "Formulario de solicitud de compra",
    allRequired: "Todos los campos son obligatorios.",
    save: "Guardar borrador",
    saving: "Guardando borrador…",
    retry: "Intentar de nuevo",
    savesOnly: "Solo guarda un borrador. No se envía nada a ningún sitio.",
  },
  sections: {
    need: { title: "¿Qué necesitas?", subtitle: "Describe el artículo o servicio." },
    cost: { title: "Estimación de costes", subtitle: "Basta con una estimación aproximada." },
    who: { title: "¿Quién lo solicita?", subtitle: "Un nombre inventado para esta demo." },
  },
  fields: {
    description: {
      label: "Descripción",
      hint: (min, max) => `Artículo o servicio que necesitas, de ${min} a ${max} caracteres.`,
    },
    quantity: { label: "Cantidad", hint: (min, max) => `Número entero, de ${min} a ${max}.` },
    unit_price: { label: "Precio unitario estimado", hint: "Usa un punto, por ejemplo 249.90." },
    currency: { label: "Moneda", hint: "Los importes no se convierten." },
    requester_display_name: {
      label: "Nombre visible del solicitante",
      hint: "Solo un nombre inventado. No introduzcas datos personales reales.",
    },
  },
  errorPrefix: "Error: ",
  validation: {
    $: { invalid_type: "El cuerpo de la solicitud debe ser un objeto JSON." },
    description: {
      required: "La descripción es obligatoria.",
      invalid_type: "La descripción debe ser texto.",
      too_short: "La descripción debe tener al menos 3 caracteres.",
      too_long: "La descripción debe tener como máximo 500 caracteres.",
    },
    quantity: {
      required: "La cantidad es obligatoria.",
      invalid_type: "La cantidad debe ser un número entero.",
      out_of_range: "La cantidad debe estar entre 1 y 100000.",
    },
    unit_price: {
      required: "El precio unitario es obligatorio.",
      invalid_type: 'El precio unitario debe ser texto, por ejemplo "249.90".',
      invalid_format:
        'El precio unitario debe ser un importe positivo con como máximo 2 decimales, por ejemplo "249.90".',
      out_of_range: "El precio unitario debe ser mayor que 0 y como máximo 10000000.00.",
    },
    currency: {
      required: "La moneda es obligatoria.",
      invalid_type: "La moneda debe ser texto.",
      invalid_choice: "La moneda debe ser una de: EUR, USD, GBP, CHF.",
    },
    requester_display_name: {
      required: "El nombre visible del solicitante es obligatorio.",
      invalid_type: "El nombre visible del solicitante debe ser texto.",
      too_short: "El nombre visible del solicitante debe tener al menos 2 caracteres.",
      too_long: "El nombre visible del solicitante debe tener como máximo 80 caracteres.",
    },
  },
  unknownField: "Campo desconocido. Este campo no está permitido.",
  announce: {
    sending: "Enviando tu solicitud. Espera, por favor.",
    saved: "Borrador guardado.",
    clientErrors: (count) =>
      `El formulario tiene ${count} ${pluralWord("es", count, { one: "error", other: "errores" })}. Corrígelos e inténtalo de nuevo.`,
    serverErrors: (count) =>
      `El servidor rechazó ${count} ${pluralWord("es", count, { one: "campo", other: "campos" })}. Corrígelos, por favor.`,
  },
  alerts: {
    timeout: {
      title: "El servidor no respondió",
      detail:
        "La respuesta tardó demasiado. Es posible que el borrador se haya guardado o no. Tus datos siguen aquí. Inténtalo de nuevo.",
    },
    network: {
      title: "No se pudo conectar con el servidor",
      detail:
        "Comprueba que el servidor de desarrollo esté en marcha. Es posible que el borrador se haya guardado o no. Tus datos siguen aquí. Inténtalo de nuevo.",
    },
    unexpected: {
      title: "Respuesta inesperada",
      detail:
        "El servidor envió una respuesta que este formulario no entiende. Es posible que el borrador se haya guardado o no. Tus datos siguen aquí. Inténtalo de nuevo.",
    },
    problems: {
      "urn:procureflow:problem:invalid-json": {
        title: "JSON no válido",
        detail: "El cuerpo de la solicitud no es un JSON válido.",
      },
      "urn:procureflow:problem:payload-too-large": {
        title: "Solicitud demasiado grande",
        detail: "El cuerpo de la solicitud no puede superar los 16384 bytes.",
      },
      "urn:procureflow:problem:unsupported-media-type": {
        title: "Tipo de contenido no admitido",
        detail: "Content-Type debe ser application/json.",
      },
      "urn:procureflow:problem:validation-error": {
        title: "Error de validación",
        detail: "Uno o más campos no son válidos.",
      },
      "urn:procureflow:problem:not-found": {
        title: "No encontrado",
        detail: "Esa ruta no existe.",
      },
      "urn:procureflow:problem:method-not-allowed": {
        title: "Método no permitido",
        detail: "Esta ruta no admite ese método HTTP.",
      },
      "urn:procureflow:problem:internal-error": {
        title: "Error interno",
        detail: "Se produjo un error inesperado.",
      },
    },
  },
  success: {
    title: "Borrador guardado",
    lead: "Tu solicitud se guardó como borrador.",
    noteStrong: "Almacenamiento temporal de desarrollo.",
    noteBody:
      "Este borrador solo se guarda en la memoria del servidor de desarrollo. Se pierde cuando el servidor se reinicia. No se ha enviado a nadie.",
    id: "ID de solicitud",
    status: "Estado",
    statusValue: "Borrador",
    created: "Creado",
    storage: "Almacenamiento",
    storageValue: "Almacenamiento temporal de desarrollo",
    description: "Descripción",
    quantity: "Cantidad",
    unitPrice: "Precio unitario",
    requester: "Solicitante",
    total: "Total estimado",
    totalNote: "Solo una estimación: cantidad por precio unitario, calculada por el servidor.",
    another: "Crear otra solicitud",
  },
  notFound: {
    title: "Página no encontrada",
    body: "Esta página no existe.",
    link: "Ir al formulario",
  },
};
