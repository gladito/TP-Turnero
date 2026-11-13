const jwt = require("jsonwebtoken");

// Verifica que la petición tenga un token JWT válido.
function verificarToken(req, res, next) {
    const autorizacion = req.headers.authorization;

    // El encabezado debe tener el formato: Bearer TOKEN
    if (!autorizacion || !autorizacion.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Token no proporcionado"
        });
    }

    const token = autorizacion.split(" ")[1];

    try {
        // Comprueba la firma y la fecha de vencimiento del token.
        const datosUsuario = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Guardamos los datos del usuario para las siguientes funciones.
        req.usuario = datosUsuario;

        next();
    } catch (error) {
        return res.status(401).json({
            error: "Token inválido o vencido"
        });
    }
}

module.exports = verificarToken;