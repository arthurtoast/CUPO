# Cupo: Propuesta de valor y modelo de negocio

Entregable de la Fase 5 (Sprint 3). Responde cuatro preguntas: quién paga, cuánto, por qué y cómo escalaría Cupo. Los precios de la competencia se revisaron el 25 de noviembre de 2026.

## Propuesta de valor

**Comparte un link, deja de contestar mensajes.** El negocio de una a cinco personas configura su horario y su servicio en diez minutos, comparte su enlace por WhatsApp o Instagram y sus clientes reservan solos, a cualquier hora, sin crear cuenta. La página lleva el logo, el color, la portada y las redes del negocio, así que se siente suya y no de Cupo.

Lo que gana el negocio:

- **Tiempo.** Cada cita por WhatsApp cuesta de tres a seis mensajes. Carla, la dueña del spa que probó Cupo el 6 de noviembre, agenda de 20 a 25 citas por semana así: son más de 100 mensajes semanales que ya no tiene que contestar.
- **Cero dobles reservas.** La base de datos lo impide con una restricción de exclusión. Probamos 20 reservas simultáneas al mismo horario y solo una entró.
- **Menos huecos vacíos.** El cliente cancela con un clic desde su correo y el horario se libera para otra persona.
- **Reservas fuera de horario.** El mensaje de las 11 de la noche se convierte en una cita confirmada, no en un cliente que se fue con otro negocio.

## Quién paga

Paga **el negocio**. El cliente final nunca paga, nunca crea cuenta y nunca ve publicidad, porque es lo que hace que reservar tome menos de un minuto. Es el mismo modelo de Booksy y AgendaPro, pero apuntado al segmento que ellos atienden mal: la estética de dos sillas, la manicurista independiente, el nutriólogo con un solo consultorio.

## Cuánto: planes

Modelo freemium con suscripción mensual en pesos y sin plazo forzoso.

| Plan | Precio | Para quién | Incluye |
| --- | --- | --- | --- |
| **Gratis** | $0 | Quien quiere probar o tiene poco volumen | 1 agenda, hasta 30 citas al mes, logo y color, correos de confirmación, la leyenda "Agenda con Cupo" en su página |
| **Pro** | $149 MXN al mes | El negocio de una persona que ya vive de sus citas | Citas ilimitadas, sin leyenda de Cupo, portada, bienvenida y redes, bloqueos, vista semanal |
| **Equipo** | $249 MXN al mes más $59 por cada persona extra del staff | Spa o estética con varias personas que atienden | Todo lo de Pro, una agenda por persona del staff (HU-18) y el cliente elige con quién |

Ingreso extra opcional, en una segunda etapa:

- **Recordatorios por WhatsApp** (HU-17): paquete de mensajes, porque cada mensaje de la API de WhatsApp Business le cuesta a Cupo.
- **Anticipo al reservar**: comisión pequeña sobre el pago en línea, para negocios que pierden dinero cuando el cliente no llega.

### Por qué estos precios

| Competidor | Precio de entrada | Comentario |
| --- | --- | --- |
| Booksy (México) | $429 MXN al mes más $100 por empleado extra | Todo incluido, pero caro para un local de una o dos personas |
| AgendaPro (México) | Desde $299 MXN al mes en el plan Básico | Plataforma completa, con más configuración de la que necesita un negocio pequeño |
| Calendly | 12 USD al mes por persona (pago mensual) | Pensado para reuniones de oficina, no para servicios presenciales |
| WhatsApp y libreta | $0 | Es lo que hay que vencer: gratis, pero cuesta tiempo y clientes |

Pro cuesta un tercio de Booksy y la mitad de AgendaPro. Para el negocio, el cálculo es simple: si Cupo le salva una sola cita al mes que se habría perdido por contestar tarde, ya pagó la mensualidad. El plan Gratis compite directo contra WhatsApp, que también es gratis, y los mismos clientes se encargan de anunciar el producto.

## Cómo escalaría

**Costo técnico casi plano.** Cupo es una sola aplicación multi-negocio: todos los negocios comparten la misma base de datos, separados por seguridad a nivel de fila (RLS). Dar de alta un negocio nuevo no cuesta servidores nuevos. Hoy corre en las capas gratuitas de Vercel y Supabase; al pasar a los planes de pago de los dos (alrededor de 45 USD al mes en total) bastan unos seis negocios Pro para cubrirlos, y el resto es margen.

**Crecimiento con el mismo enlace.** Cada página de reserva del plan Gratis lleva "Agenda con Cupo". El cliente de una estética que reserva en 40 segundos es el siguiente negocio que se registra. Es el mismo ciclo que hizo crecer a Calendly.

**Ruta por etapas:**

1. **Monterrey, belleza y estética.** Es el segmento de Carla y el que validamos en la demo. Estrategia de venta: visitar estéticas y barberías del área metropolitana, configurarles su página en diez minutos y dejarles un mes de Pro gratis.
2. **Salud y consultorios.** Nutriólogos, psicólogos y terapeutas: mismo producto, con una pregunta extra al reservar (primera vez o seguimiento).
3. **Alianzas.** Distribuidores de productos de belleza y escuelas de estilismo, que tienen la relación directa con miles de negocios pequeños.
4. **Producto.** Agenda por staff (HU-18) para abrir el plan Equipo, recordatorios por WhatsApp (HU-17) y anticipos en línea.

**Meta del primer año.** Con 100 negocios en Pro y 20 en Equipo con dos personas extra, el ingreso mensual sería de unos $22,200 MXN (14,900 de Pro y 7,340 de Equipo), contra un costo de infraestructura menor a $1,500 MXN.

## Riesgos

- **El costo de cambio es emocional, no técnico.** El negocio está acostumbrado a WhatsApp. Por eso la configuración tiene que tomar diez minutos y el plan Gratis tiene que servir de verdad.
- **Competidores grandes con marketplace.** Booksy y AgendaPro traen clientes nuevos con su directorio. Cupo no compite en eso: compite en simplicidad y precio para quien ya tiene su clientela.
- **WhatsApp.** Si Meta lanza agendado nativo en WhatsApp Business, el plan Gratis pierde fuerza. La respuesta sería apostar por la página con marca propia y la agenda por staff.
