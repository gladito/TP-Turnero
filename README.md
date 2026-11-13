# Gestión de turnos

Backend Node.js, Express (CommonJS) y MySQL/MariaDB con mysql2/promise. Se conserva la organización de routes, controllers, services, validators y middlewares. Requiere Node.js 18 o superior para las pruebas.

Desde `backend` en PowerShell:

```powershell
npm.cmd start
# Desarrollo con reinicio automático:
npm.cmd run dev
# Pruebas sin conexión a MySQL:
npm.cmd test
```

La conexión se configura en `backend/config/database.js` con las variables existentes de `backend/.env`: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET y PORT (3000 por defecto). No publicar este archivo. No volver a importar el dump SQL sobre una base existente: contiene instrucciones que eliminan tablas. El dump no incluye la tabla usuario utilizada por la autenticación; se necesita la base existente con usuarios y hashes válidos.

## Autenticación

`POST http://localhost:3000/api/auth/login`, Content-Type: application/json:

```json
{ "email": "admin@ejemplo.com", "password": "TU_CLAVE" }
```

Usar credenciales existentes. La respuesta 200 contiene `mensaje` y `token` (vigencia: una hora). En Thunder Client elegir Auth → Bearer y pegar el token localmente. Todos los endpoints de turnos exigen JWT válido y rol ADMIN (`id_rol = 1`). Nunca compartir tokens.

## Endpoints

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | /api/turnos | 200, lista de turnos |
| GET | /api/turnos/:id | 200, turno |
| POST | /api/turnos | 201, mensaje y turno creado |
| PUT | /api/turnos/:id | 200, mensaje y turno reemplazado |
| PATCH | /api/turnos/:id | 200, mensaje y turno actualizado |
| DELETE | /api/turnos/:id | 200, mensaje de eliminación |

Los IDs deben ser enteros positivos hasta 2147483647; se aceptan números y cadenas decimales. Un turno inexistente devuelve 404. DELETE comprueba su existencia y respeta las claves foráneas, sin borrar registros relacionados automáticamente.

## Campos del body

| Campo | Regla |
| --- | --- |
| fecha_turno | Obligatorio, fecha real YYYY-MM-DD, años 1000–9999 |
| hora_turno | Obligatorio, HH:MM o HH:MM:SS, 00:00–23:59:59 |
| dni_paciente | Obligatorio, entero positivo, paciente existente |
| id_practica | Obligatorio, entero positivo, práctica existente |
| medio_solicitado | Texto hasta 50 caracteres o null |
| estado_turno | Texto hasta 30 caracteres o null |
| fecha_confirmacion | Fecha real YYYY-MM-DD HH:MM:SS o null |
| medico_confirmacion | Entero positivo o null; el esquema actual no declara FK para este campo |
| id_equipo | Entero positivo de equipo existente o null |
| id_disponibilidad | Entero positivo de disponibilidad existente o null |

`id_turno` lo genera la base y no es editable. Se rechazan campos desconocidos, arrays y cuerpos que no sean objetos JSON. Los campos obligatorios no admiten null.

POST conserva `estado_turno = "Pendiente"` si se omite y deja los demás opcionales en null. PUT exige los cuatro obligatorios y reemplaza todos los editables: opcionales omitidos pasan a null. PATCH exige al menos un campo permitido y conserva los no enviados; null limpia los opcionales. Las columnas del UPDATE se seleccionan de una lista blanca fija y los valores se parametrizan con `?`.

Ejemplo POST o PUT (comprobar primero las referencias en la base local):

```json
{
  "fecha_turno": "2026-10-20",
  "hora_turno": "09:30",
  "dni_paciente": 30100101,
  "id_practica": 1,
  "medio_solicitado": "Web",
  "estado_turno": "Pendiente",
  "fecha_confirmacion": null,
  "medico_confirmacion": null,
  "id_equipo": null,
  "id_disponibilidad": null
}
```

Ejemplo PATCH:

```json
{ "estado_turno": "Confirmado", "fecha_confirmacion": "2026-10-16 10:30:00" }
```

Errores JSON con propiedad `error`: 400 para datos inválidos, JSON malformado, referencias inexistentes o registros relacionados que impiden eliminar; 401 para token ausente, inválido o vencido; 403 para rol sin permiso; 404 para turno o ruta inexistente; 500 con mensaje genérico para errores internos. No se devuelven consultas SQL ni detalles privados.

## Guía manual para Thunder Client

1. Iniciar el servidor solo si el puerto 3000 está libre. Si ya está ejecutándose, reiniciarlo de manera controlada para cargar estos cambios.
2. Ejecutar login con un ADMIN existente y configurar Bearer. Probar GET /api/turnos y GET /api/turnos/31 (200 si existe). No eliminar el turno 31.
3. Quitar Bearer y enviar uno inválido: 401. Usar un token válido de otro rol: 403.
4. Probar GET /api/turnos/abc y /0: 400. Consultar un ID confirmado como inexistente: 404.
5. Para pruebas de escritura, usar exclusivamente una base de pruebas y un turno descartable creado allí con POST (201). Guardar su ID y comprobarlo con GET.
6. Sobre ese turno descartable, ejecutar PUT con el ejemplo completo (200), luego omitir opcionales y comprobar que quedan null. Omitir un obligatorio debe dar 400.
7. Ejecutar PATCH con un solo campo (200) y verificar que los demás se conservan. Probar {}, campos desconocidos, fechas imposibles, hora 25:00, IDs negativos, textos de 51/31 caracteres y null en obligatorios: 400.
8. En la base de pruebas, usar una referencia inexistente confirmada en POST/PUT/PATCH: 400. Verificar DELETE bloqueado por relaciones: 400.
9. Solo en la base de pruebas, DELETE /api/turnos/ID_DESCARTABLE debe dar 200; repetirlo y consultar el mismo ID: 404. No ejecutar DELETE contra registros reales ni contra el turno 31.

Las pruebas automatizadas usan HTTP en un puerto efímero y un pool simulado en memoria. No validan conectividad, credenciales ni restricciones del servidor MySQL real y no cambian sus datos.

## Frontend con Live Server

El frontend usa HTML, CSS y JavaScript sin frameworks. Abrir `frontend/index.html` con **Open with Live Server** en VS Code (por ejemplo, http://127.0.0.1:5500/frontend/index.html si se abre la raíz del proyecto). No abrir con file://. Si Live Server publica directamente frontend, la dirección será http://127.0.0.1:5500/index.html.

1. En otra terminal ejecutar `cd backend` y `npm.cmd start`, o `npm.cmd run dev`. MySQL debe estar disponible con la configuración existente. Si el puerto 3000 ya está ocupado por el proyecto, reiniciar ese servidor para cargar los cambios, sin iniciar otro.
2. Ingresar con un ADMIN existente. El login devuelve `mensaje`, `token` y `usuario` (solo id_usuario, email e id_rol). Nunca devuelve password_hash.
3. El navegador guarda `token` y `usuario` en sessionStorage y abre pages/dashboard.html. El dashboard consulta GET /api/turnos con Authorization: Bearer y muestra los campos reales. El botón Actualizar vuelve a consultar.
4. Cerrar sesión elimina ambas claves y vuelve al login. Entrar directamente al dashboard sin sesión también vuelve al login. Un 401 durante la consulta limpia la sesión; un 403 muestra falta de permisos. Se muestran errores de red y estados de carga/listado vacío.

CORS permite orígenes HTTP de localhost y 127.0.0.1 con cualquier puerto local, para Live Server; responde OPTIONS antes de verificar JWT y permite Content-Type y Authorization. Otros orígenes reciben 403. Las llamadas se centralizan en `frontend/js/api.js`, cuya URL base es http://localhost:3000/api. El dashboard implementa la consulta solicitada; las operaciones de escritura del CRUD están disponibles en la API para Thunder Client.

Pruebas de navegador pendientes: login correcto e incorrecto, carga de turnos, Actualizar, acceso directo sin token, token inválido/vencido, cierre de sesión y botón Atrás, error con backend detenido y vista móvil. En Thunder Client comprobar además OPTIONS /api/turnos con Origin: http://127.0.0.1:5500 y Access-Control-Request-Method: PATCH: devuelve 200 y cabeceras CORS.

Se revisó el archivo `Trabajo Práctico .docx` de la carpeta superior. No contiene información de paginación guardada para ubicar con certeza la página 25. El documento también describe reglas de agenda (solapamientos, compatibilidad de prácticas/equipos y disponibilidad médica) que exceden el CRUD y login aquí implementados; no se consideran verificadas ni implementadas por estas pruebas.
