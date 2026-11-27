// Agenda por miembro del staff (HU-18): qué persona se eligió y qué horarios
// ocupa. Reproduce la regla de la base (cita_sin_traslape por persona):
//   * con staff: ocupan las citas de esa persona y los bloqueos del negocio;
//   * sin staff: ocupan las citas sin persona (el carril de antes) y los bloqueos.
// Sin dependencias, para probarlo con `node --test`.

export type MiembroStaff = { id: string; nombre: string };                          // aporta: lo que la página necesita de cada persona

export type OcupadoConStaff = {                                                     // aporta: una fila de vista_ocupado
  inicio: string;                                                                   // aporta: desde cuándo está ocupado
  fin: string;                                                                      // aporta: hasta cuándo
  staff_id: string | null;                                                          // aporta: de quién es la cita (null = sin staff)
  bloqueo: boolean;                                                                 // aporta: true si es un bloqueo del negocio entero
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;     // aporta: forma de un id válido

// Persona elegida a partir del parámetro ?con= de la dirección. Si el negocio no
// tiene staff, regresa null (todo como antes). Si el parámetro falta o no es de
// este negocio, se toma a la primera persona para que la página siempre funcione.
export function elegirStaff(staff: MiembroStaff[], con: unknown): MiembroStaff | null {
  if (staff.length === 0) return null;                                              // aporta: negocio sin staff
  const id = typeof con === "string" && UUID.test(con) ? con.toLowerCase() : null;  // aporta: solo ids con forma válida
  return staff.find((m) => m.id.toLowerCase() === id) ?? staff[0]!;                 // aporta: la elegida o la primera
}

// Los intervalos que cuentan como ocupados para la persona elegida (o para el
// carril sin staff cuando staffId es null).
export function ocupadosPara(
  ocupados: OcupadoConStaff[],                                                      // aporta: todas las filas del negocio
  staffId: string | null,                                                           // aporta: persona elegida o null
): { inicio: string; fin: string }[] {
  return ocupados                                                                   // aporta: recorre una sola vez
    .filter((o) => o.bloqueo || o.staff_id === staffId)                             // aporta: bloqueos para todos, citas solo de su carril
    .map(({ inicio, fin }) => ({ inicio, fin }));                                   // aporta: solo lo que usa calcularDias
}

export const NOMBRE_STAFF_MAX = 60;                                                 // aporta: igual que el CHECK de la tabla staff

// Nombre de una persona del staff: sin espacios sobrantes y de 1 a 60 caracteres
// (contados como caracteres, igual que char_length de PostgreSQL).
export function validarNombreStaff(
  valor: unknown,                                                                   // aporta: lo que llegó del formulario
): { ok: true; nombre: string } | { ok: false; error: string } {
  const nombre = (typeof valor === "string" ? valor : "").trim().replace(/\s+/g, " "); // aporta: limpia espacios
  const largo = [...nombre].length;                                                 // aporta: cuenta caracteres, no unidades UTF-16
  if (largo === 0) return { ok: false, error: "Escribe el nombre." };               // aporta: vacío no
  if (largo > NOMBRE_STAFF_MAX) {                                                   // aporta: demasiado largo
    return { ok: false, error: `El nombre puede tener hasta ${NOMBRE_STAFF_MAX} caracteres.` };
  }
  return { ok: true, nombre };                                                      // aporta: listo para guardar
}
