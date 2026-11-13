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

async function registrarPaciente({ dni_paciente, nombre_paciente, apellido_paciente, fec_nac_paciente, email, password }) {
    const dni = Number(dni_paciente);
    const correo = email.trim().toLowerCase();

    const [usuarios] = await pool.execute(
        'SELECT id_usuario FROM usuario WHERE email = ?',
        [correo]
    );
    if (usuarios.length > 0) {
        const err = new Error('Ya existe una cuenta registrada con ese correo');
        err.status = 409;
        throw err;
    }

    const [pacientes] = await pool.execute(
        'SELECT dni_paciente, email_paciente FROM paciente WHERE dni_paciente = ?',
        [dni]
    );
    if (pacientes.length > 0 && pacientes[0].email_paciente && pacientes[0].email_paciente.toLowerCase() !== correo) {
        const err = new Error('El DNI ya está registrado con otro correo. Contactá con la administración.');
        err.status = 409;
        throw err;
    }

    const hash = await bcrypt.hash(password, 10);
    const conexion = await pool.getConnection();
    let token;

    try {
        await conexion.beginTransaction();

        if (pacientes.length === 0) {
            await conexion.execute(
                `INSERT INTO paciente (
                    dni_paciente,
                    nombre_paciente,
                    apellido_paciente,
                    fec_nac_paciente,
                    email_paciente
                ) VALUES (?, ?, ?, ?, ?)`,
                [dni, nombre_paciente.trim(), apellido_paciente.trim(), fec_nac_paciente, correo]
            );
        } else if (!pacientes[0].email_paciente) {
            await conexion.execute(
                'UPDATE paciente SET email_paciente = ? WHERE dni_paciente = ?',
                [correo, dni]
            );
        }

        const [resultado] = await conexion.execute(
            `INSERT INTO usuario (
                email,
                password_hash,
                id_rol,
                dni_paciente,
                email_verificado
            ) VALUES (?, ?, 2, ?, 0)`,
            [correo, hash, dni]
        );

        token = await tokenCuenta.crearVerificacion(conexion, resultado.insertId);
        await conexion.commit();
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }

    const baseFront = process.env.FRONTEND_URL || 'http://localhost/TP-Turnero/frontend';
    const enlace = `${baseFront}/verificar-email.html?token=${token}`;
    await emailService.enviarCorreo({
        to: correo,
        subject: 'Verificá tu correo - Gestión de Turnos',
        text: `Hola ${nombre_paciente.trim()}. Para verificar tu correo, abrí este enlace: ${enlace}. El enlace vence en 30 minutos.`,
        html: `
            <h2>Verificación de correo</h2>
            <p>Hola ${nombre_paciente.trim()},</p>
            <p>Para activar la verificación de tu cuenta, hacé clic en el siguiente enlace:</p>
            <p><a href="${enlace}">Verificar mi correo</a></p>
            <p>El enlace vence en 30 minutos.</p>
            <p>Si no solicitaste esta cuenta, ignorá este mensaje.</p>
        `
    });
}

async function registrarMedico({ matricula_medico, email, password }) {
    const matricula = Number(matricula_medico);
    const correo = email.trim().toLowerCase();

    const [medicos] = await pool.execute(
        'SELECT matricula_medico FROM medico WHERE matricula_medico = ?',
        [matricula]
    );
    if (medicos.length === 0) {
        const err = new Error('La matrícula no existe en el registro de médicos');
        err.status = 404;
        throw err;
    }

    const [usuarios] = await pool.execute(
        'SELECT id_usuario FROM usuario WHERE email = ? OR matricula_medico = ?',
        [correo, matricula]
    );
    if (usuarios.length > 0) {
        const err = new Error('El correo o la matrícula ya tienen una cuenta registrada');
        err.status = 409;
        throw err;
    }

    const hash = await bcrypt.hash(password, 10);
    const conexion = await pool.getConnection();
    let token;

    try {
        await conexion.beginTransaction();

        const [resultado] = await conexion.execute(
            `INSERT INTO usuario (
                email,
                password_hash,
                id_rol,
                matricula_medico,
                email_verificado
            ) VALUES (?, ?, 3, ?, 0)`,
            [correo, hash, matricula]
        );

        token = await tokenCuenta.crearVerificacion(conexion, resultado.insertId);
        await conexion.commit();
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }

    const baseFront = process.env.FRONTEND_URL || 'http://localhost/TP-Turnero/frontend';
    const enlace = `${baseFront}/verificar-email.html?token=${token}`;
    await emailService.enviarCorreo({
        to: correo,
        subject: 'Verificá tu correo - Gestión de Turnos',
        text: `Para verificar tu cuenta de médico, abrí este enlace: ${enlace}. El enlace vence en 30 minutos.`,
        html: `
            <h2>Verificación de correo</h2>
            <p>Para verificar tu cuenta de médico, hacé clic en el siguiente enlace:</p>
            <p><a href="${enlace}">Verificar mi correo</a></p>
            <p>El enlace vence en 30 minutos.</p>
        `
    });
}

async function solicitarRecuperacion(email) {
    const correo = email.trim().toLowerCase();
    const [usuarios] = await pool.execute(
        'SELECT id_usuario, email FROM usuario WHERE email = ?',
        [correo]
    );
    if (usuarios.length === 0) return;

    const conexion = await pool.getConnection();
    let token;
    try {
        await conexion.beginTransaction();
        token = await tokenCuenta.crearVerificacion(conexion, usuarios[0].id_usuario, 30, 'RECUPERACION_PASSWORD');
        await conexion.commit();
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }

    const baseFront = process.env.FRONTEND_URL || 'http://localhost/TP-Turnero/frontend';
    const enlace = `${baseFront}/verificar-email.html?modo=recuperar&token=${token}`;
    await emailService.enviarCorreo({
        to: correo,
        subject: 'Recuperación de contraseña - Gestión de Turnos',
        text: `Para restablecer tu contraseña, abrí este enlace: ${enlace}. El enlace vence en 30 minutos.`,
        html: `
            <h2>Recuperación de contraseña</h2>
            <p>Recibimos una solicitud para restablecer tu contraseña.</p>
            <p><a href="${enlace}">Restablecer mi contraseña</a></p>
            <p>El enlace vence en 30 minutos.</p>
        `
    });
}

async function restablecerPassword(token, nuevaPassword) {
    const hash = await bcrypt.hash(nuevaPassword, 10);
    await tokenCuenta.consumirTokenRecuperacion(token, hash);
}

module.exports = { login, registrar, registrarPaciente, registrarMedico, solicitarRecuperacion, restablecerPassword };
