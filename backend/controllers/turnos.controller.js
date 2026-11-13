const turnosService = require('../services/turnos.service');

// Nunca devuelve ni registra consultas, parámetros o mensajes internos de MySQL.
function responderError(res, error) {
    if (error.code === 'TURNO_CANCELADO') {
        return res.status(400).json({ error: 'No se puede modificar un turno que ya fue cancelado' });
    }
    if (['TURNO_SUPERPUESTO', 'EQUIPO_SUPERPUESTO', 'DISPONIBILIDAD_SUPERPUESTA', 'MEDICO_SUPERPUESTO'].includes(error.code)) {
        return res.status(400).json({ error: error.message });
    }
    if (['ER_NO_REFERENCED_ROW_2', 'ER_NO_REFERENCED_ROW'].includes(error.code)) {
        return res.status(400).json({ error: 'Alguno de los datos relacionados no existe' });
    }
    if (['ER_ROW_IS_REFERENCED_2', 'ER_ROW_IS_REFERENCED'].includes(error.code)) {
        return res.status(400).json({ error: 'El turno tiene registros relacionados que impiden la operación' });
    }
    return res.status(500).json({ error: 'Error interno del servidor' });
}

async function obtenerTurnos(req, res) {
    try {
        const idRol = Number(req.usuario.id_rol);
        if (idRol === 2) {
            if (!req.usuario.dni_paciente) {
                return res.status(403).json({ error: 'No tenés permisos para realizar esta acción' });
            }
            return res.status(200).json(await turnosService.obtenerPorPaciente(req.usuario.dni_paciente));
        }
        return res.status(200).json(await turnosService.obtenerTodos());
    } catch (error) {
        return responderError(res, error);
    }
}

async function obtenerTurnoPorId(req, res) {
    try {
        const turno = await turnosService.obtenerPorId(Number(req.params.id));
        if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });

        if (Number(req.usuario.id_rol) === 2) {
            if (!req.usuario.dni_paciente || Number(turno.dni_paciente) !== Number(req.usuario.dni_paciente)) {
                return res.status(403).json({ error: 'No tenés permisos para consultar el turno de otro paciente' });
            }
        }
        return res.status(200).json(turno);
    } catch (error) {
        return responderError(res, error);
    }
}

async function crearTurno(req, res) {
    try {
        if (Number(req.usuario.id_rol) === 2) {
            if (!req.usuario.dni_paciente || Number(req.body.dni_paciente) !== Number(req.usuario.dni_paciente)) {
                return res.status(403).json({ error: 'Como paciente solo podés reservar turnos para tu propio DNI' });
            }
            req.body.estado_turno = 'Reservado';
            req.body.medio_solicitado = req.body.medio_solicitado || 'Web';
        }
        const turno = await turnosService.crear(req.body);
        return res.status(201).json({ mensaje: 'Turno creado correctamente', turno });
    } catch (error) {
        return responderError(res, error);
    }
}

function actualizar(parcial) {
    return async (req, res) => {
        try {
            const turno = await turnosService.actualizar(Number(req.params.id), req.body, parcial);
            if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
            return res.status(200).json({ mensaje: 'Turno actualizado correctamente', turno });
        } catch (error) {
            return responderError(res, error);
        }
    };
}

async function reprogramarTurno(req, res) {
    try {
        const turno = await turnosService.reprogramar(
            Number(req.params.id),
            req.body.fecha_turno,
            req.body.hora_turno
        );
        if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
        return res.status(200).json({ mensaje: 'Turno reprogramado correctamente', turno });
    } catch (error) {
        return responderError(res, error);
    }
}

async function confirmarTurno(req, res) {
    try {
        const matricula = req.usuario.matricula_medico || (req.body && req.body.medico_confirmacion) || 1001;
        const turno = await turnosService.confirmar(Number(req.params.id), matricula);
        if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
        return res.status(200).json({ mensaje: 'Turno confirmado correctamente', turno });
    } catch (error) {
        return responderError(res, error);
    }
}

async function cancelarTurno(req, res) {
    try {
        const idTurno = Number(req.params.id);
        const turnoExistente = await turnosService.obtenerPorId(idTurno);
        if (!turnoExistente) return res.status(404).json({ error: 'Turno no encontrado' });

        if (Number(req.usuario.id_rol) === 2) {
            if (!req.usuario.dni_paciente || Number(turnoExistente.dni_paciente) !== Number(req.usuario.dni_paciente)) {
                return res.status(403).json({ error: 'No tenés permisos para cancelar el turno de otro paciente' });
            }
        }

        const turno = await turnosService.cancelar(idTurno);
        return res.status(200).json({ mensaje: 'Turno cancelado correctamente', turno });
    } catch (error) {
        return responderError(res, error);
    }
}

async function eliminarTurno(req, res) {
    try {
        if (!await turnosService.eliminar(Number(req.params.id))) return res.status(404).json({ error: 'Turno no encontrado' });
        return res.status(200).json({ mensaje: 'Turno eliminado correctamente' });
    } catch (error) {
        return responderError(res, error);
    }
}

module.exports = {
    obtenerTurnos,
    obtenerTurnoPorId,
    crearTurno,
    reemplazarTurno: actualizar(false),
    modificarTurno: actualizar(true),
    reprogramarTurno,
    confirmarTurno,
    cancelarTurno,
    eliminarTurno
};
