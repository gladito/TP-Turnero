const crypto = require('node:crypto');
const pool = require('../config/database');

const calcularHash = token => crypto.createHash('sha256').update(token).digest('hex');

async function crearVerificacion(conexion, idUsuario, minutosValidez = 30, tipo = 'VERIFICACION_EMAIL') {
    const token = crypto.randomBytes(32).toString('hex');
    await conexion.query(
        `UPDATE token_cuenta SET usado = 1
         WHERE id_usuario = ? AND tipo = ? AND usado = 0`,
        [idUsuario, tipo]
    );
    await conexion.query(
        `INSERT INTO token_cuenta (id_usuario, token_hash, tipo, fecha_expiracion, usado)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), 0)`,
        [idUsuario, calcularHash(token), tipo, minutosValidez]
    );
    return token;
}

async function consumirTokenRecuperacion(token, passwordHash) {
    const conexion = await pool.getConnection();
    try {
        await conexion.beginTransaction();
        const [tokens] = await conexion.query(
            `SELECT id_token, id_usuario FROM token_cuenta
             WHERE token_hash = ? AND tipo = 'RECUPERACION_PASSWORD'
             AND usado = 0 AND fecha_expiracion > NOW() FOR UPDATE`,
            [calcularHash(token)]
        );
        if (!tokens.length) {
            const error = new Error('El enlace venció, ya fue utilizado o no es válido');
            error.code = 'TOKEN_INVALIDO';
            throw error;
        }
        await conexion.query(
            'UPDATE usuario SET password_hash = ? WHERE id_usuario = ?',
            [passwordHash, tokens[0].id_usuario]
        );
        await conexion.query(
            'UPDATE token_cuenta SET usado = 1 WHERE id_token = ?',
            [tokens[0].id_token]
        );
        await conexion.commit();
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }
}

async function verificarEmail(token) {
    const conexion = await pool.getConnection();
    try {
        await conexion.beginTransaction();
        const [tokens] = await conexion.query(
            `SELECT id_token, id_usuario FROM token_cuenta
             WHERE token_hash = ? AND tipo = 'VERIFICACION_EMAIL'
             AND usado = 0 AND fecha_expiracion > NOW() FOR UPDATE`,
            [calcularHash(token)]
        );
        if (!tokens.length) {
            const error = new Error('Token inválido, vencido o usado');
            error.code = 'TOKEN_INVALIDO';
            throw error;
        }
        const [resultado] = await conexion.query(
            'UPDATE usuario SET email_verificado = 1 WHERE id_usuario = ?', [tokens[0].id_usuario]
        );
        if (!resultado.affectedRows) throw new Error('Usuario inexistente');
        await conexion.query('UPDATE token_cuenta SET usado = 1 WHERE id_token = ?', [tokens[0].id_token]);
        await conexion.commit();
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }
}

module.exports = { crearVerificacion, verificarEmail, consumirTokenRecuperacion };
