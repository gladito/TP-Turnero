const jwt = require("jsonwebtoken");
const authService = require("../services/auth.service");
const tokenCuenta = require('../services/tokenCuenta.service');

// Recibe el email y la contraseña enviados por el cliente.
async function login(req, res) {
    const { email, password } = req.body || {};

    if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
        return res.status(400).json({
            error: "El email y la contraseña son obligatorios"
        });
    }

    try {
        const usuario = await authService.login(email, password);

        if (!usuario) {
            return res.status(401).json({
                error: "Credenciales incorrectas"
            });
        }

        if (Number(usuario.email_verificado) !== 1) {
            return res.status(403).json({ error: 'Debés verificar tu correo antes de iniciar sesión' });
        }

        const datosSesion = {
            id_usuario: usuario.id_usuario,
            email: usuario.email,
            id_rol: Number(usuario.id_rol),
            ...(usuario.dni_paciente ? { dni_paciente: Number(usuario.dni_paciente) } : {}),
            ...(usuario.matricula_medico ? { matricula_medico: Number(usuario.matricula_medico) } : {})
        };

        // El token guarda la identidad, el rol y la vinculación (paciente/médico) del usuario.
        const token = jwt.sign(
            datosSesion,
            process.env.JWT_SECRET,
            {
                expiresIn: "1h"
            }
        );

        res.status(200).json({
            mensaje: "Inicio de sesión exitoso",
            token,
            // Se exponen solamente los datos necesarios para la sesión.
            usuario: datosSesion
        });
    } catch (error) {

        res.status(500).json({
            error: "Error interno del servidor"
        });
    }
}

async function registro(req, res) {
    try {
        await authService.registrar(req.body.email, req.body.password);
        return res.status(201).json({ mensaje: 'Usuario registrado. Revisá el correo para verificar tu cuenta' });
    } catch (error) {
        if (error.code === 'EMAIL_DUPLICADO') return res.status(409).json({ error: 'El email ya está registrado' });
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function registrarPaciente(req, res) {
    try {
        const {
            dni_paciente,
            nombre_paciente,
            apellido_paciente,
            fec_nac_paciente,
            email,
            password
        } = req.body || {};

        if (
            !dni_paciente ||
            typeof nombre_paciente !== 'string' || !nombre_paciente.trim() ||
            typeof apellido_paciente !== 'string' || !apellido_paciente.trim() ||
            typeof fec_nac_paciente !== 'string' || !fec_nac_paciente.trim() ||
            typeof email !== 'string' || !email.trim() ||
            typeof password !== 'string' || !password
        ) {
            return res.status(400).json({
                error: 'Todos los datos obligatorios deben completarse'
            });
        }

        const dni = Number(dni_paciente);
        const correo = email.trim().toLowerCase();

        if (!Number.isSafeInteger(dni) || dni <= 0 || dni > 2147483647) {
            return res.status(400).json({
                error: 'El DNI no es válido'
            });
        }

        if (correo.length > 50 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
            return res.status(400).json({
                error: 'Ingresá un correo válido de hasta 50 caracteres'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: 'La contraseña debe tener al menos 8 caracteres'
            });
        }

        await authService.registrarPaciente({
            dni_paciente: dni,
            nombre_paciente,
            apellido_paciente,
            fec_nac_paciente,
            email: correo,
            password
        });

        return res.status(201).json({
            mensaje: 'Registro realizado. Revisá el correo para verificar tu cuenta.'
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                error: 'El DNI o el correo ya se encuentran registrados'
            });
        }
        return res.status(500).json({
            error: 'No se pudo completar el registro. Revisá el servidor.'
        });
    }
}

async function registrarMedico(req, res) {
    try {
        const { matricula_medico, email, password } = req.body || {};

        if (
            !matricula_medico ||
            typeof email !== 'string' || !email.trim() ||
            typeof password !== 'string' || !password
        ) {
            return res.status(400).json({
                error: 'La matrícula, el correo y la contraseña son obligatorios'
            });
        }

        const matricula = Number(matricula_medico);
        const correo = email.trim().toLowerCase();

        if (!Number.isSafeInteger(matricula) || matricula <= 0 || matricula > 2147483647) {
            return res.status(400).json({
                error: 'La matrícula no es válida'
            });
        }

        if (correo.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
            return res.status(400).json({
                error: 'Ingresá un correo válido'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: 'La contraseña debe tener al menos 8 caracteres'
            });
        }

        await authService.registrarMedico({
            matricula_medico: matricula,
            email: correo,
            password
        });

        return res.status(201).json({
            mensaje: 'Registro realizado. Revisá el correo para verificar tu cuenta.'
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                error: 'El correo o la matrícula ya están registrados'
            });
        }
        return res.status(500).json({
            error: 'No se pudo completar el registro. Revisá el servidor.'
        });
    }
}

async function verificarEmail(req, res) {
    try {
        await tokenCuenta.verificarEmail(req.query.token);
        return res.status(200).json({ mensaje: 'Correo verificado correctamente. Ya podés iniciar sesión.' });
    } catch (error) {
        if (error.code === 'TOKEN_INVALIDO') return res.status(400).json({ error: 'El enlace venció, ya fue utilizado o no es válido' });
        return res.status(500).json({ error: 'No se pudo verificar el correo' });
    }
}

async function recuperarPassword(req, res) {
    try {
        const { email } = req.body || {};
        if (typeof email !== 'string' || !email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ error: 'Ingresá un correo electrónico válido' });
        }
        await authService.solicitarRecuperacion(email);
        return res.status(200).json({
            mensaje: 'Si el correo está registrado, enviamos un enlace para restablecer tu contraseña.'
        });
    } catch (error) {
        return res.status(500).json({ error: 'No se pudo procesar la solicitud de recuperación' });
    }
}

async function restablecerPassword(req, res) {
    try {
        const { token, password } = req.body || {};
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).json({ error: 'El enlace de recuperación no es válido' });
        }
        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
        }
        await authService.restablecerPassword(token, password);
        return res.status(200).json({
            mensaje: 'Contraseña restablecida correctamente. Ya podés iniciar sesión.'
        });
    } catch (error) {
        if (error.code === 'TOKEN_INVALIDO') {
            return res.status(400).json({ error: 'El enlace venció, ya fue utilizado o no es válido' });
        }
        return res.status(500).json({ error: 'No se pudo restablecer la contraseña' });
    }
}

module.exports = { login, registro, registrarPaciente, registrarMedico, verificarEmail, recuperarPassword, restablecerPassword };
