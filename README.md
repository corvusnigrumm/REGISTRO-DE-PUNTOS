# 🏆 Registro de Puntos — Leonardo & Felipe

Aplicación web moderna y responsive para visualizar en tiempo real el progreso de puntos y recompensas a partir de una plantilla de **Google Sheets**.

---

## 🚀 Características

- **Sincronización en tiempo real**: Lee automáticamente los datos de Google Sheets cada 30 segundos sin necesidad de recargar la página.
- **100% Solo Lectura**: Todas las altas, bajas y modificaciones se hacen en el Google Sheet oficial; la web refleja los cambios de inmediato.
- **Diseño Responsive & Premium**: Estilizado con paleta verde bosque (`#1f5d3d`) y detalles dorados (`#c9a24f`), tipografía Manrope, glassmorphism y modo oscuro.
- **Selector de Persona**: Transición fluida entre Leonardo y Felipe con indicador animado.
- **Anillo de Progreso SVG & Metas**: Visualización del % alcanzado rumbo a la meta de 2000 puntos y recompensas activas.
- **Tarjetas de Estadísticas**:
  - Total acumulado
  - Puntos ganados y perdidos
  - Puntos de hoy
  - Racha de días activos
  - Mejor día histórico
- **Gráficos Interactivos**:
  - Curva de evolución acumulada (últimos 30 días)
  - Puntos diarios por fecha
- **Resumen por Categoría**: Lista visual de categorías con desglose de puntos e iconos temáticos.
- **Historial Completo**: Registro cronológico de actividades con filtros y tags de puntuación (+ / -).
- **Celebración**: Efecto de confeti interactivo al alcanzar el 100% de la meta.

---

## 📊 Estructura del Google Sheet

La aplicación lee directamente de las hojas públicas mediante el endpoint CSV:
- **Leonardo**: `gid=802967046`
- **Felipe**: `gid=1517679666`

Si se modifican las metas o recompensas en la hoja, la web las detecta y actualiza automáticamente.

---

## 🌐 Despliegue en Render (Paso a Paso)

El proyecto incluye el archivo `render.yaml` listo para despliegue como **Static Site** en [Render](https://render.com).

### Opción 1: Despliegue automático vía Blueprint
1. Entra a [dashboard.render.com](https://dashboard.render.com/).
2. Haz clic en **New +** > **Blueprint**.
3. Conecta el repositorio: `https://github.com/corvusnigrumm/REGISTRO-DE-PUNTOS.git`.
4. Render leerá `render.yaml` y desplegará la web automáticamente.

### Opción 2: Despliegue manual como Static Site
1. En Render, haz clic en **New +** > **Static Site**.
2. Selecciona el repositorio `REGISTRO-DE-PUNTOS`.
3. Configuración:
   - **Name**: `registro-de-puntos`
   - **Branch**: `main` (o `master`)
   - **Build Command**: *(dejar vacío)*
   - **Publish Directory**: `.` *(punto)*
4. Haz clic en **Create Static Site**.

---

## 💻 Ejecución Local

Para probarlo localmente en tu computadora:

1. Abre una terminal en la carpeta del proyecto.
2. Inicia un servidor web local sencillo (para evitar restricciones CORS de `file://`):
   ```bash
   # Con Python:
   python -m http.server 8080

   # O con Node.js / npx:
   npx serve .
   ```
3. Abre tu navegador en `http://localhost:8080`.
