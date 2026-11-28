"use client";                                                                       // aporta: conversación con estado en el navegador

// HU-17: chat que agenda. La lógica (qué preguntar, qué entendió) vive en
// lib/chat.ts; este componente solo la dibuja y, al confirmar, llama a la misma
// acción que el formulario (reservar), así que la cita, las validaciones y el
// correo de confirmación son idénticos.

import { startTransition, useActionState, useEffect, useRef, useState } from "react"; // aporta: estado, acción y desplazamiento
import { BotonCopiar } from "@/app/panel/boton-copiar";                            // aporta: copiar el enlace para cancelar
import { alReservar, iniciar, responder, type Boton, type ContextoChat, type EstadoChat, type Turno } from "@/lib/chat"; // aporta: la máquina de estados
import { reservar, type EstadoReserva } from "./actions";                          // aporta: la misma acción del formulario

type Mensaje = { de: "asistente" | "cliente"; texto: string };                    // aporta: una burbuja del chat

const inicial: EstadoReserva = { tipo: "inicial" };                               // aporta: antes de reservar

// Atributos del campo de texto según lo que se pide, para que el teclado del
// celular y el autocompletado ayuden.
function atributosCampo(paso: EstadoChat["paso"] | undefined): React.InputHTMLAttributes<HTMLInputElement> {
  if (paso === "nombre") return { autoComplete: "name", inputMode: "text" };     // aporta: sugiere el nombre guardado
  if (paso === "correo") return { autoComplete: "email", inputMode: "email", type: "email" }; // aporta: teclado con @
  if (paso === "telefono") return { autoComplete: "tel", inputMode: "tel", type: "tel" }; // aporta: teclado numérico
  return { autoComplete: "off", inputMode: "text" };                              // aporta: respuestas libres
}

export function ChatReserva({
  slug,
  servicioId,
  contexto,
}: {
  slug: string;                                                                   // aporta: a qué negocio se reserva
  servicioId: string;                                                             // aporta: qué servicio
  contexto: ContextoChat;                                                         // aporta: días libres por persona, teléfono, dirección
}) {
  const [abierto, setAbierto] = useState(false);                                  // aporta: panel visible o no
  const [estado, setEstado] = useState<EstadoChat | null>(null);                  // aporta: null = aún no empieza
  const [historial, setHistorial] = useState<Mensaje[]>([]);                      // aporta: burbujas en orden
  const [botones, setBotones] = useState<Boton[]>([]);                            // aporta: respuestas rápidas del paso
  const [enlace, setEnlace] = useState<string | null>(null);                      // aporta: enlace para cancelar al terminar
  const [entrada, setEntrada] = useState("");                                     // aporta: lo que se está escribiendo
  const [resultado, accion, guardando] = useActionState(reservar, inicial);       // aporta: respuesta de reservar_cita
  const [visto, setVisto] = useState(resultado);                                  // aporta: último resultado ya procesado
  const lista = useRef<HTMLDivElement>(null);                                     // aporta: para bajar al último mensaje
  const campo = useRef<HTMLInputElement>(null);                                   // aporta: para poner el cursor al abrir

  // Aplica un turno: agrega lo que dijo el cliente y lo que responde el
  // asistente, y si toca, manda la reserva.
  function aplicar(turno: Turno, dijo?: string) {
    setHistorial((h) => [
      ...h,
      ...(dijo ? [{ de: "cliente" as const, texto: dijo }] : []),                // aporta: la burbuja del cliente
      ...turno.mensajes.map((texto) => ({ de: "asistente" as const, texto })),   // aporta: las del asistente
    ]);
    setEstado(turno.estado);                                                      // aporta: nuevo paso
    setBotones(turno.botones);                                                    // aporta: nuevas respuestas rápidas
    if (turno.enlaceCancelar) setEnlace(turno.enlaceCancelar);                    // aporta: cita creada
    if (turno.enviar) {                                                           // aporta: confirmó: crear la cita
      const datos = new FormData();                                               // aporta: mismos campos que el formulario
      datos.set("slug", slug);                                                    // aporta: negocio
      datos.set("servicio_id", servicioId);                                       // aporta: servicio
      if (turno.enviar.staffId) datos.set("staff_id", turno.enviar.staffId);      // aporta: con quién (HU-18)
      datos.set("inicio", turno.enviar.inicio);                                   // aporta: hueco elegido
      datos.set("nombre", turno.enviar.nombre);                                   // aporta: datos ya validados en el chat
      datos.set("correo", turno.enviar.correo);                                   // aporta: ídem
      datos.set("telefono", turno.enviar.telefono);                               // aporta: ídem
      startTransition(() => accion(datos));                                       // aporta: llama a reservar como el botón "Confirmar cita"
    }
  }

  // Cuando llega una respuesta nueva de la acción, el chat la traduce. Es el
  // patrón de React para ajustar estado cuando cambia un valor, sin efectos.
  if (resultado !== visto) {
    setVisto(resultado);                                                          // aporta: no procesarla dos veces
    if (estado && resultado.tipo !== "inicial") aplicar(alReservar(contexto, estado, resultado)); // aporta: éxito o error en palabras
  }

  // Baja al último mensaje cada vez que llega uno.
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });                 // aporta: siempre se ve lo último
  }, [historial.length, abierto]);

  function abrir() {
    setAbierto(true);                                                             // aporta: muestra el panel
    if (!estado) aplicar(iniciar(contexto));                                      // aporta: saluda la primera vez
    setTimeout(() => campo.current?.focus(), 0);                                  // aporta: cursor listo para escribir
  }

  function decir(texto: string, valor = texto) {
    if (!estado || !texto.trim()) return;                                         // aporta: nada que mandar
    aplicar(responder(contexto, estado, valor), texto);                           // aporta: muestra lo que eligió y la respuesta
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();                                                      // aporta: no recarga la página
    decir(entrada);                                                               // aporta: procesa lo escrito
    setEntrada("");                                                               // aporta: limpia el campo
  }

  const ocupado = guardando || estado?.paso === "enviando";                       // aporta: no se escribe mientras guarda

  if (!abierto) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-borde px-5 py-4"> {/* aporta: en el flujo de la página, no tapa ninguna hora */}
        <p className="text-sm text-tinta-suave">¿Prefieres que te guíe paso a paso?</p>
        <button
          type="button"
          onClick={abrir}
          className="min-h-11 shrink-0 rounded-full border border-[var(--acento)] px-4 text-sm font-semibold text-[var(--acento)]"
        >
          Agendar por chat
        </button>
      </div>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Chat para agendar"
      onKeyDown={(e) => e.key === "Escape" && setAbierto(false)}                  // aporta: Esc cierra
      className="fixed inset-0 z-50 flex flex-col bg-fondo sm:inset-auto sm:right-4 sm:bottom-4 sm:h-[600px] sm:max-h-[calc(100dvh-2rem)] sm:w-[380px] sm:overflow-hidden sm:rounded-[16px] sm:border sm:border-borde sm:shadow-xl"
    >
      <header className="flex items-center justify-between border-b border-borde bg-superficie px-4 py-3">
        <h2 className="font-display text-base font-bold">Agenda por chat</h2>
        <button
          type="button"
          onClick={() => setAbierto(false)}                                       // aporta: cierra sin perder la conversación
          className="min-h-11 rounded-[9px] px-3 text-sm text-tinta-suave"
        >
          Cerrar
        </button>
      </header>

      <div ref={lista} role="log" aria-live="polite" className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
        {historial.map((m, i) => (
          <p
            key={i}                                                               // aporta: la lista solo crece: el índice es estable
            className={`max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-[15px] ${
              m.de === "cliente"
                ? "self-end bg-[var(--acento)] text-white"
                : "self-start border border-borde bg-superficie"
            }`}
          >
            {m.texto}
          </p>
        ))}
        {enlace && (                                                              // aporta: igual que la pantalla de confirmación
          <div className="flex max-w-[85%] flex-col gap-2 self-start rounded-[14px] border border-borde bg-superficie p-3.5">
            <p className="text-sm font-medium">Enlace para cancelar tu cita</p>
            <p className="break-all text-sm text-tinta-suave">{enlace}</p>
            <div>
              <BotonCopiar texto={enlace} />
            </div>
          </div>
        )}
      </div>

      {botones.length > 0 && !ocupado && (                                        // aporta: respuestas rápidas
        <div className="flex flex-wrap gap-2 border-t border-borde px-4 py-3">
          {botones.map((b) => (
            <button
              key={b.valor}
              value={b.valor}                                                     // aporta: el valor queda en el botón (lo usan las pruebas)
              type="button"
              onClick={() => decir(b.texto, b.valor)}                             // aporta: muestra el texto, manda el valor
              className="min-h-11 rounded-full border border-borde-control bg-superficie px-4 text-sm font-medium"
            >
              {b.texto}
            </button>
          ))}
        </div>
      )}

      {/* noValidate: el navegador no frena un correo mal escrito; el chat explica qué corregir */}
      <form onSubmit={enviar} noValidate className="flex gap-2 border-t border-borde bg-superficie p-3">
        <label htmlFor="chat-entrada" className="sr-only">Tu respuesta</label>
        <input
          ref={campo}
          id="chat-entrada"
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          disabled={ocupado}
          placeholder={ocupado ? "Apartando tu cita…" : "Escribe aquí"}
          maxLength={200}                                                         // aporta: ninguna respuesta necesita más
          className="min-h-11 min-w-0 flex-1 rounded-[9px] border border-borde-control bg-superficie px-3 text-base outline-none focus:border-[var(--acento)]"
          {...atributosCampo(estado?.paso)}
        />
        <button
          type="submit"
          disabled={ocupado || !entrada.trim()}
          className="min-h-11 rounded-[9px] bg-[var(--acento)] px-4 font-semibold text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </section>
  );
}
