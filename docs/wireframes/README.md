# Wireframes

Las tres pantallas clave de Cupo, como HTML estático.

| Archivo | Pantalla | Quién la usa | Tamaño |
| --- | --- | --- | --- |
| `01-configuracion-y-marca.html` | Configuración de disponibilidad y marca | Negocio | 1280 x 1240 |
| `02-pagina-publica-reserva.html` | Página pública de reserva | Cliente final | 390 x 844 |
| `03-dashboard-agenda.html` | Dashboard de agenda | Negocio | 1280 x 900 |

Esto es especificación visual, no código de producción. Sirve para entender la estructura, la jerarquía y qué controles lleva cada pantalla. No copies el markup tal cual a componentes de React.

Dos detalles: los archivos referencian un `support.js` que no está incluido, así que si los abres directo en el navegador la consola marcará un error que no afecta el layout. Y el color de acento aparece como el marcador `{{accent}}`; en la aplicación real ese valor sale del campo `color_acento` de la tabla `negocio` y se inyecta como variable CSS.
