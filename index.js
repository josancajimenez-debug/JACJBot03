// ACC.CONTADORES – WhatsApp Bot (Twilio)
// Autor: para José Andrés Campos
// Listo para sandbox y producción

import express from "express";
import dotenv from "dotenv";
import { twiml as Twiml } from "twilio";

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));

// ================== Configuración ==================
const PORT = process.env.PORT || 3000;
const BUSINESS = {
  nombre: "ACC.CONTADORES",
  pagina: "Página oficial de ACC.CONTADORES",
  horario: "Lunes a Viernes · 8:00 a.m. – 5:00 p.m. (con previa cita/reserva)",
  moneda: "₡"
};

// Estructura de servicios y requisitos
const servicios = {
  constancias: {
    nombre: "Constancias de Ingresos",
    base: 40000, iva: 5200, total: 45200,
    requisitos: [
      "Documento de identidad vigente.",
      "Detalle de ingresos y período a certificar.",
      "Soportes (planillas, estados de cuenta, contratos).",
      "Datos de facturación (nombre/cédula/correo)."
    ]
  },
  flujos: {
    nombre: "Flujos de Efectivo",
    base: 40000, iva: 5200, total: 45200,
    requisitos: [
      "Estados financieros/extractos relevantes.",
      "Entradas/salidas estimadas por período.",
      "Objetivo (crédito, inversión, control interno).",
      "Datos de facturación."
    ]
  },
  asesoria: {
    nombre: "Asesoría",
    base: 30000, iva: 3900, total: 33900,
    requisitos: [
      "Tema (contable/tributario/RRHH/finanzas) y contexto.",
      "Documentación de respaldo (si aplica).",
      "Preferencia: virtual o presencial.",
      "Datos de facturación."
    ]
  },
  exonet: {
    nombre: "EXONET",
    base: 40000, iva: 5200, total: 45200,
    requisitos: [
      "Cédula física/jurídica y personería (si aplica).",
      "Justificación y normativa aplicable.",
      "Documentos solicitados por Hacienda.",
      "Datos de facturación."
    ]
  },
  contabilidad: {
    nombre: "Contabilidad",
    base: 50000, iva: 6500, total: 56500,
    nota: "Cada caso se cotiza según volumen de comprobantes, complejidad, sector, personal, etc.",
    requisitos: [
      "Descripción del negocio y volumen mensual.",
      "Acceso a comprobantes electrónicos y bancos.",
      "Alcance (planillas, declaraciones, NIIF/NIIF para PYMES).",
      "Datos de facturación."
    ]
  }
};

const sesiones = new Map(); // memoria por número

// ================== Utilidades ==================
const num = (n) => new Intl.NumberFormat("es-CR").format(n);
const norm = (t="") =>
  t.toString().trim().toLowerCase()
   .normalize("NFD").replace(/\p{Diacritic}/gu, "");

const menu = () => [
  `¡Hola! Soy el asistente virtual de *${BUSINESS.nombre}*. 🤝`,
  `Horario: *${BUSINESS.horario}*`,
  "",
  "*Opciones rápidas:*",
  "• *servicios* – lista con precios (IVA incluido)",
  "• *horario* – atención y reservas",
  "• *reservar* – solicitar cita/espacio",
  "• *precio constancias* / *requisitos exonet* / *precio contabilidad*",
  "• *pagina* – información institucional",
].join("\n");

const listaServicios = () => {
  const filas = Object.values(servicios).map(s =>
    `• *${s.nombre}*: ${BUSINESS.moneda}${num(s.total)} (base ${BUSINESS.moneda}${num(s.base)} + IVA ${BUSINESS.moneda}${num(s.iva)})`
  );
  return ["*Servicios y precios (IVA incluido):*", ...filas].join("\n");
};

const replyXML = (text) => {
  const tw = new Twiml.MessagingResponse();
  tw.message(text);
  return tw.toString();
};

// ================== Webhook WhatsApp ==================
app.post("/whatsapp", (req, res) => {
  const from = req.body.From || "desconocido";
  const body = req.body.Body || "";
  const text = norm(body);

  if (!sesiones.has(from)) sesiones.set(from, { estado: "inicio" });
  const ses = sesiones.get(from);

  // Palabras clave
  const esSaludo = /^(hola|buen[oa]s|menu|ayuda|hi|hello)$/.test(text);
  const pideServicios = /(servicio|servicios|lista|precios?)/.test(text);
  const pideHorario = /(horario|atencion|abren|cierran|cita|reservar|reserva)/.test(text);
  const pidePagina  = /(pagina|p[áa]gina|sitio|web|website|url|link)/.test(text);

  const servicioDetectado = (() => {
    if (/constancia/.test(text)) return "constancias";
    if (/flujo/.test(text)) return "flujos";
    if (/asesor(i|í)a/.test(text)) return "asesoria";
    if (/exonet/.test(text)) return "exonet";
    if /(contabilidad|contable)/.test(text) return "contabilidad";
    return null;
  })();

  let r;

  // Inicio / menú
  if (esSaludo || ses.estado === "inicio") {
    ses.estado = "activo";
    r = menu();
  }
  // Lista general de servicios
  else if (pideServicios && !servicioDetectado) {
    r = [
      listaServicios(),
      "",
      "Para requisitos: *requisitos constancias* (o exonet/asesoria/contabilidad/flujos).",
      "Para reservar: *reservar*.",
      `Si requiere otro servicio, puede visitar la ${BUSINESS.pagina}.`
    ].join("\n");
  }
  // Precio específico
  else if (servicioDetectado && /(precio|costo|vale|cuesta|tarifa)/.test(text)) {
    const s = servicios[servicioDetectado];
    r = [
      `*${s.nombre}*`,
      `Precio: ${BUSINESS.moneda}${num(s.total)} (base ${BUSINESS.moneda}${num(s.base)} + IVA ${BUSINESS.moneda}${num(s.iva)})`,
      s.nota ? `Nota: ${s.nota}` : null,
      "¿Desea los requisitos o agendar una cita? Escriba *requisitos ...* o *reservar*."
    ].filter(Boolean).join("\n");
  }
  // Requisitos de servicio
  else if (/requisit/.test(text) && servicioDetectado) {
    const s = servicios[servicioDetectado];
    r = [
      `*Requisitos – ${s.nombre}*`,
      ...s.requisitos.map(x => `• ${x}`),
      "",
      "Para reservar un espacio: *reservar*."
    ].join("\n");
  }
  // Horario y reservas
  else if (pideHorario) {
    r = [
      `*Horario:* ${BUSINESS.horario}`,
      "Para reservar, envíe en un mismo mensaje:",
      "• Nombre completo, cédula y correo",
      "• Servicio requerido",
      "• Preferencia (virtual/presencial) y 2 posibles horarios",
      "",
      "O escriba simplemente: *reservar*."
    ].join("\n");
  }
  else if (/reserv(ar|a)/.test(text) || /cita/.test(text)) {
    ses.estado = "reservando";
    r = [
      "¡Perfecto! Para agendar la cita, por favor envíe:",
      "• Nombre completo, cédula y correo",
      "• Servicio requerido",
      "• Preferencia (virtual/presencial) y 2 posibles horarios"
    ].join("\n");
  }
  else if (ses.estado === "reservando") {
    ses.estado = "activo";
    r = [
      "✅ ¡Gracias! Hemos recibido su solicitud de reserva.",
      "Un asesor de *ACC.CONTADORES* confirmará por este medio."
    ].join("\n");
  }
  // Página
  else if (pidePagina) {
    r = `Puede encontrar más información en la ${BUSINESS.pagina}.`;
  }
  // Menciona servicio sin pedir nada específico
  else if (servicioDetectado) {
    const s = servicios[servicioDetectado];
    r = [
      `*${s.nombre}*`,
      `Precio: ${BUSINESS.moneda}${num(s.total)} (base ${BUSINESS.moneda}${num(s.base)} + IVA ${BUSINESS.moneda}${num(s.iva)})`,
      s.nota ? `Nota: ${s.nota}` : null,
      "Para requisitos escriba: *requisitos "+servicioDetectado+"*",
      "Para reservar: *reservar*"
    ].filter(Boolean).join("\n");
  }
  // Otro servicio
  else if (/otro servicio|otro/.test(text)) {
    r = `Si busca otro servicio profesional, por favor visite la ${BUSINESS.pagina}.`;
  }
  // Fallback
  else {
    r = [
      "No entendí bien su solicitud 🤔. Pruebe con:",
      "• *servicios* | *horario* | *reservar* | *pagina*",
      "• *precio constancias* | *requisitos exonet* | *precio contabilidad*"
    ].join("\n");
  }

  return res.type("text/xml").send(replyXML(r));
});

// Healthcheck
app.get("/", (_req, res) => res.send("ACC.CONTADORES WhatsApp bot activo. Webhook: POST /whatsapp"));

app.listen(PORT, () => console.log(`ACC.CONTADORES bot escuchando en puerto ${PORT}`));
