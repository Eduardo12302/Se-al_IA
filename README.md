# LSM Aprende · versión 11

Plataforma web educativa para iniciar el aprendizaje de la Lengua de Señas Mexicana (LSM).

## Módulos disponibles
- **Inicio:** acceso a las áreas principales y resumen del avance.
- **Aprender teoría:** seis lecciones guiadas sobre fundamentos de la LSM, cultura y respeto, elementos de una seña, gramática, comunicación accesible y métodos de estudio.
- **Abecedario:** fichas interactivas por letra, con acceso al material visual del alfabeto mexicano de UABCS y una rutina guiada de observación y práctica.
- **Vocabulario:** fichas interactivas y acceso al Glosario Digital de INDISCAPACIDAD CDMX para buscar referencias visuales. Los emojis son ilustrativos y no representan señas.
- **Repaso de memoria:** tarjetas para intentar recordar vocabulario, consultar la referencia y autoevaluar el aprendizaje.
- **Biblioteca visual:** enlaces al Glosario Digital de INDISCAPACIDAD CDMX, alfabeto LSM de UABCS y curso LSM Básico 1 de TecNM.
- **Práctica con cámara:** detección de manos, rostro y postura; comparación orientativa con referencias oficiales aprobadas.
- **Modo docente protegido:** permite registrar, aprobar, sustituir o eliminar referencias mediante contraseña especial. El estudiante solo puede consultar y practicar.
- **Mi progreso:** registra lecciones, letras y palabras estudiadas en el navegador.
- Diseño adaptable a computadora y móvil.

## Cambios de la versión 11
- Se retiraron del menú y de la interfaz las herramientas anteriores de recopilación de muestras y extracción de fotogramas.
- Se conservaron la teoría, el abecedario, el vocabulario, el repaso, la biblioteca visual, la práctica asistida con cámara, el modo docente y el progreso.
- La eliminación de esos módulos no borra videos o archivos CSV que se hayan descargado anteriormente en la computadora.
- La práctica con cámara sigue utilizando referencias guardadas localmente en el navegador. El código y los datos anteriores de los módulos retirados ya no se muestran en esta versión.

## Referencias oficiales y modo docente

### Como estudiante
1. Abre una ficha en **Abecedario** o **Vocabulario** y pulsa **Practicar con cámara**.
2. Activa la cámara y permite el acceso del navegador.
3. Si existe una referencia oficial aprobada, pulsa **Iniciar mi intento**.
4. Si todavía no existe, solicita al responsable docente que la registre.

### Como docente o administrador
1. En **Práctica con cámara**, pulsa **Entrar a modo docente**.
2. Introduce la contraseña especial del responsable.
3. Selecciona la letra o palabra que se va a registrar y activa la cámara.
4. Escribe el nombre o código de quien valida y confirma que la demostración fue revisada.
5. Pulsa **Grabar y aprobar referencia**, realiza la seña y guarda la referencia.
6. Cierra la sesión docente. Los estudiantes podrán practicar contra esa referencia, pero no editarla desde la interfaz.

Para sustituir una referencia, vuelve a entrar al modo docente y graba una nueva. Para eliminarla, usa **Eliminar referencia oficial**.

### Cambiar la contraseña docente
Ejecuta desde la carpeta raíz del proyecto:

```bash
python tools/generar_clave_admin.py
```

El programa pedirá una nueva contraseña dos veces y actualizará `js/admin-auth.js` con un hash PBKDF2-HMAC-SHA256 y una sal aleatoria. No compartas ese archivo ni la contraseña docente.

### Límite de seguridad
Esta versión sigue siendo una aplicación estática que guarda las referencias en el almacenamiento local del navegador. La contraseña bloquea la edición normal desde la interfaz, pero no es una barrera inviolable frente a alguien con acceso técnico al código o al navegador. Para producción se necesita un backend con autenticación real, roles y almacenamiento seguro. El responsable escrito en la ficha es un registro declarado; la aplicación no verifica por sí sola sus credenciales profesionales.

Las referencias antiguas de la v9 se conservan localmente, pero no se consideran oficiales si no tienen el sello de aprobación de la v10. El personal docente debe volver a grabarlas y aprobarlas.

## Cómo ejecutar
La cámara requiere un contexto seguro: `localhost` o HTTPS. No abras `index.html` directamente con doble clic.

### Opción recomendada: VS Code
1. Descomprime el ZIP.
2. Abre la carpeta `LSM_Aprende_v11` en Visual Studio Code.
3. Instala la extensión **Live Server**.
4. Haz clic derecho en `index.html` y selecciona **Open with Live Server**.
5. Entra a **Práctica con cámara**, pulsa **Activar cámara** y acepta el permiso.

También puedes abrir la terminal en la carpeta que contiene `index.html` y ejecutar:

```bash
python -m http.server 8000
```

Después visita `http://localhost:8000`.

## Requisitos
- Navegador actualizado (Chrome, Edge o Firefox reciente).
- Cámara y permiso del navegador para el módulo de práctica.
- Conexión a Internet para descargar MediaPipe y sus modelos.

## Alcance y límites
La cámara detecta puntos de referencia de manos, rostro y cuerpo. La comparación es geométrica y orientativa; **todavía no traduce ni califica lingüísticamente señas de LSM**. Para ello se requiere un conjunto de datos autorizado y validado por personas competentes en LSM, un modelo temporal específico y evaluación con participantes independientes.

Las secuencias compactas de puntos usadas como referencia se guardan en LocalStorage. Eliminar datos del navegador o cambiar de dispositivo puede borrar o dejar inaccesibles las referencias. Usa materiales visuales aprobados por personas sordas usuarias o docentes competentes en LSM y respeta las variantes regionales y contextuales.

## Recursos externos de aprendizaje
- Glosario Digital LSM de INDISCAPACIDAD CDMX: https://lsm.indiscapacidad.cdmx.gob.mx/
- LSM Biblioteca (UABCS): https://biblio.uabcs.mx/recursosedu/lsm/
- Curso LSM Básico 1 (TecNM): https://mooc.tecnm.mx/courses/course-v1%3ATecNM%2BLSMB01-001%2B2026-1/about

Los recursos se abren en una pestaña nueva. Su contenido y disponibilidad dependen de cada institución.

### Finalizar un intento manualmente
Durante una práctica con cámara, pulsa **«Finalizar intento»** cuando hayas terminado. No necesitas esperar al límite automático de fotogramas. La aplicación detiene la captura y compara los fotogramas recogidos hasta ese momento con la referencia oficial. Se necesitan al menos 8 fotogramas válidos para generar el resultado.
# Se-al_IA
