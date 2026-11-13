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

// Validación nueva (Parcial 2): evita que un mismo paciente tenga dos turnos activos en la misma fecha y horario.
async function verificarSuperposicionPaciente(dniPaciente, fechaTurno, horaTurno, idTurnoExcluir = null) {
    const turnos = await obtenerTodos();
    const fechaBuscada = normalizarFecha(fechaTurno);
    const horaBuscada = normalizarHora(horaTurno);

    const superpuesto = turnos.some((t) => {
        if (idTurnoExcluir !== null && Number(t.id_turno) === Number(idTurnoExcluir)) return false;
        if (String(t.estado_turno || "").trim().toLowerCase() === "cancelado") return false;
        return (
            Number(t.dni_paciente) === Number(dniPaciente) &&
            normalizarFecha(t.fecha_turno) === fechaBuscada &&
            normalizarHora(t.hora_turno) === horaBuscada
        );
    });

    if (superpuesto) {
        const error = new Error("El paciente ya tiene un turno asignado en esa fecha y horario");
        error.code = "TURNO_SUPERPUESTO";
        throw error;
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
        await verificarSuperposicionPaciente(dni_paciente, fecha_turno, hora_turno);
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
    const estadoFinal = Object.hasOwn(datos, "estado_turno") ? datos.estado_turno : (parcial ? turnoActual.estado_turno : null);

    // Verifica superposición si se modifica fecha, hora o paciente en un turno no cancelado.
    const cambiaAgenda = !parcial || Object.hasOwn(datos, "dni_paciente") || Object.hasOwn(datos, "fecha_turno") || Object.hasOwn(datos, "hora_turno");
    if (cambiaAgenda && String(estadoFinal || "").trim().toLowerCase() !== "cancelado") {
        await verificarSuperposicionPaciente(dniFinal, fechaFinal, horaFinal, idTurno);
    }

    const valores = campos.map((campo) => datos[campo] === undefined ? null : datos[campo]);
    await pool.query(
        `UPDATE turno SET ${campos.map((campo) => `${campo} = ?`).join(", ")} WHERE id_turno = ?`,
        [...valores, idTurno]
    );
    return obtenerPorId(idTurno);
}

// Mejora funcional: Reprogramar fecha y hora de un turno existente.
async function reprogramar(idTurno, fechaTurno, horaTurno) {
    const turnoActual = await obtenerPorId(idTurno);
    if (!turnoActual) return null;

    asegurarNoCancelado(turnoActual);
    await verificarSuperposicionPaciente(turnoActual.dni_paciente, fechaTurno, horaTurno, idTurno);

    await pool.query(
        "UPDATE turno SET fecha_turno = ?, hora_turno = ? WHERE id_turno = ?",
        [fechaTurno, horaTurno, idTurno]
    );
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
