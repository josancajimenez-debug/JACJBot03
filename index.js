const express = require("express");
const dotenv = require("dotenv");
const { twiml: Twiml } = require("twilio");

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const BUSINESS = { nombre: "ACC.CONTADORES", horario: "L-V 8:00–17:00 (con cita)", moneda: "₡" };

const servicios = {
  constancias: { nombre: "Constancias de Ingresos", base: 40000, iva: 5200, total: 45200 },
  flujos:      { nombre: "Flujos de Efectivo",      base: 40000, iva: 5200, total: 45200 },
  asesoria:    { nombre: "Asesoría",                base: 30000, iva: 3900, total: 33900 },
  exonet:      { nombre: "EXONET",                  base: 40000, iva: 5200, total: 45200 },
  contabilidad:{ nombre: "Contabilidad",            base: 50000, iva: 6500, total: 56500,
                 nota: "Cada caso se valora según factores." }
};

const sesiones = new Map();
const num = (n) => new Intl.NumberFormat("es-CR").format(n);
const norm = (t="") => t.toString().trim().toLowerCase()
  .normalize("NFD").replace(/\p{Diacritic}/gu, "");

const menu = () => [
  `Asistente virtual de *${BUSINESS.nombre}*`,
  `Horario: *${BUSINESS.horario}*`,
  "Opciones: *servicios*, *horario*, *reservar*, *precio constancias*"
].join("\n");

const listaServicios = () =>
  ["*Servicios (IVA incluido):*",
   ...Object.values(servicios).map(s =>
     `• *${s.nombre}*: ${BUSINESS.moneda}${num(s.total)} (base ${BUSINESS.moneda}${num(s.base)} + IVA ${BUSINESS.moneda}${num(s.iva)})`
   )].join("\n");

const replyXML = (text) => {
  const tw = new Twiml.MessagingResponse();
  tw.message(text);
  return tw.toString();
};

app.post("/whatsapp", (req, res) => {
  const from = req.body.From || "desconocido";
  const body = req.body.Body || "";
  const text = norm(body);

  if (!sesiones.has(from)) sesiones.set(from, { estado: "inicio" });
  const ses = sesiones.get(from);

  const esSaludo = /^(hola|buen[oa]s|menu|ayuda|hi|hello)$/.test(text);
  const pideServicios = /(servicio|servicios|lista|precios?)/.test(text);
  const pideHorario = /(horario|atencion|abren|cierran|cita|reservar|reserva)/.test(text);

  const servicioDetectado = (() => {
    if (/constancia/.test(text)) return "constancias";
    if (/flujo/.test(text))      return "flujos";
    if (/asesor(i|í)a/.test(text)) return "asesoria";
    if (/exonet/.test(text))     return "exonet";
    if (/(contabilidad|contable)/.test(text)) return "contabilidad";
    return null;
  })();

  let r;
  if (esSaludo || ses.estado === "inicio") {
    ses.estado = "activo"; r = menu();
  } else if (pideServicios && !servicioDetectado) {
    r = [listaServicios(), "", "Para reservar: *reservar*"].join("\n");
  } else if (servicioDetectado && /(precio|costo|cuesta|tarifa|vale)/.test(text)) {
    const s = servicios[servicioDetectado];
    r = [`*${s.nombre}*`,
         `Precio: ${BUSINESS.moneda}${num(s.total)} (base ${BUSINESS.moneda}${num(s.base)} + IVA ${BUSINESS.moneda}${num(s.iva)})`,
         s.nota ? `Nota: ${s.nota}` : null].filter(Boolean).join("\n");
  } else if (/requisit/.test(text) && servicioDetectado) {
    r = `*Requisitos – ${servicios[servicioDetectado].nombre}*: importante cumplir los requisitos para su emisión.`;
  } else if (pideHorario) {
    r = `*Horario:* ${BUSINESS.horario}. Para reservar: *reservar*.`;
  } else if (/reserv(ar|a)|cita/.test(text)) {
    ses.estado = "reservando";
    r = "Envíe: nombre, cédula, correo, servicio y 2 horarios posibles.";
  } else if (ses.estado === "reservando") {
    ses.estado = "activo";
    r = "✅ Solicitud de reserva recibida. Confirmaremos por este medio.";
  } else {
    r = "No entendí. Use: *servicios*, *horario*, *reservar*, *precio constancias*…";
  }

  return res.type("text/xml").send(replyXML(r));
});

app.get("/", (_req, res) => res.send("Bot activo. Webhook: POST /whatsapp"));
app.listen(PORT, () => console.log(`Escuchando en puerto ${PORT}`));


