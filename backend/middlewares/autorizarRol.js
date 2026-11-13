// Recibe los números de los roles que pueden acceder.
function autorizarRol(...rolesPermitidos) {

    return function (req, res, next) {

        // El middleware del token debe ejecutarse primero.
        if (!req.usuario) {
            return res.status(401).json({
                error: "Se requiere autenticación"
            });
        }

        // Obtenemos el rol guardado dentro del token.
        const idRol = Number(req.usuario.id_rol);

        // Comprobamos si el rol está permitido.
        if (!rolesPermitidos.includes(idRol)) {
            return res.status(403).json({
                error: "No tenés permisos para realizar esta acción"
            });
        }

        // El usuario tiene autorización para continuar.
        next();
    };
}

module.exports = autorizarRol;