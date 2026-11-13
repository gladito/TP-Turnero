const pool = require("../config/database");

// Consulta todos los pacientes guardados en MySQL.
async function obtenerTodos() {
    const [filas] = await pool.query("SELECT * FROM paciente");

    return filas;
}

module.exports = {
    obtenerTodos
};