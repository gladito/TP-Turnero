const express = require("express");
const authController = require("../controllers/auth.controller");
const { validarRegistro, validarToken } = require('../validators/auth.validator');

const router = express.Router();

// POST /api/auth/login
router.post("/login", authController.login);
router.post('/registro', validarRegistro, authController.registro);
router.post('/registro/paciente', authController.registrarPaciente);
router.post('/registro/medico', authController.registrarMedico);
router.get('/verificar-email', validarToken, authController.verificarEmail);
router.post('/recuperar-password', authController.recuperarPassword);
router.post('/restablecer-password', authController.restablecerPassword);

module.exports = router;
