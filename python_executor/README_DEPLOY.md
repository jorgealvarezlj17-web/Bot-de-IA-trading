# Guía de Despliegue Gratis 24/7 en la Nube (Render / Railway / Replit)

## Opción 1: Render.com (Recomendada - 100% Gratis 24/7)

1. Crea una cuenta gratuita en [Render.com](https://render.com).
2. Sube estos archivos (`bot_ejecutor.py`, `requirements.txt`, `Procfile`) a un repositorio en GitHub (o conecta tu cuenta).
3. En Render, haz clic en **New +** -> **Background Worker**.
4. Conecta tu repositorio de GitHub.
5. Selecciona el entorno **Python 3**.
6. En la sección **Environment Variables** (Variables de Entorno), añade:
   - `DERIV_API_TOKEN`: Tu token de Deriv (crea un token de prueba Demo o Real en Deriv.com).
   - `GEMINI_API_KEY`: Tu API Key de Google AI Studio.
   - `SYMBOL`: `R_100` (o el índice que prefieras).
   - `STAKE_AMOUNT`: `1.0` (o el monto por operación).
   - `MAX_DAILY_LOSS`: `20.0`
7. Haz clic en **Create Background Worker**. ¡Render desplegará tu bot y se ejecutará 24/7 sin apagar tu teléfono!

---

## Opción 2: Railway.app

1. Entra a [Railway.app](https://railway.app).
2. Crea un **New Project** -> **Deploy from GitHub repo**.
3. Añade las variables de entorno (`DERIV_API_TOKEN`, `GEMINI_API_KEY`, `SYMBOL`, etc.) en la pestaña **Variables**.
4. ¡Listo! Railway detectará automáticamente el archivo `Procfile` y ejecutará `bot_ejecutor.py`.

---

## Opción 3: Replit.com (Desde el navegador de tu teléfono)

1. Abre Replit en la web de tu teléfono.
2. Crea un **New Repl** de Python.
3. Copia el contenido de `bot_ejecutor.py` en `main.py`.
4. Agrega los paquetes en el gestor de paquetes (`websocket-client`, `requests`, `google-genai`).
5. Configura los **Secrets** de Replit con `DERIV_API_TOKEN` y `GEMINI_API_KEY`.
6. Presiona **Run**.

---

## ¿Cómo controlar todo desde el Móvil usando Google AI Studio?

- Accede a [Google AI Studio](https://aistudio.google.com) desde el navegador Google Chrome o Safari de tu teléfono móvil.
- Edita las **System Instructions** o chatea con el modelo en cualquier momento para modificar reglas de lotaje, patrones de entrada, indicadores o para pausar el bot.
