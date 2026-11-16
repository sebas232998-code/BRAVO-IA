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

Tasa de entrega (entregados ÷ despachados) por tienda, producto, ciudad y transportadora; pedidos estancados; utilidad real por pedido entregado; mejor transportadora por ciudad; recaudo pendiente; ventas rescatadas (en el panel se llama "Rescatadas por Bravo IA": una cifra más, con el número en amarillo pero sin protagonismo; lo principal es la tasa de entrega — cambio de Sebastián del 16 nov 2026); resumen diario por WhatsApp.

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
- Si corrige escribiendo en el chat (sin formulario), la IA interpreta el dato y actualiza el pedido sin pedir otra confirmación (ver "Cambios pedidos por la clienta", decisión de Sebastián del 16 nov 2026).
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
- Todavía NO: seguimiento de 3 mensajes, formulario de WhatsApp Flows (el envío automático y la subida a los 5 minutos quedaron en el paso siguiente).
- Vincular productos sin escribir IDs (pendiente): la app de Dropi en Shopify guarda en cada producto y variante un metafield `dropi._dropi_product` / `dropi._dropi_variation` con el ID del producto y de la variación en Dropi. Cuando Bravo IA tenga acceso a la API de Shopify de cada tienda (al conectar la tienda con login), debe leerlos y vincular sola. Por ahora PETION quedó vinculada a mano (cubresofá, producto Dropi 2286474, 4 variaciones).

Tasa de entrega con semáforo (pedido de Sebastián, 9 nov 2026):

- Círculo de porcentaje que cambia de color gradualmente: verde desde 85 % o más, pasando a amarillo hacia 70 %, zapote/naranja hacia 60 %, y rojo al acercarse y pasar el punto de equilibrio.
- Punto de equilibrio calculado por producto con los datos reales: tasa mínima = (flete + CPA) ÷ (precio de venta − costo del producto). En Dropi la devolución solo cobra el flete de ida. Se marca como una rayita en el círculo.
- Mensaje corto según la zona: "Leyenda" (90 % o más, verde intenso tipo botón de compra #00E676 con borde iluminado), "Excelente" (85-89 %, verde suave); ningún nivel repite color, "Bien, pero ojo", "En riesgo (faltan X puntos para perder)", "Perdiendo plata".
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
- Contador de leyendas en el perfil ("🏆 Leyendas: 2 este mes · 7 en total"), para que la gente hable de "cuántas leyendas hice".
- Botón de compartir al lograr una Leyenda: imagen lista para historias de Instagram/TikTok con el toro, el porcentaje y la marca Bravo IA (sin datos de clientas ni montos, salvo que el vendedor quiera). Sirve como publicidad gratis.
- Idea para la Fase 3 (cuando se cobre mensualidad), sin decidir todavía: premiar a las leyendas; la opción que más le gusta a Sebastián es un 5 % de descuento por 3 leyendas consecutivas (otras: mes gratis, funciones exclusivas). La tasa sale de Dropi, así que no se puede inventar.

## Avance: piloto automático (16 nov 2026)

- Pantalla `/automatico`: por tienda, dos interruptores (vienen apagados): "Enviar la confirmación por WhatsApp sola" y "Subir a Dropi sola".
- Reloj de tareas: Supabase (pg_cron) llama cada minuto a `/api/tareas`, protegido con la clave `CRON_SECRET`. Se usa Supabase porque el plan gratis de Vercel solo deja tareas una vez al día. La pantalla muestra si el reloj está corriendo.
- Confirmación automática: un minuto después de que entra el pedido, solo pedidos que entren después de prender el interruptor, en horario de 7:00 a. m. a 9:00 p. m. (hora de Colombia); los de la noche salen a las 7 a. m. Si falla, el pedido muestra el error de WhatsApp.
- Subida automática: 5 minutos después de que la clienta confirma (por WhatsApp o con el botón). Si en ese tiempo la clienta vuelve a escribir algo que no sea un "sí", un "gracias", un sticker o una reacción, la subida se detiene y el pedido muestra el aviso con dos salidas: "Subir a Dropi" o "Todo bien, que siga sola". Si el vendedor corrige los datos de un pedido confirmado, la espera arranca de nuevo.
- Si Dropi devuelve error no se reintenta solo (si Dropi no respondió, el pedido pudo quedar creado allá): el vendedor corrige y toca "Reintentar".
- Mientras no haya IA, una corrección escrita en el chat no se aplica sola: la detiene y la revisa el vendedor.

## Avance: seguimiento a quien no responde (16 nov 2026)

- En `/automatico`, por tienda: interruptor "Seguimiento a quien no responde" (viene apagado), horas de los 3 mensajes (2, 24 y 48 por defecto, contadas desde que salió la confirmación) y descuento de rescate (activo, 10 %, 24 horas). Por ahora el descuento se configura por tienda (las tiendas son de un solo producto); por producto queda pendiente.
- Mensaje 1: recordatorio. Mensaje 2: ofrece corregir datos o un lugar alterno. Mensaje 3: el descuento del ejemplo (precio normal, con descuento, ahorro, vigencia). Sin descuento activo, el 3 es otro recordatorio.
- Van como plantillas de Meta (`seguimiento_1`, `seguimiento_2`, `seguimiento_descuento`) con los botones "Confirmar pedido" y "Corregir datos"; se crean con un botón en `/whatsapp`. La del descuento es de categoría marketing.
- Si la clienta escribe cualquier cosa, el seguimiento se detiene. Solo se envía de 7 a. m. a 9 p. m., uno por vez y con espacio entre uno y otro. Solo aplica a pedidos cuya confirmación salió después de prenderlo.
- Si no responde al tercero, al vencer el descuento (o 24 horas) el pedido queda "Sin respuesta" y no se le vuelve a escribir.
- Si confirma a tiempo, el total se rebaja y sube así a Dropi; el panel muestra "Confirmó con descuento". Si confirma después de vencido, se le avisa con amabilidad y se le ofrece el precio normal; si vuelve a confirmar, queda al precio normal.
- Si un mensaje no sale, no se reintenta solo (para no escribirle varias veces) y el pedido muestra el error; si el que falla es el del descuento, el descuento no cuenta.

## Avance: bandeja de errores (16 nov 2026)

- En Pedidos sale un aviso "🧰 N pedidos necesitan tu ayuda" que abre la bandeja (`/?ver=errores`): solo los pedidos con algo por resolver, cada uno con sus problemas en rojo y "Editar datos" abierto.
- Número mal escrito: además de quitar espacios y poner el 57, arregla el 57 repetido, el 0 de más al inicio y dos números escritos juntos; si el de envío está malo, usa otro número que traiga el pedido (el de la clienta o el de facturación). Si no logra, explica el problema ("le falta un dígito", "parece un fijo").
- Número sin WhatsApp: la app lee los avisos de entrega de Meta; si un mensaje falla, el pedido muestra el motivo con un botón 📞 Llamar, y el seguimiento se detiene hasta que se corrija.
- Ciudad mal escrita: antes de subir a Dropi quita el departamento pegado ("Cali, Valle", "Medellín - Antioquia", "Cali Valle") y entiende apodos (Medallo, Bquilla, Bmanga, Villavo).
- Aprende las correcciones: si Dropi rechaza un pedido y el vendedor corrige la ortografía de la ciudad, la próxima vez que llegue escrita igual se arregla sola (desde que entra el pedido). Solo aprende cuando la corrección se parece a lo escrito, para no aprender cambios de ciudad de verdad.
- Pendiente: "sin cobertura de transportadora" (falta saber qué permite la API de Dropi).

## Avance: días hábiles (16 nov 2026)

- `lib/festivos.ts`: festivos de Colombia de cualquier año (fijos, los que se corren al lunes y los de Semana Santa), "¿es día hábil?" y "fecha después de N días hábiles". Listo para la herramienta `consultar_dias_habiles` de la IA (Fase 2).

## Cambios pedidos por la clienta (decisión de Sebastián, 16 nov 2026)

- Si la clienta pide un cambio ("en realidad es el de 2 puestos", "quiero 2", "cámbienme la dirección"), la IA lo aplica y el pedido queda confirmado: si está pidiendo el cambio es porque quiere el producto, no se le pide confirmar otra vez.
- Respuesta de una sola frase con solo lo que cambió, nada de resumen completo ni preguntas. Ejemplos: "Listo, tu pedido quedó actualizado a 1 forro de 3 puestos color beige ✅" · "Listo, ya actualicé la dirección a Cra 50 # 10-20 ✅". El total se agrega solo cuando cambia lo que va a pagar: "Listo, tu pedido quedó actualizado a 3 forros de 3 puestos color gris ✅ El total ahora es $239.700".
- Si ella responde ("ok, gracias") o no dice nada en un par de minutos, sale el mensaje de pedido confirmado ("Tu pedido está siendo procesado y será despachado lo más pronto posible 🚚"). Si pregunta algo, la IA responde primero.
- La espera de 5 minutos antes de subir a Dropi sigue igual: si dice "no, eso no", la subida se detiene.
- Variantes y cantidades: solo las que existen en Shopify, con el precio de Shopify; el pedido sube a Dropi con la variación vinculada. Si pide algo que no existe o no está claro, la IA pregunta o escala al vendedor; nunca adivina.
- Si el pedido ya está en Dropi: depende de lo que permita la API de Dropi (pendiente por verificar); si no deja editar, la IA responde con amabilidad y avisa al vendedor.
- Necesita: clave de la API de Anthropic, Shopify conectado con lectura de productos (variantes y precios) y el token de WhatsApp para probar con mensajes reales.

## Avance: la IA atiende a las clientas (16 nov 2026)

- Interruptor por tienda en `/automatico`: "La IA atiende los mensajes de las clientas" (viene apagado; necesita `ANTHROPIC_API_KEY` en Vercel).
- Lo claro sigue sin IA (gratis): un "sí", el botón, "Corregir datos", un "gracias" o un sticker. Lo demás pasa primero por Haiku (`claude-haiku-5-5`), que decide si es un "sí" o un "gracias" dicho de otra forma; si no, lo atiende Sonnet (`claude-sonnet-5-5`, esfuerzo bajo, con el reintento automático de Anthropic si un filtro de seguridad rechaza por error).
- Herramientas de la IA: `cambiar_producto` (variante o cantidad, solo del catálogo y con el precio de la tienda; el total sube o baja en la diferencia, así se respeta el envío), `cambiar_datos_envio`, `confirmar_pedido` y `escalar_al_vendedor`. La app valida cada cambio; la IA no puede inventar variantes ni precios.
- Si cambia algo, el pedido queda confirmado, sale una frase con lo que cambió (y el total si cambió) y el "pedido confirmado" sale cuando ella responda o a los 2 minutos. La espera de 5 minutos antes de Dropi arranca de nuevo. Si tenía descuento de rescate vigente, se respeta sobre el total nuevo.
- Si escribe varios mensajes seguidos, se responde una sola vez (al último). Lo que la IA no sabe o no puede hacer queda en el pedido como "🤖 La IA te necesita" (y en la bandeja de errores), con el botón "Ya lo resolví"; si ya estaba confirmado, la subida a Dropi se detiene.
- Catálogo de variantes: se llena con los avisos de Shopify "Creación de producto" y "Actualización de producto" (mismo webhook y misma clave que los pedidos) y con lo que traen los pedidos. Así no hace falta darle a Bravo IA acceso a la tienda.
- Si una variante nueva no está vinculada con Dropi, el pedido cae a la bandeja de errores con "Producto sin escoger en Dropi".

## Idea para la Fase 3: cada vendedor escoge su IA (pedido de Sebastián, 16 nov 2026)

- Cuando otros dropshippers usen Bravo IA, cada uno podrá escoger qué IA atiende sus mensajes (Claude, ChatGPT u otra parecida) y pegar la clave de su propia cuenta, así ese consumo lo paga él directo.
- Las reglas de tono, los límites (no inventar descuentos, no cancelar, escalar lo que no sabe) y las herramientas son las mismas para todas; solo cambia el "cerebro". Por eso la parte de la IA está separada en `lib/ia`.
- Por ahora (tiendas propias) se usa Claude con la clave de Sebastián.

## Avance: simulador de la IA (16 nov 2026)

- Pantalla `/probar-ia` (enlace "Probar la IA" en Piloto automático): el vendedor escoge un pedido, escribe como si fuera la clienta y ve qué respondería la app (sin IA, Haiku o Sonnet) y cómo quedaría el pedido. Corre la IA de verdad sobre una copia: no envía WhatsApp ni cambia el pedido. Sirve para ajustar cómo habla la IA antes de usarla con clientas (necesita la clave de Anthropic).
- Pendiente de probar: la subida a Dropi nunca se ha usado con un pedido real.

## Avance: pedidos atendidos por fuera y pestañas (16 nov 2026)

- El panel de pedidos tiene una pestaña por estado con su número: "Por confirmar" y "Confirmados" (siempre visibles), y "En Dropi", "Con error", "Sin respuesta", "Entregados y cancelados" y "Archivados" (solo si tienen pedidos).
- Botón "Ya lo atendí por mi cuenta 📁": el vendedor lo toca cuando ya habló con la clienta por fuera. El pedido pasa a "Archivados" y la app no le escribe nunca (ni confirmación, ni seguimiento, ni IA). "Devolver a Por confirmar" lo regresa.
- Si la confirmación ya se envió, el botón de reenviar queda escondido detrás de "¿Reenviar?" para no tocarlo por error.
- Los 9 pedidos que había antes del 16 nov los atendió Sebastián por fuera: la app no los toca; él decide si los archiva.

## Avance: cerebro de la tienda (16 nov 2026, adelantado de la Fase 2)

- Pantalla `/cerebro` (enlace en Piloto automático): por tienda, un cuadro de texto con lo que la IA puede responder (producto, medidas, envíos, garantía, cambios, pagos, preguntas frecuentes). La IA responde solo con eso; lo que no esté, lo escala al vendedor.
- PETION quedó prellenada con lo que se sabía de la tienda y de la ficha de Dropi (colores, medidas, acolchado, lavado, precio, pago contraentrega). Faltan los tiempos de entrega, la garantía y los cambios: los escribe Sebastián.
- Pendiente: leer el link de la tienda automáticamente (por ahora se escribe a mano; las políticas de PETION en Shopify solo tienen la de privacidad).

## Avance: panel (16 nov 2026, adelantado de la Fase 2)

- Pantalla `/panel` (enlace "Panel" en Pedidos) con filtro hoy / esta semana / este mes (hora de Colombia, la semana desde el lunes).
- "Ventas rescatadas por Bravo IA" con el número grande en amarillo y la plata de esos pedidos: confirmaron después de un mensaje de seguimiento, con el descuento de rescate o después de que la IA les cambió algo.
- Tasa de confirmación en un círculo con semáforo (verde desde 85 %, Leyenda desde 90 %, amarillo hacia 70 %, naranja hacia 60 %, rojo abajo), medida sobre los pedidos ya decididos (confirmados ÷ confirmados + sin respuesta/cancelados), con una frase que la explica.
- Cifras: recibidos, confirmados, por confirmar, sin respuesta o cancelados, subidos a Dropi. Los archivados no cuentan.
- Pendiente: tasa de entrega, novedad, rescate y real de venta (necesitan leer los estados de Dropi).

## Avance: tasas de operación con semáforo (16 nov 2026)

- El panel muestra la tasa de entrega grande con el círculo de color que cambia de a poquito (verde intenso con borde iluminado para "Leyenda 🔥" desde 90 %, "Excelente" 85-89, "Bien, pero ojo", "En riesgo (faltan X puntos para tu mínimo)", y "Por debajo de tu tasa mínima"; "para perder" / "Perdiendo plata" solo cuando se conoce el CPA), la rayita del punto de equilibrio y los avisos al acercarse a 5 puntos o cruzar el mínimo.
- "Tasas de operación": confirmación, novedad (color al revés: menos es mejor), rescate y real de venta, cada una con su círculo y su frase.
- "Tus números por producto": costo del proveedor, flete de ida, CPA y tasa mínima propia. La app calcula el mínimo con (flete + CPA) ÷ (precio − costo) y lo sugiere ("Según tus costos, tu mínimo es 44 %").
- "Ver cómo se verá con datos": llena el panel con números de ejemplo para ver el diseño.
- El panel va en 3 pestañas, cada tema junto (pedido de Sebastián, 16 nov 2026): "Entregas" (tasa de entrega con semáforo y "Tu tasa mínima · Cambiar" ahí mismo junto a la rayita; despachados, entregados, devueltos/no entregados, con novedad; tasas de novedad, rescate y real de venta), "Confirmación" (tasa de confirmación; recibidos, por confirmar, confirmados, no confirmados y rescatadas por Bravo IA) y "Mis números" (costos por producto).
- Los estados de entrega vienen de Dropi (Shopify no los tiene).
- Cambio (pedido de Sebastián, 16 nov 2026): las ventas rescatadas no van en grande arriba; son una cifra más en "Resumen" ("Rescatadas por Bravo IA"), y lo primero que se ve es la tasa de entrega.
- Cada tarjeta del panel da información útil, como las buenas apps de análisis (pedido de Sebastián, 16 nov 2026): el número con su color, la comparación con el período anterior ("▲ 3 puntos vs la semana pasada", verde si mejora y rojo si empeora; en novedad, bajar es bueno) y un consejo de una línea según la zona ("¡Semana brava! 🔥", "Atiende rápido las 12 novedades abiertas…", "Prende el seguimiento a quien no responde…").
- Si no hay tasa mínima, sale un botón amarillo "+ Agrega tu tasa mínima de efectividad para no perder dinero" que abre el campo ahí mismo; si ya está, "Tu tasa mínima para no perder dinero: 44 % · Cambiar".

## Avance: estados de Dropi automáticos (16 nov 2026)

- Verificado: la API de integraciones de Dropi deja LEER los pedidos (GET /orders/myorders?result_number=&start=) con el mismo token. Trae estado (ENTREGADO, DEVOLUCION, EN TRANSITO, EN REPARTO, RECLAME EN OFICINA, CANCELADO, PENDIENTE CONFIRMACION, GUIA_GENERADA…), novedad de la transportadora, transportadora, ciudad, tienda, producto, precio del proveedor, total y flete. Incluye las 4 tiendas de Sebastián (PETION, ruumbo, MERRYLAND, multifem), también los pedidos que subió la app de Dropi.
- Cada 30 minutos Supabase llama a `/api/dropi/sincronizar`, que guarda los pedidos en `dropi_ordenes` SIN datos personales (ni nombre, ni teléfono, ni dirección). La primera vez trae 4 meses; después, los últimos 45 días.
- El panel de Entregas usa esos datos: filtro por tienda, tasa de entrega/novedad/rescate/real de venta reales, "en camino", y "¿Dónde se pierden?" (tasa de entrega por transportadora, ciudad y producto, de peor a mejor, últimos 45 días).
- La tasa mínima se calcula sola con los promedios reales de Dropi (venta, costo del proveedor y flete por pedido) si el vendedor no escribe los suyos; solo falta el CPA para hablar de "perder plata".
- `/api/dropi/diagnostico` (solo lectura, protegido) muestra la estructura de la API sin datos personales.

## Cambio: el panel es de operación, no de costos (pedido de Sebastián, 16 nov 2026)

- El panel muestra cómo va la operación (entregados, devueltos, en camino, novedades), no costos: se quitó "Mis números" y no se piden costo del proveedor ni CPA.
- La tasa mínima de efectividad para no perder dinero la escribe el vendedor, por tienda (tabla `tasas_minimas`), con el botón amarillo "+ Agrega tu tasa mínima…" junto a la tasa de entrega.
- Fechas: por defecto "Últimos 30 días"; también 7 y 90 días y "Escoger fechas" (desde / hasta). La comparación es contra el rango anterior del mismo tamaño.
- Solo aparecen las tiendas que tienen pedidos en las fechas escogidas (las viejas no salen); por defecto, la tienda de la app (PETION).
- Pedidos de prueba (pedido de Sebastián, 16 nov 2026): al leer Dropi, la app marca como prueba los pedidos a nombre de los "nombres de prueba" (tabla `ajustes`, clave `nombres_prueba`; hoy "Sebastian Toro") o que digan "prueba"/"test" en el nombre o las notas, sin guardar el nombre. No cuentan en el panel, que avisa "Sin contar N pedidos de prueba".

## Avance: bandeja de novedades (16 nov 2026, Fase 2 adelantada)

- Pantalla `/novedades` (enlace "Novedades (N)" en Pedidos): pedidos en camino con novedad de la transportadora (o "Reclame en oficina"), con tienda, transportadora, guía, ciudad, producto, dirección y hace cuánto. Primero las más viejas y a las que no se les ha escrito.
- Botón "Escribirle por WhatsApp 💬": abre el WhatsApp normal del vendedor con el mensaje ya escrito según la novedad (repartidor no la encontró, dirección incompleta, reclame en oficina, no le interesa, otra), siguiendo el tono: la novedad es de la transportadora, nunca de la clienta; se le cuenta que el paquete ya está en su ciudad y se le pide confirmar dirección o un lugar alterno. No necesita el token de Meta.
- "Ya le escribí" marca la novedad (tabla `novedades_gestion`, solo el número del pedido).
- Los datos de contacto se leen de Dropi al abrir la pantalla y no se guardan. La corrección o el nuevo intento se hacen en Dropi (no se sabe aún si la API lo permite).
- Estado de Dropi en cada pedido de la app (16 nov 2026): se cruza por el número del pedido de Shopify (`shop_order_id`) o por el número de Dropi, también para los pedidos que subió la app de Dropi. Solo se muestra ("📦 Dropi: En reparto · SERVIENTREGA", con enlace a la novedad si tiene); no cambia el estado del pedido en la app.

## Avance: Leyendas (16 nov 2026)

- Una Leyenda es una semana (lunes a domingo, hora de Colombia) ya cerrada con tasa de entrega de 90 % o más y al menos 5 pedidos terminados, según los estados de Dropi (sin pruebas). Se cuentan por la tienda escogida en el panel.
- Panel (Entregas): "🏆 Leyendas: X este mes · Y en total" y, si la tasa del rango está en Leyenda, botón "Compartir mi Leyenda 🔥".
- `/leyenda`: imagen para historias (1080 × 1920, `/api/leyenda`) con el toro, "LEYENDA", el porcentaje, las fechas y la marca Bravo IA, sin datos de clientas ni plata. Botón para compartir (Instagram, TikTok, WhatsApp desde el celular) o descargar.
- Confeti al abrir el panel cuando la semana pasada fue Leyenda ("¡Semana brava! 🔥 La semana pasada entregaste el X %"), máximo una vez por semana en cada celular.
