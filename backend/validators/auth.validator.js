function validarRegistro(req, res, next) {
    const datos = req.body;
    if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
        Object.keys(datos).some(campo => !['email', 'password'].includes(campo))) {
        return res.status(400).json({ error: 'Se permiten únicamente email y password' });
    }
    if (typeof datos.email !== 'string') return res.status(400).json({ error: 'Email inválido' });
    const email = datos.email.trim().toLowerCase();
    if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email inválido' });
    }
    // bcrypt limita la entrada a 72 bytes; evita truncar contraseñas Unicode.
    if (typeof datos.password !== 'string' || !datos.password.trim() ||
        [...datos.password].length < 8 || [...datos.password].length > 72 ||
        Buffer.byteLength(datos.password, 'utf8') > 72) {
        return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 72 caracteres y no superar 72 bytes UTF-8' });
    }
    req.body.email = email;
    next();
}

function validarToken(req, res, next) {
    if (typeof req.query.token !== 'string' || !/^[a-f0-9]{64}$/.test(req.query.token)) {
        return res.status(400).json({ error: 'Token inválido, vencido o usado' });
    }
    next();
}

module.exports = { validarRegistro, validarToken };
