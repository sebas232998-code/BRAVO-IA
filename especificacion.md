# Bravo IA — Especificación

Copia de trabajo del documento "App para dropshippers — Especificación" (7 nov 2026).
Documento original: https://claude.ai/artifact/9JYKH6kdceE8tNKnA5x9w9

## Qué es y qué problema resuelve

Una app para dropshippers de contraentrega (Dropi, Colombia) que rescata ventas: confirma pedidos, persigue a quien no responde, resuelve novedades y avisa a tiempo cuando algo va mal. Cada vendedor la programa con reglas escritas en sus propias palabras.

El problema: en contraentrega cada pedido que no se entrega cuesta el flete de ida (en Dropi no se cobra la vuelta) y la ganancia de esa venta. Hoy confirmar, perseguir clientas y revisar novedades se hace a mano, pedido por pedido.

Principios:

- El pedido no llega a Dropi hasta que la clienta confirme.
- La IA nunca se inventa datos, descuentos ni promociones: usa solo lo que el vendedor configuró y lo que dice la tienda.
- Lo delicado (cancelar, cambiar proveedor, seguir confirmando sin stock) lo decide el vendedor con un botón.
- La clienta siempre se siente escuchada: se le da la razón, nunca se le culpa.
- Primero se usa en las tiendas propias (Rumbo, PETION); después se vende a otros dropshippers.

## Arquitectura y stack

5 partes: conectores, motor de reglas y tiempos, agente IA, base de datos, y panel con alertas. Shopify trae los pedidos; WhatsApp y Dropi van en los dos sentidos; el vendedor responde a las alertas con botones y cambia las reglas.

| Pieza | Herramienta | Costo para empezar |
| --- | --- | --- |
| App web instalable en el celular (PWA) | Next.js | Gratis |
| Base de datos y login | Supabase | Plan gratis |
| Hosting y tareas programadas | Vercel | Plan gratis |
| IA | API de Anthropic (Claude) | Pago por uso |
| Mensajes | WhatsApp Business API | Pago por conversación |

## La IA: modelos, herramientas y límites

| Tarea | Modelo | Por qué |
| --- | --- | --- |
| Conversar con la clienta, rescatar novedades, rebatir objeciones | Sonnet | Necesita criterio y tono |
| Clasificar respuestas (sí, no, cambio de datos, objeción) | Haiku | Simple, repetitiva y barata |

La app le envía a Claude el mensaje de la clienta, el historial del chat, los datos del pedido, el "cerebro" de la tienda y las reglas del vendedor, más una lista de herramientas que la app ejecuta:

- `consultar_pedido`: datos y estado del pedido.
- `editar_datos_pedido`: dirección, barrio, ciudad, teléfono, nombre (solo antes de enviar a Dropi).
- `enviar_whatsapp`: responder a la clienta.
- `marcar_confirmado`: arranca la espera de 5 minutos.
- `aplicar_descuento`: solo el descuento configurado y vigente.
- `consultar_dias_habiles`: fecha estimada de entrega con festivos de Colombia.
- `escalar_al_vendedor`: cuando no sabe algo o la acción es delicada.

Límites fijos:

- No cancela pedidos ni cambia proveedor: lo decide el vendedor.
- No da descuentos fuera de los configurados ni promete fechas sin calcularlas.
- No responde lo que no esté en la tienda: escala al vendedor.
- Mensajes fuera de la ventana de 24 horas de WhatsApp usan plantillas aprobadas por Meta.

## Conectores

| Conector | Qué trae o hace | Cómo se conecta | Fase |
| --- | --- | --- | --- |
| Shopify | Pedido nuevo: tienda, producto, variante, unidades, valor, datos de la clienta | App privada o webhooks de pedidos | 1 |
| WhatsApp Business API (Meta) | Enviar y recibir mensajes; plantillas para fuera de 24 h | Cuenta oficial de Meta, un número por tienda | 1 |
| Dropi | Crear pedidos, leer estados, novedades, cartera (flete cobrado) | Token de integración desde el panel de Dropi | 1 |
| Bravo Check | Stock y calificación del proveedor | Integración propia | 2 |
| Meta Ads y TikTok Ads | Gasto y CPA por producto | API de cada plataforma | 3 |

Pendiente por verificar: qué permite exactamente la API de Dropi (crear pedidos, editar valor a recaudar, webhooks de estados).

## Recorrido de cada pedido

Mientras la clienta no confirme, el pedido vive solo en la app y se puede cambiar todo.

- Por confirmar: la IA cambia dirección, barrio, ciudad, teléfono o nombre y vuelve a mostrar el resumen.
- Confirmado: si en los 5 minutos la clienta corrige algo, se actualiza y la espera arranca de nuevo.
- Enviado a Dropi: si pide un cambio, la IA responde con amabilidad y avisa al vendedor para gestionarlo en Dropi.
- Si el stock está agotado y el vendedor pausó, los pedidos esperan en "Por confirmar".
- Otros estados: sin respuesta, en novedad, entregado, devuelto, cancelado.

## Seguimiento a quien no responde y descuento de rescate

Máximo 3 mensajes; si no responde al tercero, el pedido queda "sin respuesta" y no se le vuelve a escribir.

| Mensaje | Cuándo (configurable) | Objetivo |
| --- | --- | --- |
| 1 | 2 horas sin respuesta | Recordar que falta confirmar |
| 2 | 24 horas | Ofrecer corregir datos o un lugar alterno |
| 3 | 48 horas | Descuento de rescate con vencimiento |

Descuento (por producto): activar después de 2 mensajes sin respuesta; 10 %; vigencia 24 horas; mostrar ahorro; razón solo de promociones reales cargadas por el vendedor.

Ejemplo del mensaje 3:

```
Hola, ¿cómo estás? Te cuento que no queremos que te quedes sin tu producto, así que tenemos un descuento especial para ti 🛍

Precio normal: $89.900
Con tu descuento: $80.910
Te ahorras: $8.990

Este descuento es válido solo por 24 horas.

Si todo está correcto, envía la palabra *CONFIRMAR* y te lo despachamos lo más pronto posible 🚚
```

- Si confirma con descuento, el pedido sube a Dropi con el valor a recaudar ya rebajado.
- Si confirma después de las 24 horas, se le dice con amabilidad que venció y se ofrece el precio normal.

## Novedades, cerebro de la tienda y días hábiles (Fase 2)

- La novedad se atribuye a la transportadora o al repartidor, nunca a la clienta. Se le cuenta que el paquete ya está en su ciudad y se le pide confirmar o corregir la dirección, o dar un lugar alterno.
- Objeciones ("ya no lo quiero", "no tengo la plata"): preguntar el porqué, darle la razón y ofrecer lo que el vendedor permita.
- Cerebro: el vendedor pega el link de la tienda; la app lee producto, precio, garantía, tiempos de envío y preguntas frecuentes. La IA responde solo con eso; si no está, escala.
- Días hábiles con festivos de Colombia (incluye los que se corren al lunes).

## Stock y bandeja de errores

- Stock (Fase 2, con Bravo Check): alerta en días que quedan. Si se agota, notificación con [Seguir confirmando] [Pausar confirmaciones]. No le escribe a clientas ni cambia de proveedor por su cuenta.

Bandeja de errores (Fase 1):

| Error | Qué hace la app sola | Qué te deja a ti |
| --- | --- | --- |
| Número mal escrito | Quita espacios, agrega +57, detecta dígito faltante | [Editar número] si no logra arreglarlo |
| Número sin WhatsApp | Avisa | [Llamar] [Editar número] |
| Ciudad mal escrita | La corrige y reintenta | Nada |
| Producto sin vincular en Dropi | Te pide escogerlo | Escoger una vez; la app lo recuerda |
| Sin cobertura de transportadora | Muestra transportadoras que sí llegan | Escoger una |
| Otro error de Dropi | Muestra el mensaje de Dropi | Corregir y [Reintentar] |

Si un error se repite, la app guarda la corrección para la próxima vez.

## Panel y alertas (Fase 2)

Tasa de entrega (entregados ÷ despachados) por tienda, producto, ciudad y transportadora; pedidos estancados; utilidad real por pedido entregado; mejor transportadora por ciudad; recaudo pendiente; ventas rescatadas (en el panel se llama "Ventas rescatadas por Bravo IA", con el número grande en amarillo, para que se vea lo que la app le ganó al vendedor); resumen diario por WhatsApp.

## Configuración y tono

| Nivel | Qué se configura |
| --- | --- |
| Tienda | Link (cerebro), número de WhatsApp, tono, reglas propias, promociones vigentes |
| Producto | Proveedor en Dropi, descuento de rescate, límite de stock, CPA máximo, límite de tasa de entrega |
| General | Tiempos del seguimiento, espera tras confirmar (5 min), horario de envío de mensajes |

Mensaje de confirmación (cada dato en su renglón corto):

```
Producto: Forro de sofá 3 puestos
Color: Gris
Cantidad: 2
Total a pagar: $159.800
Ciudad: Cali
Dirección: Cra 45 # 12-30

Si todo está correcto, envía la palabra *CONFIRMAR* y te lo despachamos lo más pronto posible 🚚
```

Resumen del pedido según sus variantes (pedido de Sebastián, 9 nov 2026):

- Cada producto puede tener variantes distintas (tamaño y color, solo color, o ninguna). El resumen se arma leyendo el pedido: si no tiene variante, solo va el nombre; si tiene, va cada variante.
- Si hay varias unidades con variantes distintas, se listan ordenadas y cortas, por ejemplo: "2 forros de sofá: 1 de 3 puestos gris y 1 de 2 puestos gris".
- El mensaje no debe quedar largo: solo productos, total, ciudad y dirección.
- No hace falta una plantilla por producto: una sola plantilla aprobada por Meta con espacios ({{1}}, {{2}}…) sirve para todos, porque el resumen de productos va dentro de un espacio. Ojo: Meta no deja saltos de línea dentro de un espacio, así que los renglones fijos van en la plantilla.
- La plantilla lleva botones de respuesta rápida ("Confirmar pedido" y "Cambiar datos" (Meta no deja emojis en los botones)) para que confirmar sea un solo toque.
- Cuenta como confirmación cualquier "sí": confirmo, confirmar, sí, si señor, ok, listo, perfecto, dale, de una, 👍, o el botón. Las palabras comunes se reconocen sin IA (gratis); solo si la respuesta es dudosa ("sí pero cámbienme la dirección") la clasifica la IA.

Corregir datos (pedido de Sebastián, 9 nov 2026):

- La clienta ve dos botones: "Confirmar pedido" y "Corregir datos".
- "Corregir datos" le abre un formulario dentro del mismo WhatsApp (WhatsApp Flows) con sus datos ya llenos (nombre, celular, ciudad, barrio, dirección); cambia solo lo que quiera y toca "Confirmar pedido" (el botón final del formulario). Eso cuenta como confirmación: la app actualiza el pedido, lo marca confirmado y envía el mensaje de pedido confirmado, sin volver a mandar el resumen (pedido de Sebastián, 9 nov 2026).
- Si corrige escribiendo en el chat (sin formulario), la IA interpreta el dato y sí le vuelve a mostrar el resumen para que confirme, porque la IA podría entender mal una dirección.
- También puede corregir escribiendo normal en el chat ("mejor envíenlo a otra dirección"): la IA responde corto ("Ok, no hay ningún problema. Envía los datos que deseas editar directamente aquí."), toma el dato nuevo y vuelve a mostrar el resumen.
- Después de confirmar: a los ~5 segundos sale el mensaje de pedido confirmado. Durante los 5 minutos de espera, si la clienta escribe "no, espera, faltó…", la subida a Dropi se detiene, se corrige y la espera arranca de nuevo.

Respuesta cuando la clienta confirma (se envía unos 5 segundos después de su "CONFIRMAR", con el renglón en blanco en medio). La espera de 5 minutos antes de subir a Dropi sigue igual:

```
✅ ¡Listo! Tu pedido ha sido confirmado.

Tu pedido está siendo procesado y será despachado lo más pronto posible 🚚
```

Que no parezca un robot:

- Nunca responder al instante: esperar unos segundos, más si el mensaje es largo, como si alguien lo estuviera escribiendo.
- No repetir siempre el mismo texto palabra por palabra en las conversaciones (salvo la confirmación y el resumen del pedido, que van fijos).
- Responder a lo que la clienta dijo, con sus palabras, no con respuestas genéricas.
- Mensajes cortos, como se escribe en WhatsApp.

Tono por defecto:

- Cálido, formal y natural, como hablando ("te cuento, mira…"), no de plantilla.
- Agradecer en vez de exigir; nunca culpar a la clienta.
- Criterio de venta: nada exagerado ni forzado. La clienta ya quiere su producto, así que el mensaje de confirmación va directo y natural, sin frases de venta metidas. Las palabras que refuerzan el deseo solo se usan cuando encajan (cuando ella pide un cambio, duda o pone una objeción), y siempre de forma sutil, como lo diría una buena vendedora por WhatsApp.
- Cuando la clienta pide editar datos, responder corto y con "deseas" (no "quieres"): "Ok, no hay ningún problema. Envía los datos que deseas editar directamente aquí." El mensaje de confirmación del pedido no cambia (no se le agrega "¿deseas confirmar?").
- No decir "te escribimos de {tienda}": el chat ya existe.
- Sin 🙏 ni 😊; usar 📦, 🛍, 🚚.
- Pedido en reparto, corto y sin guía: "Hola, ¿cómo estás? Tu paquete ya está en tu ciudad y se encuentra en reparto. Por favor, estar pendiente porque el repartidor puede llegar en cualquier momento."

## Fases

| Fase | Incluye | Lista cuando |
| --- | --- | --- |
| 1. Confirmar y subir | Shopify → app, confirmación por WhatsApp, espera de 5 min, edición de datos, envío a Dropi, bandeja de errores, seguimiento de 3 mensajes con descuento | Los pedidos de Rumbo y PETION se confirman y suben sin tocar Dropi a mano |
| 2. Rescatar y medir | Novedades, cerebro, días hábiles, panel, stock con Bravo Check, resumen diario | La tasa de entrega se ve por producto y ciudad, y las novedades se atienden solas |
| 3. Escalar y vender | Meta y TikTok Ads, varios usuarios, mensualidad, tiendas de apps | Otro dropshipper la usa con sus propias tiendas |

## Avance: WhatsApp conectado (9 nov 2026)

- Pantalla `/whatsapp`: por tienda se guardan Phone number ID, WABA ID, token y App secret (en Supabase, solo los lee el servidor), mensaje de prueba (hello_world), URL y token de verificación del webhook, y botón para crear la plantilla `confirmacion_pedido` en Meta.
- En cada pedido "Por confirmar": botón "Enviar confirmación por WhatsApp" (plantilla aprobada) y chat del pedido.
- Webhook `/api/webhooks/whatsapp`: guarda los mensajes; un "sí" claro marca el pedido como confirmado y a los ~5 s responde el mensaje de pedido confirmado; "Corregir datos" responde con el texto de editar datos. Lo dudoso solo se guarda.
- Todavía NO: envío automático al entrar el pedido, subida automática a Dropi a los 5 minutos, seguimiento de 3 mensajes, formulario de WhatsApp Flows.
- Vincular productos sin escribir IDs (pendiente): la app de Dropi en Shopify guarda en cada producto y variante un metafield `dropi._dropi_product` / `dropi._dropi_variation` con el ID del producto y de la variación en Dropi. Cuando Bravo IA tenga acceso a la API de Shopify de cada tienda (al conectar la tienda con login), debe leerlos y vincular sola. Por ahora PETION quedó vinculada a mano (cubresofá, producto Dropi 2286474, 4 variaciones).

Tasa de entrega con semáforo (pedido de Sebastián, 9 nov 2026):

- Círculo de porcentaje que cambia de color gradualmente: verde desde 85 % o más, pasando a amarillo hacia 70 %, zapote/naranja hacia 60 %, y rojo al acercarse y pasar el punto de equilibrio.
- Punto de equilibrio calculado por producto con los datos reales: tasa mínima = (flete + CPA) ÷ (precio de venta − costo del producto). En Dropi la devolución solo cobra el flete de ida. Se marca como una rayita en el círculo.
- Mensaje corto según la zona: "Leyenda" (90 % o más, con color especial dorado brillante), "Excelente" (85-89 %), "Bien, pero ojo", "En riesgo (faltan X puntos para perder)", "Perdiendo plata".
- Filtro por período: hoy, semana, mes.
- El vendedor puede escribir su propia "tasa de entrega mínima para no perder" (campo junto a la rayita). Si no la pone, la app usa la calculada y se la sugiere ("Según tus costos, tu mínimo es 44 %").
- Notificaciones: aviso cuando la tasa se acerca al mínimo (por ejemplo, a 5 puntos: "Tu tasa de entrega va en 49 %, se está acercando a tu límite del 44 %") y otro cuando lo cruza ("Bajaste de tu tasa mínima con este producto"). Solo se habla de "perder plata" cuando la app conoce el CPA real (porque el vendedor lo escribió o porque Meta/TikTok Ads están conectados); si no, se habla de la tasa mínima. Llegan como notificación al celular y en el resumen diario por WhatsApp.

Tasas de operación (pedido de Sebastián, 9 nov 2026): una sección del panel que muestra, por producto y en total, el embudo completo con nombres fáciles:

| Tasa | Cálculo | Qué le dice al vendedor |
| --- | --- | --- |
| Tasa de confirmación | confirmados ÷ pedidos recibidos | Cuántas clientas confirman de verdad |
| Tasa de entrega | entregados ÷ (entregados + devueltos) | Cuántos pedidos despachados se entregan |
| Tasa de novedad | pedidos con novedad ÷ despachados | Cuántos tienen problemas en el camino |
| Tasa de rescate | novedades resueltas ÷ novedades | Cuántas novedades salva Bravo IA |
| Tasa real de venta | entregados ÷ pedidos recibidos | De cada 100 pedidos, cuántos se vuelven plata |

Cada tasa con su círculo de color y un texto de una línea que explique qué significa.

Gamificación (pedido de Sebastián, 9 nov 2026):

- Animación de confeti al abrir el panel cuando el vendedor logra algo, revisado por semana (ni todos los días ni solo cada mes): cerrar la semana con la tasa de entrega en verde ("¡Semana brava! Entregaste el 91 % de tus pedidos"), superar su mejor semana, etc. Máximo una celebración por semana, para que no canse.
- Logros: primeras 100 entregas, 10 ventas rescatadas por Bravo IA, 3 meses seguidos arriba del 85 %, etc.
- Rachas: días seguidos confirmando todos los pedidos.
- Tono de felicitación con la marca: "bravo", fuego 🔥, sin exagerar.
- Los mensajes de celebración hablan de logros, no solo de números: "¡Excelente trabajo! Esta semana superaste tu meta de entrega", "Tu costo por venta estuvo por debajo de tu meta" (cuando se conoce el CPA), "¡Nuevo récord! Es tu mejor semana desde que usas Bravo IA". Con varios usuarios: "Estás por encima del X % de los dropshippers de Bravo IA".
