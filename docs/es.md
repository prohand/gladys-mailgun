# Integración Mailgun para Gladys Assistant

Reciba sus notificaciones de Gladys por correo a través de [Mailgun](https://www.mailgun.com/),
envíe correos desde sus escenas e inicie escenas cuando un correo se entrega, falla, se abre o se
pulsa un enlace.

Mailgun es un servicio en la **nube**: Gladys necesita acceso a Internet para enviar los correos.

## Lo que necesita

- Una cuenta de Mailgun (el plan gratuito basta para empezar).
- Un **dominio de envío** en Mailgun, p. ej. `mg.ejemplo.es`. El dominio «sandbox» que Mailgun crea
  para usted también funciona, pero solo envía a los «destinatarios autorizados» de su cuenta.
- Una **clave de API**:
  - una **clave de envío del dominio** (Mailgun → _Sending_ → _Domain settings_ → _Sending keys_)
    basta para enviar correos;
  - la **clave de API privada** (Mailgun → _API keys_) es necesaria para las estadísticas del
    widget y para registrar los webhooks automáticamente.
- La **región** de su cuenta: EE. UU. (`api.mailgun.net`) o UE (`api.eu.mailgun.net`). Un dominio
  creado en la región UE no existe para la API de EE. UU.
- Opcional: **Gladys Plus**, para recibir los eventos de Mailgun (entregado, fallido, abierto…) e
  iniciar escenas con ellos.

## Configuración

En Gladys: **Integraciones** → **Mailgun** → **Configuración**.

| Campo                                             | Qué indicar                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Clave de API de Mailgun                           | La clave de envío o la clave de API privada.                                                |
| Dominio de envío                                  | El dominio tal como aparece en Mailgun, p. ej. `mg.ejemplo.es`.                             |
| Región de la cuenta                               | EE. UU. o Europa.                                                                           |
| Nombre del remitente                              | El nombre que se ve en la bandeja de entrada. Por defecto: `Gladys`.                        |
| Dirección del remitente                           | Una dirección del dominio de envío. Vacío: `gladys@<su dominio>`.                           |
| Asunto de las notificaciones                      | Asunto de los correos de notificación. Por defecto: `Gladys`.                               |
| Enviar también una versión HTML                   | Enlaces que se pueden pulsar e imagen de la cámara en el correo. Activado por defecto.      |
| Límite de envío (correos por hora)                | Por encima, los correos se rechazan hasta que pase la hora. Por defecto: 60.                |
| Registrar los webhooks en Mailgun automáticamente | Vea [Eventos de Mailgun](#eventos-de-mailgun-disparadores-de-escena). Activado por defecto. |
| Clave de firma de los webhooks                    | Desde la página _Webhooks_ de Mailgun. Muy recomendable si usa los eventos.                 |

Pulse **Probar la conexión**: la respuesta indica si el dominio es conocido y está activo. Después
**Enviar un correo de prueba** a su propia dirección.

### Mi cuenta (cada usuario)

Cada usuario de Gladys indica **su propia dirección de correo** en el bloque **Mi cuenta** de la
misma pantalla. Gladys envía las notificaciones de ese usuario a esa dirección. Un usuario sin
dirección no recibe correos.

## Notificaciones

Una vez indicada su dirección, cada notificación que Gladys le envía (alarma, escenas «Enviar un
mensaje», imagen de cámara…) llega también por correo. La imagen de la cámara se muestra dentro
del correo cuando la versión HTML está activada.

## Acción de escena: «Enviar un correo»

En una escena, añada la acción **Integraciones** → **Mailgun** → **Enviar un correo**:

| Campo                | Descripción                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| Para                 | Una o varias direcciones, separadas por comas (20 como máximo).              |
| Asunto               | Asunto del correo.                                                           |
| Mensaje              | Texto del correo.                                                            |
| Copia / Copia oculta | Copias opcionales.                                                           |
| Responder a          | Dirección de respuesta opcional.                                             |
| Etiquetas de Mailgun | Hasta 3, separadas por comas. Útiles para filtrar los disparadores de abajo. |

Las variables de escena (`{{...}}`) funcionan en todos los campos. La acción devuelve:

- `sent`: `true` cuando Mailgun aceptó el correo;
- `message_id`: el identificador de Mailgun del correo;
- `error`: por qué no se envió el correo (vacío en otro caso).

La acción nunca detiene la escena: compruebe `sent` en una condición si las acciones siguientes
dependen de ello.

## Eventos de Mailgun (disparadores de escena)

Mailgun puede decirle a Gladys qué pasa con los correos. Mailgun debe poder llegar a su Gladys
desde Internet, así que esto pasa por **Gladys Plus**:

1. En la pantalla de configuración de Mailgun, pegue su **clave Open API de Gladys Plus** en el
   bloque **Webhooks de Gladys Plus**.
2. Deje activado **Registrar los webhooks en Mailgun automáticamente** (necesita la clave de API
   privada), o pulse **Registrar los webhooks de Mailgun**. La integración añade su URL junto a las
   que ya pueda tener; Mailgun acepta 3 URL por evento.
3. En Mailgun, abra **Sending** → **Webhooks**, copie la **HTTP webhook signing key** y péguela en
   **Clave de firma de los webhooks**. Con ella, solo los eventos realmente firmados por Mailgun
   inician sus escenas.

Los disparadores, en **Integraciones** → **Mailgun**:

| Disparador                    | Clave                | Cuándo                                                        |
| ----------------------------- | -------------------- | ------------------------------------------------------------- |
| Se entrega un correo          | `email_delivered`    | El servidor del destinatario aceptó el correo.                |
| Falla un correo               | `email_failed`       | Mailgun no pudo entregarlo (permanente o temporal).           |
| Se abre un correo             | `email_opened`       | El destinatario lo abrió (seguimiento de aperturas activado). |
| Se pulsa un enlace            | `email_clicked`      | Se pulsó un enlace (seguimiento de clics activado).           |
| Correo marcado como spam      | `email_complained`   | El destinatario lo marcó como spam.                           |
| Un destinatario se da de baja | `email_unsubscribed` | El destinatario usó el enlace de baja.                        |

Cada disparador se puede filtrar por **destinatario** y por **etiqueta** (vacío = todos). «Falla
un correo» también se puede filtrar por el **tipo de fallo** (permanente, temporal).

Variables disponibles en las acciones siguientes: `{{triggerEvent.data.recipient}}`,
`{{triggerEvent.data.subject}}`, `{{triggerEvent.data.tag}}`, `{{triggerEvent.data.message_id}}`,
más `severity` y `reason` para un fallo y `url` para un clic.

> Evite una escena «cuando falla un correo, enviar un correo a la misma dirección»: puede entrar en
> bucle. El límite de envío la detiene, pero su cuota de Mailgun lo nota igualmente.

## Widgets del panel

- **Actividad de Mailgun**: correos enviados, entregados, fallidos y abiertos en 24 horas, 7 o
  30 días, un gráfico, el estado del dominio y de los eventos, cuántos correos envió Gladys en la
  última hora frente al límite, y los botones **Correo de prueba** y **Actualizar**. Las
  estadísticas necesitan la clave de API privada.
- **Eventos de Mailgun**: los últimos eventos recibidos (necesita Gladys Plus). Ajustes: cuántos
  mostrar, y todos los eventos o solo los problemas (fallos, spam, bajas).

## Solución de problemas

| Mensaje                                           | Qué hacer                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| «Mailgun rechazó la clave de API»                 | Compruebe la clave. Una clave de envío solo sirve para su dominio.       |
| «Mailgun no conoce este dominio»                  | Compruebe cómo está escrito y la **región** (EE. UU./UE) de la cuenta.   |
| «el dominio … está unverified»                    | Añada los registros DNS que indica Mailgun y verifíquelo.                |
| «Límite de envío alcanzado»                       | Una escena envía demasiado. Corríjala o aumente el límite.               |
| Los eventos nunca llegan                          | Compruebe Gladys Plus y pulse **Registrar los webhooks de Mailgun**.     |
| Eventos rechazados en los registros (`signature`) | La clave de firma no coincide con la de la página _Webhooks_ de Mailgun. |

Los registros de la integración (Gladys → Integraciones → Mailgun → registros) dan más detalles.
Nunca muestran la clave de API y las direcciones se acortan (`a***@ejemplo.es`).

## Privacidad

- La clave de API y la clave de firma se quedan en la configuración de Gladys.
- La integración guarda, en su propia carpeta `/data`, los últimos 20 eventos recibidos
  (destinatario, asunto, fecha) para el widget, y la hora de los correos enviados en las últimas
  24 horas para el límite de envío. Nada más.
