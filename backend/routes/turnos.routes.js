const express = require("express");
const verificarToken = require("../middlewares/auth.middleware");
const autorizarRol = require("../middlewares/autorizarRol");
const turnosController = require("../controllers/turnos.controller");
const {
    validarCreacionTurno,
    validarIdTurno,
    validarReemplazoTurno,
    validarModificacionTurno,
    validarReprogramacion
} = require("../validators/turnos.validator");

const router = express.Router();

// Todas las rutas requieren un token JWT válido.
router.use(verificarToken);

// GET /api/turnos (Admin = 1, Paciente = 2, Médico = 3)
router.get("/", autorizarRol(1, 2, 3), turnosController.obtenerTurnos);

// GET /api/turnos/:id (Admin = 1, Paciente = 2, Médico = 3)
router.get("/:id", autorizarRol(1, 2, 3), validarIdTurno, turnosController.obtenerTurnoPorId);

// POST /api/turnos (Admin = 1 y Paciente = 2)
router.post(
    "/",
    autorizarRol(1, 2),
    validarCreacionTurno,
    turnosController.crearTurno
);

// Mejora funcional: Reprogramar turno (Admin = 1 y Médico = 3)
router.patch("/:id/reprogramar", autorizarRol(1, 3), validarIdTurno, validarReprogramacion, turnosController.reprogramarTurno);

// Mejora funcional: Confirmar turno (Admin = 1 y Médico = 3)
router.patch("/:id/confirmar", autorizarRol(1, 3), validarIdTurno, turnosController.confirmarTurno);

// Mejora funcional: Cancelar turno (Admin = 1, Paciente = 2 y Médico = 3)
router.patch("/:id/cancelar", autorizarRol(1, 2, 3), validarIdTurno, turnosController.cancelarTurno);

// Edición general y eliminación exclusivas del Administrador (id_rol = 1)
router.put("/:id", autorizarRol(1), validarIdTurno, validarReemplazoTurno, turnosController.reemplazarTurno);
router.patch("/:id", autorizarRol(1), validarIdTurno, validarModificacionTurno, turnosController.modificarTurno);
router.delete("/:id", autorizarRol(1), validarIdTurno, turnosController.eliminarTurno);

module.exports = router;
