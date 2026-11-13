const CAMPOS_EDITABLES = Object.freeze([
    'fecha_turno', 'hora_turno', 'medio_solicitado', 'estado_turno',
    'fecha_confirmacion', 'medico_confirmacion', 'dni_paciente',
    'id_practica', 'id_equipo', 'id_disponibilidad'
]);
const OBLIGATORIOS = ['fecha_turno', 'hora_turno', 'dni_paciente', 'id_practica'];
const IDS = ['dni_paciente', 'id_practica', 'medico_confirmacion', 'id_equipo', 'id_disponibilidad'];

function enteroPositivo(valor) {
    return (typeof valor === 'number' || (typeof valor === 'string' && /^\d+$/.test(valor))) &&
        Number.isInteger(Number(valor)) && Number(valor) > 0 && Number(valor) <= 2147483647;
}

function fechaValida(valor) {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const fecha = new Date(`${valor}T00:00:00.000Z`);
    return Number(valor.slice(0, 4)) >= 1000 && !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

// Validación nueva (Parcial 2): evita asignar o reprogramar turnos en fechas anteriores a hoy.
function obtenerFechaHoyLocal() {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

function fechaNoPasada(valor) {
    return fechaValida(valor) && valor >= obtenerFechaHoyLocal();
}

function horaValida(valor) {
    return typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(valor);
}

// Validación de horario de atención del centro: Lun a Vie 08:00 a 20:00, Sáb 08:00 a 14:00, Dom cerrado.
function diaSemanaUtc(fechaStr) {
    return new Date(`${fechaStr}T00:00:00.000Z`).getUTCDay();
}

function horarioCentroValido(horaStr, fechaStr = null) {
    if (!horaValida(horaStr)) return { ok: false, error: 'hora_turno debe tener el formato HH:MM o HH:MM:SS' };
    const partes = horaStr.split(':').map(Number);
    const segundosTotales = partes[0] * 3600 + partes[1] * 60 + (partes[2] || 0);
    const minApertura = 8 * 3600; // 08:00:00
    const maxLv = 20 * 3600;      // 20:00:00
    const maxSab = 14 * 3600;     // 14:00:00

    if (fechaStr && fechaValida(fechaStr)) {
        const dia = diaSemanaUtc(fechaStr);
        if (dia === 0) {
            return { ok: false, error: 'El centro permanece cerrado los domingos' };
        }
        if (dia === 6 && (segundosTotales < minApertura || segundosTotales > maxSab)) {
            return { ok: false, error: 'Los sábados el horario de atención es de 08:00 a 14:00' };
        }
    }

    if (segundosTotales < minApertura || segundosTotales > maxLv) {
        return { ok: false, error: 'El horario de atención de lunes a viernes es de 08:00 a 20:00' };
    }
    return { ok: true };
}

function validarIdTurno(req, res, next) {
    if (!enteroPositivo(req.params.id)) return res.status(400).json({ error: 'El ID debe ser un entero positivo dentro del rango INT' });
    next();
}

// POST y PUT exigen todos los obligatorios; PATCH valida solo los enviados.
function validarDatos(parcial) {
    return (req, res, next) => {
        const datos = req.body;
        const fallo = (error) => res.status(400).json({ error });
        if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return fallo('El body debe ser un objeto JSON');
        const campos = Object.keys(datos);
        if (parcial && campos.length === 0) return fallo('PATCH requiere al menos un campo editable');
        if (campos.some((campo) => !CAMPOS_EDITABLES.includes(campo))) return fallo('El body contiene campos no permitidos');
        if (!parcial && OBLIGATORIOS.some((campo) => !Object.hasOwn(datos, campo))) return fallo('fecha_turno, hora_turno, dni_paciente e id_practica son obligatorios');
        for (const campo of campos) {
            const valor = datos[campo];
            if (valor === null && !OBLIGATORIOS.includes(campo)) continue;
            if (IDS.includes(campo) && !enteroPositivo(valor)) return fallo(`${campo} debe ser un entero positivo dentro del rango INT`);
            if (campo === 'fecha_turno') {
                if (!fechaValida(valor)) return fallo('fecha_turno debe ser una fecha real YYYY-MM-DD');
                if (!fechaNoPasada(valor)) return fallo('No se pueden asignar ni reprogramar turnos en fechas anteriores a la actual');
                if (diaSemanaUtc(valor) === 0) return fallo('El centro permanece cerrado los domingos');
            }
            if (campo === 'hora_turno') {
                const checkHora = horarioCentroValido(valor, typeof datos.fecha_turno === 'string' ? datos.fecha_turno : null);
                if (!checkHora.ok) return fallo(checkHora.error);
            }
            if (campo === 'fecha_confirmacion' && (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(valor) || !fechaValida(valor.slice(0, 10)) || !horaValida(valor.slice(11)))) return fallo('fecha_confirmacion debe ser una fecha real YYYY-MM-DD HH:MM:SS o null');
            const limite = campo === 'medio_solicitado' ? 50 : campo === 'estado_turno' ? 30 : null;
            if (limite && (typeof valor !== 'string' || [...valor].length > limite)) return fallo(`${campo} debe ser texto de hasta ${limite} caracteres o null`);
        }
        next();
    };
}

// Validador específico para la mejora funcional de reprogramación de turnos.
function validarReprogramacion(req, res, next) {
    const datos = req.body;
    const fallo = (error) => res.status(400).json({ error });
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return fallo('El body debe ser un objeto JSON');
    const campos = Object.keys(datos);
    if (campos.some((c) => !['fecha_turno', 'hora_turno'].includes(c))) {
        return fallo('Solo se permite enviar fecha_turno y hora_turno para reprogramar');
    }
    if (!Object.hasOwn(datos, 'fecha_turno') || !Object.hasOwn(datos, 'hora_turno')) {
        return fallo('fecha_turno y hora_turno son obligatorios para reprogramar el turno');
    }
    if (!fechaValida(datos.fecha_turno)) return fallo('fecha_turno debe ser una fecha real YYYY-MM-DD');
    if (!fechaNoPasada(datos.fecha_turno)) return fallo('No se pueden asignar ni reprogramar turnos en fechas anteriores a la actual');
    if (diaSemanaUtc(datos.fecha_turno) === 0) return fallo('El centro permanece cerrado los domingos');
    const checkHora = horarioCentroValido(datos.hora_turno, datos.fecha_turno);
    if (!checkHora.ok) return fallo(checkHora.error);
    next();
}

module.exports = {
    CAMPOS_EDITABLES,
    horarioCentroValido,
    validarIdTurno,
    validarCreacionTurno: validarDatos(false),
    validarReemplazoTurno: validarDatos(false),
    validarModificacionTurno: validarDatos(true),
    validarReprogramacion
};
