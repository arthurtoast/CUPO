// Horario semanal del negocio (HU-03). Se usa en el formulario, para avisar
// antes de enviar, y en el Server Action, que no confía en el navegador.

export type Bloque = { inicio: string; fin: string };

// Índice 0 = lunes … 6 = domingo; dia_semana en la base es índice + 1 (ISO).
export type Dia = { abierto: boolean; bloques: Bloque[] };

export const NOMBRES_DIA = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function minutos(hora: string) {
  const [h, m] = hora.split(":").map(Number);
  return h! * 60 + m!;
}

// Revisa fin > inicio y que los bloques del mismo día no se encimen.
// Devuelve un mensaje por día con problema (vacío si todo está bien).
export function validarHorario(dias: Dia[]): Record<number, string> {
  const errores: Record<number, string> = {};

  dias.forEach((dia, i) => {
    if (!dia.abierto) return;
    const nombre = NOMBRES_DIA[i]!.toLowerCase();

    if (dia.bloques.length === 0) {
      errores[i] = `Agrega un horario al ${nombre} o márcalo como cerrado.`;
      return;
    }
    if (dia.bloques.some((b) => !HORA.test(b.inicio) || !HORA.test(b.fin))) {
      errores[i] = `Escribe las horas del ${nombre} en formato 24 h, por ejemplo 09:00.`;
      return;
    }
    if (dia.bloques.some((b) => minutos(b.fin) <= minutos(b.inicio))) {
      errores[i] = `El ${nombre}: la hora de cierre debe ser después de la de inicio.`;
      return;
    }
    // Ordenados por inicio, basta comparar cada bloque con el anterior. Que uno
    // termine justo cuando empieza el otro (14:00 y 14:00) sí se permite.
    const ordenados = [...dia.bloques].sort((a, b) => minutos(a.inicio) - minutos(b.inicio));
    for (let j = 1; j < ordenados.length; j++) {
      if (minutos(ordenados[j]!.inicio) < minutos(ordenados[j - 1]!.fin)) {
        errores[i] = `Los horarios del ${nombre} se enciman. Ajusta las horas de los bloques.`;
        return;
      }
    }
  });

  return errores;
}

// Convierte las filas de horario_atencion (hora_inicio "09:00:00") a los siete días.
export function diasDesdeFilas(
  filas: { dia_semana: number; hora_inicio: string; hora_fin: string }[],
): Dia[] {
  return NOMBRES_DIA.map((_, i) => {
    const bloques = filas
      .filter((f) => f.dia_semana === i + 1)
      .map((f) => ({ inicio: f.hora_inicio.slice(0, 5), fin: f.hora_fin.slice(0, 5) }))
      .sort((a, b) => minutos(a.inicio) - minutos(b.inicio));
    return bloques.length > 0
      ? { abierto: true, bloques }
      : { abierto: false, bloques: [{ inicio: "09:00", fin: "19:00" }] };
  });
}
