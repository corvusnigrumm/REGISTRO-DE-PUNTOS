# 🏆 Registro de Puntos — Leonardo & Felipe

Aplicación web moderna, responsive y con animaciones de alta fidelidad para visualizar en tiempo real el progreso de puntos y recompensas a partir de **Google Sheets**.

---

## ✨ Novedades y Diseño Mejorado

- **Estética Ultra Premium & Animada**:
  - **Fondo vivo con orbes flotantes**: Gradientes orgánicos con desenfoque y movimiento perpetuo.
  - **Banner dorado con shimmer reflectivo**: Animación de luz deslizante y trofeo con rebote 3D.
  - **Anillo de progreso SVG con chispa orbital**: Un punto de luz viaja por el arco indicando el porcentaje exacto completado.
  - **Tarjetas con Tilt 3D interactivo**: Reacción sutil al movimiento del ratón en escritorio.
  - **Contadores numéricos animados**: Efecto count-up suave al cambiar de persona o cargar datos.
  - **Hitos dinámicos (25%, 50%, 75%)**: Se iluminan automáticamente cuando alcanzas cada etapa.
  - **Gráficos interactivos (Chart.js)**: Evolución a 30 días y puntos diarios con esquinas redondeadas y degradados.

---

## ⚡ Solución al Retraso de Actualización de Google Sheets

### ¿Por qué Google Sheets tarda unos minutos por defecto?
Los enlaces generados mediante **"Archivo > Publicar en la web"** pasan por la red de caché mundial de Google (CDN), la cual **guarda en caché las hojas durante 5 a 10 minutos**. Por eso, al editar una celda, Google Sheets no siempre refresca el archivo publicado de forma instantánea.

### 🚀 Cómo activar la Sincronización Instantánea (en 1 segundo):
En la propia aplicación web, haz clic en el botón superior **"Tiempo Real"** (con icono de rayo ⚡):
1. Abre tu Google Sheet en Google Drive.
2. En el botón **Compartir** (arriba a la derecha), asegúrate de que esté configurado como **"Cualquier persona con el enlace puede leer"**.
3. Copia el enlace normal de la barra del navegador (ej: `https://docs.google.com/spreadsheets/d/TU_ID_AQUI/edit`).
4. Pégalo en el modal de la aplicación web y haz clic en **Guardar y conectar**.

¡Listo! Al hacer esto, la web utilizará la API en vivo de Google Sheets (`gviz/tq`), la cual **no tiene caché** y refleja cualquier cambio que hagas en el Google Sheet **en menos de 1 segundo**.

---

## 🔄 Controles de Sincronización en la Web

- **Indicador de estado**: Punto verde luminoso ("Sincronizado").
- **Temporizador en vivo**: Cuenta regresiva cada 15 segundos ("15s", "14s"...).
- **Botón "Actualizar"**: Para forzar una sincronización manual en el momento exacto en que termines de escribir en Google Sheets.
- **Detección de pestaña**: En cuanto vuelvas a la pestaña de la web tras editar en Google Sheets, se sincroniza automáticamente.

---

## 🌐 Despliegue en On Render

El repositorio ya cuenta con `render.yaml` configurado. Para desplegar:
1. Ve a [dashboard.render.com](https://dashboard.render.com/).
2. Haz clic en **New +** > **Static Site**.
3. Selecciona el repositorio `corvusnigrumm/REGISTRO-DE-PUNTOS`.
4. En **Publish directory**, escribe `.` (un punto).
5. Haz clic en **Create Static Site**.
