const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
let registros = new Map();
let fallo = null;
let falloOperacion = null;
const consultas = [];
const pool = { async query(sql, valores = []) {
    consultas.push({ sql, valores });
    if (fallo && (!falloOperacion || sql.includes(falloOperacion))) {
        const code = fallo; fallo = null; falloOperacion = null;
        throw { code, sql: 'detalle privado' };
    }
    if (sql.includes('SELECT')) return [sql.includes('WHERE') ? (registros.has(valores[0]) ? [registros.get(valores[0])] : []) : [...registros.values()]];
    if (sql.includes('INSERT')) { registros.set(32, { id_turno: 32 }); return [{ insertId: 32 }]; }
    if (sql.includes('UPDATE')) {
        const id = valores.at(-1);
        const campos = sql.split(' SET ')[1].split(' WHERE ')[0].split(', ').map(x => x.split(' =')[0]);
        campos.forEach((campo, i) => { registros.get(id)[campo] = valores[i]; });
        return [{ affectedRows: 1 }];
    }
    if (sql.includes('DELETE')) return [{ affectedRows: Number(registros.delete(valores[0])) }];
    throw new Error('SQL inesperado');
} };
// Sustituye MySQL antes de cargar la aplicación: ninguna consulta llega a una base real.
require.cache[require.resolve('../config/database')] = { exports: pool };
process.env.JWT_SECRET = 'clave-exclusiva-de-pruebas-en-memoria';
require.cache[require.resolve('../services/auth.service')] = {
    exports: { login: async (email, password) => password === 'clave-prueba'
        ? { id_usuario: 1, email, id_rol: 1, email_verificado: 1, password_hash: 'dato-privado' } : null }
};
const app = require('../server');
test('CRUD, validaciones nuevas, perfiles (Admin/Médico/Paciente) y mejoras funcionales con MySQL simulado', async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const token = jwt.sign({ id_rol: 1 }, process.env.JWT_SECRET);
    const tokenMedico = jwt.sign({ id_rol: 3, matricula_medico: 1001 }, process.env.JWT_SECRET);
    const tokenPaciente = jwt.sign({ id_rol: 2, dni_paciente: 30100101 }, process.env.JWT_SECRET);
    const base = `http://127.0.0.1:${server.address().port}/api/turnos`;
    async function pedir(method, path = '', body, auth = token, raw = false) {
        const respuesta = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
        return { status: respuesta.status, body: await respuesta.json() };
    }
    const datos = { fecha_turno: '2027-10-20', hora_turno: '09:30', dni_paciente: 30100101, id_practica: 1 };
    try {
        for (const origin of ['http://127.0.0.1:5500', 'http://localhost:5501']) {
            const preflight = await fetch(base, { method: 'OPTIONS', headers: {
                Origin: origin, 'Access-Control-Request-Method': 'PATCH',
                'Access-Control-Request-Headers': 'authorization,content-type'
            } });
            assert.equal(preflight.status, 200);
            assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
            assert.ok(preflight.headers.get('access-control-allow-headers').includes('Authorization'));
        }
        const prohibido = await fetch(base, { headers: { Origin: 'https://otro-sitio.example' } });
        assert.equal(prohibido.status, 403);
        assert.equal(prohibido.headers.get('access-control-allow-origin'), null);
        async function login(body) {
            const respuesta = await fetch(base.replace('/turnos', '/auth/login'), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            return { status: respuesta.status, body: await respuesta.json() };
        }
        assert.equal((await login({})).status, 400);
        assert.equal((await login({ email: 'admin@example.com', password: 'incorrecta' })).status, 401);
        const sesion = await login({ email: 'admin@example.com', password: 'clave-prueba' });
        assert.equal(sesion.status, 200);
        assert.deepEqual(Object.keys(sesion.body.usuario).sort(), ['email', 'id_rol', 'id_usuario']);
        assert.equal(jwt.verify(sesion.body.token, process.env.JWT_SECRET).id_rol, 1);
        assert.equal(JSON.stringify(sesion.body).includes('dato-privado'), false);
        assert.equal((await pedir('GET', '', undefined, null)).status, 401);
        assert.equal((await pedir('GET', '', undefined, 'invalido')).status, 401);
        assert.equal((await pedir('GET', '', undefined, jwt.sign({ id_rol: 2 }, process.env.JWT_SECRET))).status, 403);
        assert.equal((await pedir('GET')).status, 200);
        for (const id of ['0', '-1', '1.2', 'abc', '2147483648', '1e1']) assert.equal((await pedir('GET', '/' + id)).status, 400);
        assert.equal((await pedir('GET', '/31')).status, 404);
        assert.equal((await pedir('POST', '', datos)).status, 201);
        registros.set(31, { id_turno: 31, ...datos, medio_solicitado: 'Web', estado_turno: 'Reservado' });
        assert.equal((await pedir('GET', '/31')).status, 200);

        // Validación 1: Impedir fechas pasadas y horarios fuera de atención (Domingos cerrados, Lun-Vie 8-20, Sáb 8-14)
        assert.equal((await pedir('POST', '', { ...datos, fecha_turno: '2020-01-01' })).status, 400);
        assert.equal((await pedir('PATCH', '/31/reprogramar', { fecha_turno: '2020-01-01', hora_turno: '10:00' })).status, 400);
        assert.equal((await pedir('POST', '', { ...datos, fecha_turno: '2027-10-24', hora_turno: '10:00' })).status, 400); // Domingo
        assert.equal((await pedir('POST', '', { ...datos, fecha_turno: '2027-10-23', hora_turno: '15:00' })).status, 400); // Sábado > 14:00
        assert.equal((await pedir('POST', '', { ...datos, fecha_turno: '2027-10-21', hora_turno: '07:30' })).status, 400); // Antes de 08:00
        assert.equal((await pedir('POST', '', { ...datos, fecha_turno: '2027-10-21', hora_turno: '20:30' })).status, 400); // Después de 20:00

        // Validación 3: Impedir turnos superpuestos para el mismo paciente en la misma fecha y hora
        assert.equal((await pedir('POST', '', datos)).status, 400);

        // Perfiles y Mejora funcional: Médico confirma y reprograma (si estaba Confirmado, vuelve a Reservado)
        assert.equal((await pedir('GET', '', undefined, tokenMedico)).status, 200);
        assert.equal((await pedir('PATCH', '/31/confirmar', {}, tokenMedico)).status, 200);
        assert.equal(registros.get(31).estado_turno, 'Confirmado');
        assert.equal(registros.get(31).medico_confirmacion, 1001);
        assert.equal((await pedir('PATCH', '/31/reprogramar', { fecha_turno: '2027-10-21', hora_turno: '11:00' }, tokenMedico)).status, 200);
        assert.equal(registros.get(31).fecha_turno, '2027-10-21');
        assert.equal(registros.get(31).estado_turno, 'Reservado');
        assert.equal(registros.get(31).medico_confirmacion, null);
        assert.equal((await pedir('DELETE', '/31', undefined, tokenMedico)).status, 403);
        assert.equal((await pedir('POST', '', { ...datos, fecha_turno: '2027-10-22' }, tokenMedico)).status, 403);

        // Perfiles: Paciente consulta sus turnos, no puede confirmar ni reprogramar, pero sí cancelar el suyo
        const listaPaciente = await pedir('GET', '', undefined, tokenPaciente);
        assert.equal(listaPaciente.status, 200);
        assert.equal(listaPaciente.body.length, 1);
        assert.equal((await pedir('PATCH', '/31/confirmar', {}, tokenPaciente)).status, 403);
        assert.equal((await pedir('PATCH', '/31/reprogramar', { fecha_turno: '2027-10-25', hora_turno: '12:00' }, tokenPaciente)).status, 403);
        assert.equal((await pedir('PATCH', '/31/cancelar', {}, tokenPaciente)).status, 200);
        assert.equal(registros.get(31).estado_turno, 'Cancelado');

        // Validación 2: Impedir modificar, reprogramar o confirmar un turno que ya fue cancelado
        assert.equal((await pedir('PATCH', '/31', { estado_turno: 'Confirmado' })).status, 400);
        assert.equal((await pedir('PATCH', '/31/confirmar', {}, tokenMedico)).status, 400);
        assert.equal((await pedir('PATCH', '/31/reprogramar', { fecha_turno: '2027-10-25', hora_turno: '12:00' }, tokenMedico)).status, 400);

        // Restauramos estado activo para continuar con las pruebas de PUT/PATCH/errores
        registros.set(31, { id_turno: 31, ...datos, medio_solicitado: 'Web', estado_turno: 'Pendiente' });
        assert.equal((await pedir('PATCH', '/31', { estado_turno: 'Confirmado' })).status, 200);
        assert.equal(registros.get(31).medio_solicitado, 'Web');
        assert.equal((await pedir('PUT', '/31', datos)).status, 200);
        assert.equal(registros.get(31).medio_solicitado, null);
        for (const body of [{}, [], null, { id_turno: 1 }, { 'estado_turno = NULL': 'x' }, { fecha_turno: '2026-02-30' }, { hora_turno: '24:00' }, { id_equipo: true }, { dni_paciente: null }, { medio_solicitado: 5 }, { estado_turno: 'x'.repeat(31) }, { medio_solicitado: 'x'.repeat(51) }, { fecha_confirmacion: '2026-02-30 10:00:00' }]) {
            assert.equal((await pedir('PATCH', '/31', body)).status, 400);
        }
        assert.equal((await pedir('PUT', '/31', { estado_turno: 'x' })).status, 400);
        assert.equal((await pedir('POST', '', {})).status, 400);
        assert.equal((await pedir('PATCH', '/31', '{', token, true)).status, 400);
        assert.equal((await pedir('PATCH', '/99', { estado_turno: 'x' })).status, 404);
        fallo = 'ER_NO_REFERENCED_ROW_2';
        falloOperacion = 'INSERT';
        assert.equal((await pedir('POST', '', { ...datos, fecha_turno: '2027-11-01' })).status, 400);
        for (const metodo of ['PUT', 'PATCH']) {
            fallo = 'ER_NO_REFERENCED_ROW_2';
            falloOperacion = 'UPDATE';
            assert.equal((await pedir(metodo, '/31', datos)).status, 400);
        }
        fallo = 'ER_ROW_IS_REFERENCED_2';
        falloOperacion = 'DELETE';
        assert.equal((await pedir('DELETE', '/31')).status, 400);
        fallo = 'ERROR_INTERNO_PRIVADO';
        const interno = await pedir('GET');
        assert.equal(interno.status, 500);
        assert.equal(JSON.stringify(interno.body).includes('PRIVADO'), false);
        assert.equal((await pedir('DELETE', '/31')).status, 200);
        assert.equal((await pedir('DELETE', '/31')).status, 404);
        assert.ok(consultas.filter(x => /UPDATE|DELETE|INSERT/.test(x.sql)).every(x => x.sql.includes('?')));
    } finally { await new Promise(resolve => server.close(resolve)); }
});
