export const metadata = { title: "Eliminar mis datos · Bravo IA" };

const CORREO = "sebas232998@gmail.com";

export default function EliminarDatos() {
  return (
    <main className="legal">
      <h1>
        Bravo <span>IA</span> · Eliminar mis datos
      </h1>
      <p>Si quieres que borremos tus datos de pedidos y mensajes:</p>
      <ol>
        <li>
          Escríbenos a <a href={`mailto:${CORREO}`}>{CORREO}</a> con el asunto “Eliminar mis datos”.
        </li>
        <li>Incluye el número de celular con el que hiciste el pedido.</li>
        <li>Borramos tus datos en un plazo máximo de 15 días hábiles y te confirmamos por correo.</li>
      </ol>
      <p>
        Si tu pedido todavía está en camino, conservamos solo lo necesario para completar la entrega y lo borramos al
        terminar.
      </p>
    </main>
  );
}
