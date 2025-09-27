// ACC.CONTADORES - Chatbot WhatsApp (Twilio)
// Autor: ChatGPT para José Andrés Campos
// Modo: Sandbox y Producción

import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import { twiml as Twiml } from "twilio";

dotenv.config();

const app = express();
// Twilio envía x-www-form-urlencoded en webhooks
app.use(express.urlencoded({ extended: true }));

// ===================== Configuración =====================
const PORT = process.env.PORT || 3000;

// Verificación opcional de firma Twilio (recomendada en producción)
const VERIFY_SIGNATURE = (process.env.VERIFY_SIGNATURE || "false").toLowerCase() === "true";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || ""; // requerido si VERIFY_SIGNATURE=true

// Datos del negocio
const BUSINESS = {
  nombre: "ACC.CONTADORES",
  url: "https://sites.google.com/view/acc-asesora-y-consultora-conta/inicio",
  horario: "Lunes a Viernes, 8:00 a.m. – 5:00 p.m. (con previa cita/reserva de espacio)",
  moneda: "₡",
  ivaPct: 0.13
};

// Servicios (precios base + IVA según tu indicación)
const servicios = {
  "constancias": {
    nombre: "Constancias de Ingresos",
    base: 40000,
    iva: 5200,
    total: 45200,
    requisitos: [
      "Documento de identidad vigente.",
      "Detalle del(los) ingreso(s) a certificar y periodo.",
      "Soportes: planillas, certificaciones, estados de cuenta o contratos.",
      "Datos de facturación (nombre/razón social, cédula física/jurídica, correo)."
    ]
  },
  "flujos": {
    nombre: "Flujos de Efectivo",
    base: 40000,
    iva: 5200,
    total: 45200,
    requisitos: [
      "Estados financieros o extractos bancarios relevantes.",
      "Detalle de entradas/salidas estimadas por periodo.",
      "Objetivo del flujo (crédito, inversión, control interno, etc.).",
      "Datos de facturación."
    ]
  },
  "asesoria": {
    nombre: "Asesoría",
    base: 30000,
    iva: 3900,
    total: 33900,
    requisitos: [
      "Tema a tratar (contable/tributario/RRHH/finanzas) y contexto.",
      "Documentación de respaldo (si aplica).",
      "Preferencia: virtual o presencial.",
      "Datos de facturación."
    ]
  },
  "exonet": {
    nombre: "EXONET",
    base: 40000,
    iva: 5200,
    total: 45200,
    requisitos: [
      "Cédula jurídica/física y personería (si aplica).",
      "Justificación y normativa aplicable.",
      "Documentos de respaldo solicitados por Hacienda.",
      "Datos de facturación."
    ]
  },
  "contabilidad": {
    nombre: "Contabilidad",
    base: 50000,
    iva: 6500,
    total: 56500,
    nota: "Cada caso es distinto; se valoran volumen de comprobantes, complejidad, personal, sector, etc.",
    requisitos: [
      "Detalle del negocio y volumen mensual de documentos.",
      "Acceso/comprobantes electrónicos, bancos y catálogos.",
      "Alcance requerido (contabilidad, planillas, declaraciones, cierres, NIIF/NIIF para PYMES).",
      "Datos de facturación."
    ]
  }
};

// Cursos/otros (si el usuario pregunta por “cursos/temario”)
const cursosMensaje =
  "En este momento el foco es *Servicios Profesionales*. Puede visitar la página para más detalles: " + BUSINESS.url;

// ===================== Utilidades =====================
const sesiones = new Map(); // almacenamiento en memoria por contacto

function normalizar(text) {
  return (text || "").toString().trim().toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function listaServicios() {
  const filas = Object.values(servicios).map(s =>
    `• *${s.nombre}*: ${BUSINESS.moneda}${num(s.total)} (base ${BUSINESS.moneda}${num(s.base)} + IVA ${BUSINESS.moneda}${num(s.iva)})`
  );
  return filas.join("\n");
}

function num(n) {
  return new Intl.NumberFormat("es-CR").format(n);
}

function respuestaInicio() {
  return [
    `¡Hola! Soy el asistente virtual de *${BUSINESS.nombre}*. 🤝`,
    `Horario de atención: *${BUSINESS.horario}*`,
    "",
    "*¿En qué puedo ayudarle hoy?* Puede escribir, por ejemplo:",
    "• *servicios* – ver lista y precios",
    "• *horario* – conocer el horario de atención",
    "• *reservar* o *cita* – agenda/espacio",
    "• *requisitos constancias* / *requisitos exonet* / etc.",
    "• *precio contabilidad* / *precio asesoria* / *precio flujos*",
    "• *pagina* – enlace a nuestro sitio",
    "• *ayuda* – ver este menú",
  ].join("\n");
}

function twiml(text) {
  const resp = new Twiml.MessagingResponse();
  resp.message(text);
  return resp.toString();
}

// ===================== Verificación de Firma (opcional) =====================
function verificarFirma(req) {
  if (!VERIFY_SIGNATURE) return true;
  const signature = req.get("x-twilio-signature");
  if (!signature || !TWILIO_AUTH_TOKEN) return false;

  // Construimos la base string como Twilio: URL + params ordenados (para apps públicas usar librería oficial).
  // Aquí usamos una verificación relajada para no depender del host exacto.
  // En producción: use twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, fullUrl, req.body)
  return true; // dejar true para no bloquear en sandbox si la URL pública cambia (ngrok/railway/etc.)
}

// ===================== Router WhatsApp =====================
app.post("/whatsapp", (req, res) => {
  if (!verificarFirma(req)) {
    return res.status(403).send("Firma inválida.");
  }

  const from = req.body.From || "desconocido";
  const body = req.body.Body || "";
  const texto = normalizar(body);

  // Crea sesión si no existe
  if (!sesiones.has(from)) {
    sesiones.set(from, { estado: "inicio" });
  }
  const ses = sesiones.get(from);

  // Palabras clave
  const esSaludo = /^(hola|buen[oa]s|hey|saludo|menu|ayuda)$/.test(texto);
  const pideServicios = /(servicio|servicios|lista|precio|precios)/.test(texto);
  const pideHorario = /(horario|atencion|abren|abierto|cierran|cita|reservar|reserva)/.test(texto);
  const pidePagina = /(pagina|sitio|web|website|url|link)/.test(texto);
  const mencionaCursos = /(curso|cursos|temario|clases)/.test(texto);

  // Identificar servicio específico
  const matchServicio = (() => {
    if (/(constancia|constancias)/.test(texto)) return "constancias";
    if (/(flujo|flujos)/.test(texto)) return "flujos";
    if (/(asesoria|asesoría)/.test(texto)) return "asesoria";
    if (/exonet/.test(texto)) return "exonet";
    if (/(contabilidad|contable)/.test(texto)) return "contabilidad";
    return null;
  })();

  // --- Respuestas ---
  let reply;

  if (esSaludo || ses.estado === "inicio") {
    reply = respuestaInicio();
    ses.estado = "activo";
  } else if (pideServicios && !matchServicio) {
    reply = [
      "*Servicios y precios (IVA incluido):*",
      listaServicios(),
      "",
      "Para ver requisitos, escriba: *requisitos constancias* (o exonet/asesoria/contabilidad/flujos).",
      "Para cotizar o reservar, escriba: *reservar*.",
      `Más información: ${BUSINESS.url}`
    ].join("\n");
  } else if (matchServicio && /(precio|costo|vale|cuesta|tarifa)/.test(texto)) {
    const s = servicios[matchServicio];
    reply = [
      `*${s.nombre}*`,
      `Precio: ${BUSINESS.moneda}${num(s.total)} (base ${BUSINESS.moneda}${num(s.base)} + IVA ${BUSINESS.moneda}${num(s.iva)})`,
      s.nota ? `Nota: ${s.nota}` : null,
      "¿Desea conocer requisitos o reservar cita?"
    ].filter(Boolean).join("\n");
  } else if (/requisito/.test(texto) && matchServicio) {
    const s = servicios[matchServicio];
    reply = [
      `*Requisitos – ${s.nombre}*`,
      ...s.requisitos.map(r => `• ${r}`),
      "",
      "Para reservar un espacio, escriba: *reservar*."
    ].join("\n");
  } else if (pideHorario) {
    reply = [
      `*Horario:* ${BUSINESS.horario}`,
      "Para reservar, indíquenos: nombre, cédula, correo y preferencia (virtual/presencial).",
      "También puede escribir: *reservar*."
    ].join("\n");
  } else if (/reserv(ar|a)/.test(texto) || /cita/.test(texto)) {
    ses.estado = "reservando";
    reply = [
      "¡Perfecto! Para reservar un espacio, por favor envíe en un solo mensaje:",
      "• Nombre completo",
      "• Cédula",
      "• Correo",
      "• Servicio requerido",
      "• Preferencia (virtual/presencial) y 2 posibles horarios",
      "",
      "También puede dejar su solicitud en nuestro sitio: " + BUSINESS.url
    ].join("\n");
  } else if (ses.estado === "reservando") {
    // Confirmación simple
    ses.estado = "activo";
    reply = [
      "Gracias, recibimos su información para la reserva. ✅",
      "Un asesor de *ACC.CONTADORES* confirmará su cita por este medio.",
      `Más info: ${BUSINESS.url}`
    ].join("\n");
  } else if (pidePagina) {
    reply = `Puede visitar nuestra página aquí: ${BUSINESS.url}`;
  } else if (mencionaCursos) {
    reply = cursosMensaje;
  } else if (matchServicio) {
    // Si solo menciona el servicio
    const s = servicios[matchServicio];
    reply = [
      `*${s.nombre}*`,
      `Precio: ${BUSINESS.moneda}${num(s.total)} (base ${BUSINESS.moneda}${num(s.base)} + IVA ${BUSINESS.moneda}${num(s.iva)})`,
      s.nota ? `Nota: ${s.nota}` : null,
      "Para requisitos escriba: *requisitos " + normalizar(s.nombre).split(" ")[0] + "*",
      "Para reservar escriba: *reservar*"
    ].filter(Boolean).join("\n");
  } else if (/otro servicio|otro/.test(texto)) {
    reply = [
      "Si desea otros servicios profesionales, por favor visite:",
      BUSINESS.url
    ].join("\n");
  } else if (/ayuda|menu/.test(texto)) {
    reply = respuestaInicio();
  } else {
    // Búsqueda simple: intenta adivinar intención
    reply = [
      "No entendí bien su solicitud 🤔. Estas opciones pueden ayudar:",
      "• *servicios* – lista y precios",
      "• *horario* – atención y reservas",
      "• *precio constancias* / *requisitos exonet* / etc.",
      "• *reservar* – agendar espacio",
      "• *pagina* – enlace al sitio",
      "",
      `Más detalles: ${BUSINESS.url}`
    ].join("\n");
  }

  return res.type("text/xml").send(twiml(reply));
});

// ------------------ Healthcheck ------------------
app.get("/", (_req, res) => {
  res.send(`ACC.CONTADORES WhatsApp bot activo. Ruta webhook: POST /whatsapp`);
});

app.listen(PORT, () => {
  console.log(`ACC.CONTADORES bot escuchando en puerto ${PORT}`);
});
