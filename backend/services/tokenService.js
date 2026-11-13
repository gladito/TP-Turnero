const crypto = require('node:crypto');
const pool = require('../config/database');

const TIPOS_PERMITIDOS = ['VERIFICACION_EMAIL', 'RECUPERACION_PASSWORD'];

function validarTipo(tipo) {
    if (!TIPOS_PERMITIDOS.includes(tipo)) {
        throw new Error('Tipo de token no permitido');
    }
}

function validarId(id) {
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
        throw new Error('El identificador debe ser un entero positivo dentro del rango INT');
    }
}

function calcularHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

async function crearTokenCuenta(idUsuario, tipo, minutosValidez = 30) {
    validarId(idUsuario);
    validarTipo(tipo);
    if (!Number.isInteger(minutosValidez) || minutosValidez <= 0 || minutosValidez > 2147483647) {
        throw new Error('La validez debe ser un número entero positivo de minutos dentro del rango INT');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = calcularHash(token);
    const conexion = await pool.getConnection();

    try {
        await conexion.beginTransaction();
        // Serializa la creación de tokens para el mismo usuario.
        const [usuarios] = await conexion.query(
            'SELECT id_usuario FROM usuario WHERE id_usuario = ? FOR UPDATE',
            [idUsuario]
        );
        if (!usuarios.length) throw new Error('Usuario no encontrado');

        // La invalidación y la creación se confirman juntas.
        await conexion.query(
            'UPDATE token_cuenta SET usado = 1 WHERE id_usuario = ? AND tipo = ? AND usado = 0',
            [idUsuario, tipo]
        );
        await conexion.query(
            `INSERT INTO token_cuenta (id_usuario, token_hash, tipo, fecha_expiracion, usado)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), 0)`,
            [idUsuario, tokenHash, tipo, minutosValidez]
        );
        await conexion.commit();
        // El original solo se devuelve para enviarlo por correo, nunca se guarda.
        return token;
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }
}

async function buscarTokenValido(token, tipo) {
    validarTipo(tipo);
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;

    const [tokens] = await pool.query(
        `SELECT id_token, id_usuario, tipo, fecha_expiracion, usado, fecha_creacion
         FROM token_cuenta
         WHERE token_hash = ? AND tipo = ? AND usado = 0 AND fecha_expiracion > NOW()`,
        [calcularHash(token), tipo]
    );
    return tokens[0] || null;
}

async function marcarTokenUsado(idToken) {
    validarId(idToken);
    await pool.query('UPDATE token_cuenta SET usado = 1 WHERE id_token = ?', [idToken]);
}

module.exports = { crearTokenCuenta, buscarTokenValido, marcarTokenUsado };
