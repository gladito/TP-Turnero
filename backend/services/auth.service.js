const pool = require("../config/database");
const bcrypt = require("bcryptjs");
const tokenCuenta = require('./tokenCuenta.service');
const emailService = require('./emailService');

// Busca al usuario por email y comprueba su contraseña.
async function login(email, password) {
    const [usuarios] = await pool.query(
        "SELECT * FROM usuario WHERE email = ?",
        [email.trim().toLowerCase()]
    );

    // El email no está registrado.
    if (usuarios.length === 0) {
        return null;
    }

    const usuario = usuarios[0];

    // Compara la contraseña recibida con el hash almacenado.
    const passwordCorrecta = await bcrypt.compare(
        password,
        usuario.password_hash
    );

    if (!passwordCorrecta) {
        return null;
    }

    return usuario;
}

async function registrar(email, password) {
    const passwordHash = await bcrypt.hash(password, 12);
    const conexion = await pool.getConnection();
    let token;
    try {
        await conexion.beginTransaction();
        // El cliente nunca decide el rol ni el estado de verificación.
        let resultado;
        try {
            [resultado] = await conexion.query(
                'INSERT INTO usuario (email, password_hash, id_rol, email_verificado) VALUES (?, ?, 2, 0)',
                [email, passwordHash]
            );
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') error.code = 'EMAIL_DUPLICADO';
            throw error;
        }
        token = await tokenCuenta.crearVerificacion(conexion, resultado.insertId);
        await conexion.commit();
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }
    // SMTP se ejecuta después del commit, fuera de la transacción.
    const enlace = `http://localhost:3000/api/auth/verificar-email?token=${token}`;
    await emailService.enviarCorreo({
        to: email,
        subject: 'Verificá tu correo',
        text: `Verificá tu correo con este enlace (válido por 24 horas): ${enlace}`,
        html: `<p>Verificá tu correo con este enlace (válido por 24 horas):</p><p><a href="${enlace}">Verificar correo</a></p>`
    });
}

module.exports = { login, registrar };
