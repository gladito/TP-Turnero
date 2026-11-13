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

async function verificarEmail(req, res) {
    try {
        await tokenCuenta.verificarEmail(req.query.token);
        return res.status(200).json({ mensaje: 'Correo verificado correctamente' });
    } catch (error) {
        if (error.code === 'TOKEN_INVALIDO') return res.status(400).json({ error: 'Token inválido, vencido o usado' });
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = { login, registro, verificarEmail };
