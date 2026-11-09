import Link from "next/link";

export const metadata = { title: "Política de privacidad · Bravo IA" };

const CORREO = "sebas232998@gmail.com";

export default function Privacidad() {
  return (
    <main className="legal">
      <h1>
        Bravo <span>IA</span> · Política de privacidad
      </h1>
      <p className="subtitulo">Última actualización: 9 de noviembre de 2026</p>

      <p>
        Bravo IA es una herramienta que ayuda a tiendas en línea de Colombia a confirmar pedidos con sus clientes por
        WhatsApp y a enviarlos a su operador logístico. Esta política explica qué datos usamos y para qué.
      </p>

      <h2>Qué datos usamos</h2>
      <ul>
        <li>Datos del pedido que la tienda recibe: nombre, celular, departamento, ciudad, dirección, productos y valor.</li>
        <li>Los mensajes de WhatsApp que el cliente intercambia con la tienda sobre su pedido.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Enviar al cliente el resumen de su pedido y recibir su confirmación o sus correcciones.</li>
        <li>Enviar el pedido confirmado a la transportadora u operador logístico de la tienda (por ejemplo, Dropi).</li>
        <li>Avisar al cliente sobre el estado de su envío.</li>
      </ul>
      <p>No vendemos ni compartimos estos datos con terceros para publicidad.</p>

      <h2>Con quién se comparten</h2>
      <ul>
        <li>Meta (WhatsApp), para enviar y recibir los mensajes.</li>
        <li>El operador logístico de la tienda, solo con los datos necesarios para el envío.</li>
        <li>Proveedores de infraestructura que guardan la información de forma segura (alojamiento y base de datos).</li>
      </ul>

      <h2>Cuánto tiempo se guardan</h2>
      <p>Mientras sean necesarios para gestionar el pedido, su entrega y posibles garantías o devoluciones.</p>

      <h2>Tus derechos</h2>
      <p>
        Puedes pedir en cualquier momento conocer, corregir o eliminar tus datos, conforme a la Ley 1581 de 2012 de
        Colombia. Mira cómo en <Link href="/eliminar-datos">Eliminar mis datos</Link> o escríbenos a{" "}
        <a href={`mailto:${CORREO}`}>{CORREO}</a>.
      </p>
    </main>
  );
}
