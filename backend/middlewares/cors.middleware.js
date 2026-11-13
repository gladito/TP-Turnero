// Permite Live Server local sin agregar dependencias.
function permitirFrontend(req, res, next) {
    const origen = req.headers.origin;
    if (origen) {
        res.vary('Origin');
        let permitido = false;
        try {
            const url = new URL(origen);
            permitido = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) &&
                url.origin === origen;
        } catch { /* Un origen malformado no recibe permiso. */ }
        if (!permitido) return res.status(403).json({ error: 'Origen no permitido' });
        res.setHeader('Access-Control-Allow-Origin', origen);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
}
module.exports = permitirFrontend;
