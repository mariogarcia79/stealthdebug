# Política de seguridad

¿Has encontrado una vulnerabilidad en stealthdebug.org? Gracias por tomarte la molestia de comunicarla. Es un proyecto personal, así que no hay programa de recompensas, pero cada aviso válido se corrige y, si quieres, se te reconoce.

## Cómo comunicarla

Escribe a **contact@stealthdebug.org** con el asunto **"Security: …"**, en español o en inglés. Incluye, por favor:

- Qué es la vulnerabilidad y dónde está (URL, endpoint, parámetro).
- Pasos para reproducirla o una prueba de concepto.
- El impacto que crees que tiene.
- Si quieres que se te reconozca y cómo.

Para enviar el aviso cifrado, usa mi clave OpenPGP: [/.well-known/pgp-key.txt](/.well-known/pgp-key.txt), huella `0D5B 0E0A 0B6D BBB2 E4CE  0C3C 6B2C 97DB 7554 E2DD`. Comprueba la huella antes de usarla.

Qué puedes esperar:

- Un acuse de recibo en un plazo de **7 días**.
- Una valoración y, si el problema es válido, una corrección prevista en **30 días**, con novedades a medida que avance.
- Divulgación coordinada: espera a que esté corregido, o a que pasen **90 días** desde tu aviso, antes de publicar los detalles. Después, puedes escribir sobre ello sin problema.

La misma información está disponible en formato legible por máquina en [/.well-known/security.txt](/.well-known/security.txt).

## Alcance

**Incluido**

- La web y la API de **stealthdebug.org** (`/`, `/api/…`).
- El código fuente de [github.com/mariogarcia79/stealthdebug](https://github.com/mariogarcia79/stealthdebug), incluida la configuración de despliegue.

**Excluido**

- La infraestructura de Cloudflare, IONOS, GitHub, Grafana u otros proveedores. Esos problemas se comunican a ellos.
- Denegaciones de servicio, pruebas de carga o ataques volumétricos.
- Ingeniería social, phishing y ataques físicos.
- Resultados de escáneres automáticos sin un impacto demostrado, como cabeceras ausentes sin consecuencia explotable, banners de versión o self-XSS.
- Fuerza bruta contra el acceso, el registro o SSH.

## Normas para las pruebas

Para proteger la web y a sus usuarios:

- Usa **solo tus propias cuentas de prueba**. No accedas a datos de otros usuarios, ni los modifiques o borres; si llegas a alguno por accidente, detente, no guardes copia y menciónalo en tu aviso.
- No publiques comentarios que puedan perjudicar o engañar a otros visitantes. Borra tu contenido de prueba al terminar.
- Mantén las peticiones automáticas a un ritmo bajo (unas pocas por segundo como máximo).
- No explotes un fallo más allá de lo necesario para demostrar que existe.

## Puerto seguro

Si actúas de buena fe y sigues esta política, consideraré tu investigación autorizada, no emprenderé acciones legales contra ti ni te denunciaré por ella, y colaboraré contigo para entender y corregir el problema. Si un tercero emprende acciones legales por una investigación hecha conforme a esta política, haré saber que estaba autorizada.

## Agradecimientos

Aquí aparecen, con su permiso, quienes han comunicado problemas válidos.

*Todavía no hay avisos.*
