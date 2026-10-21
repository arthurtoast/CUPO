// Cálculo de huecos libres para la página pública (HU-09).
//
// Reproduce las reglas que reservar_cita valida en la base (supabase/migrations,
// T-05), para que la página solo ofrezca horarios que la base va a aceptar:
//   * un hueco cae completo dentro de un bloque de horario_atencion;
//   * los huecos empiezan en hora_inicio + k * duración (la "rejilla");
//   * un hueco libre no está en el pasado y no se encima con nada de vista_ocupado
//     (citas confirmadas y bloqueos). Los rangos son [inicio, fin): una cita que
//     termina a las 10:45 no choca con otra que empieza a las 10:45.
//
// Aun así, la última palabra la tiene la base: entre que el cliente ve la lista y
// confirma, alguien más pudo reservar.
//
// Sin dependencias: solo Date e Intl, para poder probarlo con `node --test` y
// reescribirlo en otro lenguaje sin cambiar la lógica.

export type BloqueHorario = {
  dia_semana: number; // ISO 8601: 1 = lunes ... 7 = domingo
  hora_inicio: string; // "HH:MM" o "HH:MM:SS", hora local del negocio
  hora_fin: string;
};

export type Intervalo = { inicio: string | Date; fin: string | Date };

export type Hueco = {
  inicio: string; // instante ISO 8601 en UTC; es lo que se manda a reservar_cita
  hora: string; // "HH:MM" en la hora local del negocio, para mostrar
  libre: boolean; // ni pasado ni ocupado
  pasado: boolean; // ya empezó; la página no lo muestra
};

export type Dia = {
  fecha: string; // "YYYY-MM-DD" en la zona del negocio
  diaSemana: number; // 1 = lunes ... 7 = domingo
  huecos: Hueco[];
};

export type OpcionesHuecos = {
  horario: BloqueHorario[];
  ocupados: Intervalo[];
  duracionMin: number;
  zonaHoraria: string;
  ahora: Date;
  dias: number; // cuántos días mostrar a partir de hoy (incluido)
};

const MINUTO = 60_000;

// ---------------------------------------------------------------------------
// Zona horaria con Intl
// ---------------------------------------------------------------------------

const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string) {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formateadores.set(zona, f);
  }
  return f;
}

// Partes de la hora de pared que marca un reloj en `zona` en el instante dado.
function partesLocales(instante: Date, zona: string) {
  const p: Record<string, number> = {};
  for (const { type, value } of formateador(zona).formatToParts(instante)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return {
    anio: p.year,
    mes: p.month,
    dia: p.day,
    hora: p.hour,
    minuto: p.minute,
    segundo: p.second,
  };
}

// Desfase de la zona en ese instante, en milisegundos (hora local - UTC).
// Monterrey hoy: -6 h. Se calcula leyendo el reloj local y comparándolo con UTC.
function desfaseMs(instante: Date, zona: string) {
  const l = partesLocales(instante, zona);
  const comoUtc = Date.UTC(l.anio, l.mes - 1, l.dia, l.hora, l.minuto, l.segundo);
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

// Instante (UTC) que corresponde a una fecha y hora de pared en `zona`.
// Primero se supone que la hora de pared es UTC, se corrige con el desfase de la
// zona y se vuelve a medir el desfase en el resultado, por si en medio hay un
// cambio de horario de verano.
export function instanteLocal(fecha: string, hora: string, zona: string): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const [h, m, s = 0] = hora.split(":").map(Number);
  const supuesto = Date.UTC(anio, mes - 1, dia, h, m, s);
  const primero = desfaseMs(new Date(supuesto), zona);
  const candidato = supuesto - primero;
  const segundo = desfaseMs(new Date(candidato), zona);
  return new Date(segundo === primero ? candidato : supuesto - segundo);
}

// "YYYY-MM-DD" de ese instante en la zona del negocio.
export function fechaLocal(instante: Date, zona: string): string {
  const l = partesLocales(instante, zona);
  return `${l.anio}-${dos(l.mes)}-${dos(l.dia)}`;
}

// Día de la semana ISO (1 = lunes ... 7 = domingo) de una fecha "YYYY-MM-DD".
export function diaSemanaIso(fecha: string): number {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const domingoCero = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return domingoCero === 0 ? 7 : domingoCero;
}

export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
}

function minutosDelDia(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function horaTexto(minutos: number): string {
  return `${dos(Math.floor(minutos / 60))}:${dos(minutos % 60)}`;
}

function dos(n: number) {
  return String(n).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Huecos
// ---------------------------------------------------------------------------

export function calcularDias(opciones: OpcionesHuecos): Dia[] {
  const { horario, duracionMin, zonaHoraria, ahora, dias } = opciones;
  if (!Number.isInteger(duracionMin) || duracionMin <= 0) {
    throw new RangeError(`duracionMin debe ser un entero positivo: ${duracionMin}`);
  }

  const ocupados = opciones.ocupados.map((o) => ({
    inicio: new Date(o.inicio).getTime(),
    fin: new Date(o.fin).getTime(),
  }));
  const ahoraMs = ahora.getTime();
  const hoy = fechaLocal(ahora, zonaHoraria);
  const resultado: Dia[] = [];

  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(hoy, i);
    const diaSemana = diaSemanaIso(fecha);
    const bloques = horario
      .filter((b) => b.dia_semana === diaSemana)
      .map((b) => ({ ini: minutosDelDia(b.hora_inicio), fin: minutosDelDia(b.hora_fin) }))
      .sort((a, b) => a.ini - b.ini);

    const huecos: Hueco[] = [];
    for (const bloque of bloques) {
      for (let m = bloque.ini; m + duracionMin <= bloque.fin; m += duracionMin) {
        const hora = horaTexto(m);
        const inicio = instanteLocal(fecha, hora, zonaHoraria).getTime();
        const fin = inicio + duracionMin * MINUTO;
        // Versión explícita de "se enciman": dos rangos [a, b) y [c, d) chocan
        // si y solo si a < d y c < b.
        const ocupado = ocupados.some((o) => inicio < o.fin && o.inicio < fin);
        const pasado = inicio <= ahoraMs;
        huecos.push({
          inicio: new Date(inicio).toISOString(),
          hora,
          libre: !pasado && !ocupado,
          pasado,
        });
      }
    }
    resultado.push({ fecha, diaSemana, huecos });
  }

  return resultado;
}
