const pool = require("../config/database");
const { CAMPOS_EDITABLES } = require("../validators/turnos.validator");

function normalizarFecha(valor) {
    if (!valor) return "";
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    return String(valor).slice(0, 10);
}

function normalizarHora(valor) {
    if (!valor) return "";
    return String(valor).trim().slice(0, 5);
}

function fechaHoraActualMysql() {
    const ahora = new Date();
    const anio = ahora.getFullYear();
    const mes = String(ahora.getMonth() + 1).padStart(2, "0");
    const dia = String(ahora.getDate()).padStart(2, "0");
    const horas = String(ahora.getHours()).padStart(2, "0");
    const minutos = String(ahora.getMinutes()).padStart(2, "0");
    const segundos = String(ahora.getSeconds()).padStart(2, "0");
    return `${anio}-${mes}-${dia} ${horas}:${minutos}:${segundos}`;
}

// Validación nueva (Parcial 2): impide modificar, confirmar o reprogramar un turno que ya fue cancelado.
function asegurarNoCancelado(turno) {
    if (String(turno.estado_turno || "").trim().toLowerCase() === "cancelado") {
        const error = new Error("No se puede modificar un turno que ya fue cancelado");
        error.code = "TURNO_CANCELADO";
        throw error;
    }
}

// Validación (Parcial 2 + TP): evita que paciente, equipo, disponibilidad o médico tengan dos turnos activos en la misma fecha y horario.
async function verificarSuperposicionAgenda(datosAgenda, idTurnoExcluir = null) {
    const {
        dni_paciente: dniPaciente,
        fecha_turno: fechaTurno,
        hora_turno: horaTurno,
        id_equipo: idEquipo = null,
        id_disponibilidad: idDisponibilidad = null,
        medico_confirmacion: medicoConfirmacion = null
    } = datosAgenda;

    const turnos = await obtenerTodos();
    const fechaBuscada = normalizarFecha(fechaTurno);
    const horaBuscada = normalizarHora(horaTurno);

    for (const t of turnos) {
        if (idTurnoExcluir !== null && Number(t.id_turno) === Number(idTurnoExcluir)) continue;
        if (String(t.estado_turno || "").trim().toLowerCase() === "cancelado") continue;
        if (normalizarFecha(t.fecha_turno) !== fechaBuscada || normalizarHora(t.hora_turno) !== horaBuscada) continue;

        if (dniPaciente !== null && dniPaciente !== undefined && Number(t.dni_paciente) === Number(dniPaciente)) {
            const error = new Error("El paciente ya tiene un turno asignado en esa fecha y horario");
            error.code = "TURNO_SUPERPUESTO";
            throw error;
        }
        if (idEquipo !== null && idEquipo !== undefined && t.id_equipo !== null && Number(t.id_equipo) === Number(idEquipo)) {
            const error = new Error("El equipo ya tiene otro turno asignado en esa fecha y horario");
            error.code = "EQUIPO_SUPERPUESTO";
            throw error;
        }
        if (idDisponibilidad !== null && idDisponibilidad !== undefined && t.id_disponibilidad !== null && Number(t.id_disponibilidad) === Number(idDisponibilidad)) {
            const error = new Error("El médico/disponibilidad ya tiene otro turno asignado en esa fecha y horario");
            error.code = "DISPONIBILIDAD_SUPERPUESTA";
            throw error;
        }
        if (medicoConfirmacion !== null && medicoConfirmacion !== undefined && t.medico_confirmacion !== null && Number(t.medico_confirmacion) === Number(medicoConfirmacion)) {
            const error = new Error("El médico ya tiene otro turno asignado en esa fecha y horario");
            error.code = "MEDICO_SUPERPUESTO";
            throw error;
        }
    }
}

// Obtiene todos los turnos.
async function obtenerTodos() {
    const [turnos] = await pool.query(`
        SELECT *
        FROM turno
        ORDER BY fecha_turno, hora_turno
    `);

    return turnos;
}

// Obtiene únicamente los turnos pertenecientes a un paciente según su DNI.
async function obtenerPorPaciente(dniPaciente) {
    const turnos = await obtenerTodos();
    return turnos.filter((t) => Number(t.dni_paciente) === Number(dniPaciente));
}

// Busca un turno por su identificador.
async function obtenerPorId(idTurno) {
    const [turnos] = await pool.query(
        "SELECT * FROM turno WHERE id_turno = ?",
        [idTurno]
    );

    return turnos[0] || null;
}

// Crea un nuevo turno validando que el paciente no tenga otro turno superpuesto.
async function crear(datos) {
    const {
        fecha_turno,
        hora_turno,
        medio_solicitado = null,
        estado_turno = "Pendiente",
        fecha_confirmacion = null,
        medico_confirmacion = null,
        dni_paciente,
        id_practica,
        id_equipo = null,
        id_disponibilidad = null
    } = datos;

    if (String(estado_turno || "").trim().toLowerCase() !== "cancelado") {
        await verificarSuperposicionAgenda({
            dni_paciente,
            fecha_turno,
            hora_turno,
            id_equipo,
            id_disponibilidad,
            medico_confirmacion
        });
    }

    const [resultado] = await pool.query(`
        INSERT INTO turno (
            fecha_turno,
            hora_turno,
            medio_solicitado,
            estado_turno,
            fecha_confirmacion,
            medico_confirmacion,
            dni_paciente,
            id_practica,
            id_equipo,
            id_disponibilidad
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        fecha_turno,
        hora_turno,
        medio_solicitado,
        estado_turno,
        fecha_confirmacion,
        medico_confirmacion,
        dni_paciente,
        id_practica,
        id_equipo,
        id_disponibilidad
    ]);

    return obtenerPorId(resultado.insertId);
}

// Los nombres SQL provienen solamente de la lista blanca del servidor.
async function actualizar(idTurno, datos, parcial = false) {
    const turnoActual = await obtenerPorId(idTurno);
    if (!turnoActual) return null;

    asegurarNoCancelado(turnoActual);

    const campos = parcial ? CAMPOS_EDITABLES.filter((campo) => Object.hasOwn(datos, campo)) : CAMPOS_EDITABLES;
    if (!campos.length) throw new Error("Actualización sin campos");

    const dniFinal = Object.hasOwn(datos, "dni_paciente") ? datos.dni_paciente : turnoActual.dni_paciente;
    const fechaFinal = Object.hasOwn(datos, "fecha_turno") ? datos.fecha_turno : turnoActual.fecha_turno;
    const horaFinal = Object.hasOwn(datos, "hora_turno") ? datos.hora_turno : turnoActual.hora_turno;
    const equipoFinal = Object.hasOwn(datos, "id_equipo") ? datos.id_equipo : (parcial ? turnoActual.id_equipo : null);
    const dispFinal = Object.hasOwn(datos, "id_disponibilidad") ? datos.id_disponibilidad : (parcial ? turnoActual.id_disponibilidad : null);
    const medicoFinal = Object.hasOwn(datos, "medico_confirmacion") ? datos.medico_confirmacion : (parcial ? turnoActual.medico_confirmacion : null);
    const estadoFinal = Object.hasOwn(datos, "estado_turno") ? datos.estado_turno : (parcial ? turnoActual.estado_turno : null);

    // Verifica superposición si se modifica fecha, hora, paciente, equipo o médico en un turno no cancelado.
    const cambiaAgenda = !parcial || Object.hasOwn(datos, "dni_paciente") || Object.hasOwn(datos, "fecha_turno") || Object.hasOwn(datos, "hora_turno") || Object.hasOwn(datos, "id_equipo") || Object.hasOwn(datos, "id_disponibilidad") || Object.hasOwn(datos, "medico_confirmacion");
    if (cambiaAgenda && String(estadoFinal || "").trim().toLowerCase() !== "cancelado") {
        await verificarSuperposicionAgenda({
            dni_paciente: dniFinal,
            fecha_turno: fechaFinal,
            hora_turno: horaFinal,
            id_equipo: equipoFinal,
            id_disponibilidad: dispFinal,
            medico_confirmacion: medicoFinal
        }, idTurno);
    }

    const valores = campos.map((campo) => datos[campo] === undefined ? null : datos[campo]);
    await pool.query(
        `UPDATE turno SET ${campos.map((campo) => `${campo} = ?`).join(", ")} WHERE id_turno = ?`,
        [...valores, idTurno]
    );
    return obtenerPorId(idTurno);
}

// Mejora funcional: Reprogramar fecha y hora de un turno existente.
// Regla de negocio del TP: si el turno estaba Confirmado y se modifica su fecha u hora, vuelve al estado Reservado.
async function reprogramar(idTurno, fechaTurno, horaTurno) {
    const turnoActual = await obtenerPorId(idTurno);
    if (!turnoActual) return null;

    asegurarNoCancelado(turnoActual);
    await verificarSuperposicionAgenda({
        dni_paciente: turnoActual.dni_paciente,
        fecha_turno: fechaTurno,
        hora_turno: horaTurno,
        id_equipo: turnoActual.id_equipo,
        id_disponibilidad: turnoActual.id_disponibilidad,
        medico_confirmacion: turnoActual.medico_confirmacion
    }, idTurno);

    const eraConfirmado = String(turnoActual.estado_turno || "").trim().toLowerCase() === "confirmado";
    if (eraConfirmado) {
        await pool.query(
            "UPDATE turno SET fecha_turno = ?, hora_turno = ?, estado_turno = ?, fecha_confirmacion = ?, medico_confirmacion = ? WHERE id_turno = ?",
            [fechaTurno, horaTurno, "Reservado", null, null, idTurno]
        );
    } else {
        await pool.query(
            "UPDATE turno SET fecha_turno = ?, hora_turno = ? WHERE id_turno = ?",
            [fechaTurno, horaTurno, idTurno]
        );
    }
    return obtenerPorId(idTurno);
}

// Mejora funcional: Confirmar un turno reservado o pendiente.
async function confirmar(idTurno, matriculaMedico = 1001) {
    const turnoActual = await obtenerPorId(idTurno);
    if (!turnoActual) return null;

    asegurarNoCancelado(turnoActual);

    const fechaConfirmacion = fechaHoraActualMysql();
    const medico = Number.isInteger(Number(matriculaMedico)) && Number(matriculaMedico) > 0 ? Number(matriculaMedico) : 1001;

    await pool.query(
        "UPDATE turno SET estado_turno = ?, fecha_confirmacion = ?, medico_confirmacion = ? WHERE id_turno = ?",
        ["Confirmado", fechaConfirmacion, medico, idTurno]
    );
    return obtenerPorId(idTurno);
}

// Mejora funcional: Cancelar un turno activo.
async function cancelar(idTurno) {
    const turnoActual = await obtenerPorId(idTurno);
    if (!turnoActual) return null;

    asegurarNoCancelado(turnoActual);

    await pool.query(
        "UPDATE turno SET estado_turno = ? WHERE id_turno = ?",
        ["Cancelado", idTurno]
    );
    return obtenerPorId(idTurno);
}

// Verifica la existencia antes de eliminar.
async function eliminar(idTurno) {
    if (!await obtenerPorId(idTurno)) return false;
    const [resultado] = await pool.query("DELETE FROM turno WHERE id_turno = ?", [idTurno]);
    return resultado.affectedRows > 0;
}

module.exports = {
    obtenerTodos,
    obtenerPorPaciente,
    obtenerPorId,
    crear,
    actualizar,
    reprogramar,
    confirmar,
    cancelar,
    eliminar
};
