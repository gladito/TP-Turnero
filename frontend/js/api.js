/* Todas las solicitudes al backend pasan por este módulo. */
window.API = (() => {
    const BASE_URL = 'http://localhost:3000/api';
    async function solicitar(ruta, { method = 'GET', body, protegida = true } = {}) {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (protegida) {
            const token = sessionStorage.getItem('token');
            if (!token) throw Object.assign(new Error('Iniciá sesión para continuar.'), { status: 401 });
            headers.Authorization = `Bearer ${token}`;
        }
        let respuesta;
        try {
            respuesta = await fetch(`${BASE_URL}${ruta}`, {
                method, headers, body: body === undefined ? undefined : JSON.stringify(body)
            });
        } catch {
            throw new Error('No se pudo conectar con el servidor. Verificá la conexión e intentá nuevamente.');
        }
        const datos = await respuesta.json().catch(() => null);
        if (!respuesta.ok) {
            throw Object.assign(new Error(datos?.error || `No se pudo completar la solicitud (${respuesta.status}).`), { status: respuesta.status });
        }
        if (datos === null) throw new Error('El servidor devolvió una respuesta inesperada.');
        return datos;
    }
    return Object.freeze({
        login: (email, password) => solicitar('/auth/login', { method: 'POST', body: { email, password }, protegida: false }),
        registrarPaciente: (datos) => solicitar('/auth/registro/paciente', { method: 'POST', body: datos, protegida: false }),
        registrarMedico: (datos) => solicitar('/auth/registro/medico', { method: 'POST', body: datos, protegida: false }),
        verificarEmail: (token) => solicitar(`/auth/verificar-email?token=${encodeURIComponent(token)}`, { protegida: false }),
        recuperarPassword: (email) => solicitar('/auth/recuperar-password', { method: 'POST', body: { email }, protegida: false }),
        restablecerPassword: (token, password) => solicitar('/auth/restablecer-password', { method: 'POST', body: { token, password }, protegida: false }),
        obtenerTurnos: () => solicitar('/turnos'),
        obtenerTurno: (id) => solicitar(`/turnos/${encodeURIComponent(id)}`),
        crearTurno: (datos) => solicitar('/turnos', { method: 'POST', body: datos }),
        reemplazarTurno: (id, datos) => solicitar(`/turnos/${encodeURIComponent(id)}`, { method: 'PUT', body: datos }),
        modificarTurno: (id, datos) => solicitar(`/turnos/${encodeURIComponent(id)}`, { method: 'PATCH', body: datos }),
        reprogramarTurno: (id, datos) => solicitar(`/turnos/${encodeURIComponent(id)}/reprogramar`, { method: 'PATCH', body: datos }),
        confirmarTurno: (id, datos = {}) => solicitar(`/turnos/${encodeURIComponent(id)}/confirmar`, { method: 'PATCH', body: datos }),
        cancelarTurno: (id) => solicitar(`/turnos/${encodeURIComponent(id)}/cancelar`, { method: 'PATCH' }),
        eliminarTurno: (id) => solicitar(`/turnos/${encodeURIComponent(id)}`, { method: 'DELETE' })
    });
})();
