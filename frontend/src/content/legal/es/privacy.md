# Política de privacidad

Esta política explica qué datos personales trata stealthdebug.org, para qué, durante cuánto tiempo y qué derechos tienes. Está redactada conforme al Reglamento General de Protección de Datos (RGPD, Reglamento (UE) 2016/679) y a la Ley Orgánica 3/2018, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD).

En resumen: puedes leer el blog sin cuenta y sin que nadie te rastree. No hay analítica, ni publicidad, ni rastreadores de terceros. Si creas una cuenta, la web guarda tu nombre de usuario, tu email y tus comentarios, y puedes borrarlo todo tú mismo cuando quieras.

## Responsable del tratamiento

| | |
|---|---|
| **Responsable** | Mario García Carbonero |
| **Contacto** | contact@stealthdebug.org |
| **Sitio web** | https://stealthdebug.org |

stealthdebug.org es una web personal sin actividad comercial. No hay delegado de protección de datos; para cualquier cuestión sobre tus datos, escribe a la dirección anterior.

## Qué datos se tratan, para qué y con qué base legal

### 1. Visitar la web

Cada petición a la web pasa por Cloudflare y llega al servidor, que registra una línea con la **dirección IP**, la fecha y hora, la página solicitada, el código de respuesta, el tamaño, la página de origen y el **agente de usuario del navegador**.

- **Finalidad:** mantener la web segura y disponible: detectar ataques y abusos y diagnosticar errores.
- **Base legal:** interés legítimo en la seguridad de la web (art. 6.1.f RGPD, considerando 49).
- **Conservación:** los registros del servidor se borran a los **30 días**, salvo que una entrada concreta haga falta para investigar un incidente de seguridad; en ese caso se conserva solo hasta que termine la investigación.

Para frenar los intentos de adivinar contraseñas, los formularios de acceso y registro cuentan los intentos por dirección IP. Esos contadores solo existen en la memoria del servidor y caducan como mucho en una hora.

### 2. Crear una cuenta

Al registrarte se guardan tu **nombre de usuario**, tu **email**, un **hash de la contraseña** (bcrypt; la contraseña en sí nunca se guarda), tu rol, las fechas de alta y de última modificación de la cuenta y la **fecha en que aceptaste las condiciones de uso**.

- **Finalidad:** permitirte entrar y comentar, y evitar cuentas duplicadas. El email solo sirve para identificar tu cuenta; la web no envía boletines ni publicidad.
- **Base legal:** ejecución de las condiciones de uso que aceptas al registrarte (art. 6.1.b RGPD). Guardar la fecha de aceptación se basa en el interés legítimo en poder acreditarla (art. 6.1.f).
- **Conservación:** hasta que borres tu cuenta, o hasta que se elimine por incumplir las condiciones de uso.

### 3. Comentarios

Los comentarios se guardan con su fecha y la cuenta que los escribió, y se **muestran públicamente** junto a tu **nombre de usuario** (nunca tu email). Las páginas públicas pueden ser indexadas por buscadores y archivadas por terceros, algo que queda fuera del control de esta web.

- **Finalidad:** publicar tus aportaciones a la conversación.
- **Base legal:** ejecución de las condiciones de uso (art. 6.1.b RGPD).
- **Conservación:** hasta que borres el comentario o tu cuenta, o hasta que se elimine por incumplir las condiciones de uso.

### 4. Escribirme o comunicar una vulnerabilidad

Si escribes a contact@stealthdebug.org, trato tu dirección de email y lo que incluyas en el mensaje.

- **Finalidad:** responderte y gestionar tu consulta, solicitud o aviso.
- **Base legal:** interés legítimo en atender los mensajes que recibo (art. 6.1.f RGPD); si se trata del ejercicio de tus derechos, el cumplimiento de una obligación legal (art. 6.1.c).
- **Conservación:** el tiempo necesario para resolver el asunto y, después, solo el necesario para acreditar cómo se atendió una solicitud de derechos o para defenderme frente a reclamaciones.

### 5. Almacenamiento en tu navegador

Consulta la sección [Cookies y almacenamiento local](#cookies-y-almacenamiento-local) más abajo.

La web **no toma decisiones automatizadas** sobre ti ni **elabora perfiles**.

## Quién más trata los datos

Tus datos **no se venden, alquilan ni ceden** a nadie para sus propios fines. Estos proveedores los tratan **por cuenta del responsable**, con contratos de encargo de tratamiento, solo para prestar su servicio:

| Proveedor | Qué hace | Datos | Ubicación |
|---|---|---|---|
| **IONOS SE** | Aloja el servidor (VPS) donde están la web, la base de datos y los registros | Todos los descritos arriba | Servidor en España (UE) |
| **Cloudflare, Inc.** | Proxy de red, cifrado (TLS), caché y protección frente a ataques delante de la web | Dirección IP y datos de la petición de cada visita, y el contenido de las páginas y formularios que pasan por él | Red global; empresa en EE. UU. |
| **Grafana Labs (Grafana Cloud)** | Monitorización del estado del servidor | Solo métricas técnicas (CPU, memoria, disco, totales de red, estado de los contenedores). **Ningún dato de visitantes ni de cuentas** | Alemania (UE) |
| **Proveedor de correo** | Aloja el buzón contact@stealthdebug.org | Los mensajes que envíes | — |

Las autoridades o los tribunales solo pueden recibir datos cuando lo exija la ley.

### Transferencias internacionales

- **Cloudflare** es una empresa estadounidense. Las transferencias están amparadas por el **Marco de Privacidad de Datos UE-EE. UU.**, en el que Cloudflare está certificada (decisión de adecuación de la Comisión Europea de 10 de julio de 2023), y por las **cláusulas contractuales tipo** de su contrato de encargo.
- **Grafana Cloud** guarda las métricas en Alemania (UE). En cualquier caso, no contienen datos personales.

## Cookies y almacenamiento local

La web **no usa cookies de analítica, publicidad ni seguimiento**, y por eso no muestra ningún aviso de cookies. Solo usa lo estrictamente necesario para el servicio que pides, que está exento de consentimiento según el art. 22.2 de la Ley 34/2002 de Servicios de la Sociedad de la Información (LSSI) y la normativa europea de privacidad electrónica:

| Nombre | Tipo | Quién la pone | Para qué | Duración |
|---|---|---|---|---|
| `jwt` | Cookie (HttpOnly, Secure, SameSite) | stealthdebug.org | Mantener tu sesión iniciada después de entrar | 1 hora, o hasta que cierres sesión |
| `__cf_bm`, `cf_clearance` | Cookies | Cloudflare | Distinguir personas de bots cuando Cloudflare detecta tráfico sospechoso; solo se ponen en esos casos | 30 minutos (`__cf_bm`); `cf_clearance` hasta unas horas |
| `lang` | Almacenamiento local | stealthdebug.org | Recordar el idioma que elegiste (inglés/español) | Hasta que lo borres |
| `stealthdebug:draft:*` | Almacenamiento local | stealthdebug.org | Borradores sin guardar del editor de artículos (solo el administrador) | Hasta que se guarde el artículo o se descarte el borrador |

El almacenamiento local nunca sale de tu navegador. Puedes borrar las cookies y el almacenamiento local desde la configuración de tu navegador cuando quieras; la web seguirá funcionando, solo se cerrará tu sesión y el idioma volverá al de tu navegador.

Las fuentes, los scripts y las imágenes se sirven desde el propio stealthdebug.org, así que leer la web no hace peticiones a Google ni a otros terceros.

## Cómo se protegen tus datos

Todo el tráfico va cifrado (HTTPS). Las contraseñas se guardan como hashes bcrypt con sal. La cookie de sesión no es accesible desde scripts. El acceso y el registro tienen límite de intentos. El servidor ejecuta cada servicio en un contenedor aislado y sin privilegios, y el acceso a él está restringido.

**No hay copias de seguridad de cuentas ni de comentarios.** Lo que se borra desaparece de la base de datos al momento. Solo hay copias de los artículos del blog y sus imágenes, que no contienen datos tuyos.

Si alguna vez una brecha de seguridad afectara a tus datos, la notificaré a la Agencia Española de Protección de Datos en un máximo de 72 horas cuando sea obligatorio, y te avisaré directamente si puede suponer un riesgo alto para ti.

## Tus derechos

Puedes, en cualquier momento y de forma gratuita:

- **Acceder** a tus datos y obtener una copia.
- **Rectificarlos**: puedes cambiar tu nombre de usuario y tu email tú mismo en tu [página de cuenta](/dashboard).
- **Suprimirlos**: el botón **borrar cuenta y comentarios** de tu [página de cuenta](/dashboard) elimina al momento tu cuenta y todos los comentarios que hayas escrito. También puedes borrar comentarios sueltos tuyos debajo de cada artículo.
- **Oponerte** a los tratamientos basados en el interés legítimo, como los registros del servidor.
- **Limitar** el tratamiento mientras se resuelve una solicitud o reclamación.
- **Portarlos**: recibir los datos de tu cuenta y tus comentarios en un formato estructurado y legible por máquina (JSON).

Para ejercerlos, escribe a **contact@stealthdebug.org** desde el email de tu cuenta, o indica de qué cuenta se trata. Responderé en el plazo de un mes. Puede que te pida algún dato para confirmar que la cuenta es tuya, y solo eso.

Si crees que tus datos no se han tratado correctamente, puedes reclamar ante la **Agencia Española de Protección de Datos (AEPD)**, C/ Jorge Juan 6, 28001 Madrid, [www.aepd.es](https://www.aepd.es), o ante la autoridad de protección de datos del país de la UE en el que vivas. Agradecería tener antes la oportunidad de solucionarlo, pero no es necesario que me contactes antes de reclamar.

## Edad mínima

Para crear una cuenta tienes que tener **al menos 14 años** (art. 7 LOPDGDD). La web no conserva a sabiendas datos de menores de esa edad; si crees que un menor de 14 años tiene una cuenta, escríbeme y se borrará.

## Cambios en esta política

Si esta política cambia, también cambiará la fecha de arriba. Si un cambio afecta a cómo se usan los datos de las cuentas, se avisará en la web a los usuarios registrados antes de que se aplique.
