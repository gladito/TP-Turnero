const express = require("express");
const authController = require("../controllers/auth.controller");
const { validarRegistro, validarToken } = require('../validators/auth.validator');

const router = express.Router();

// POST /api/auth/login
router.post("/login", authController.login);
router.post('/registro', validarRegistro, authController.registro);
router.get('/verificar-email', validarToken, authController.verificarEmail);

module.exports = router;
