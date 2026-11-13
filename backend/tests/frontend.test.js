const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const leer = nombre => fs.readFileSync(path.join(__dirname, '../../frontend/js', nombre), 'utf8');
function almacenamiento() {
    const datos = new Map();
    return { getItem: k => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v), removeItem: k => datos.delete(k) };
}
test('API centraliza login, Bearer y errores', async () => {
    const llamadas = [];
    let status = 200;
    const contexto = { window: {}, sessionStorage: almacenamiento(), fetch: async (url, opciones) => {
        llamadas.push({ url, opciones });
        return { ok: status === 200, status, json: async () => status === 200 ? [] : { error: 'Sin permiso' } };
    } };
    vm.runInNewContext(leer('api.js'), contexto);
    const api = contexto.window.API;
    await api.login('admin@example.com', 'prueba');
    assert.equal(llamadas[0].opciones.method, 'POST');
    assert.equal(llamadas[0].opciones.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(llamadas[0].opciones.body), { email: 'admin@example.com', password: 'prueba' });
    await assert.rejects(api.obtenerTurnos(), e => e.status === 401);
    contexto.sessionStorage.setItem('token', 'token-de-prueba');
    await api.obtenerTurnos();
    assert.equal(llamadas.at(-1).opciones.headers.Authorization, 'Bearer token-de-prueba');
    status = 403;
    await assert.rejects(api.obtenerTurnos(), e => e.status === 403 && e.message === 'Sin permiso');
    contexto.fetch = async () => { throw new Error('fallo de red'); };
    await assert.rejects(api.obtenerTurnos(), /No se pudo conectar/);
});
test('login guarda sesión y redirige; dashboard sin token vuelve al login', async () => {
    const storage = almacenamiento();
    let enviar;
    let destino;
    const elementos = {
        'login-form': { addEventListener: (evento, funcion) => { enviar = funcion; }, reportValidity: () => true, email: { value: ' admin@example.com ' }, password: { value: 'prueba' }, reset() {} },
        'login-error': {}, 'login-boton': {}
    };
    vm.runInNewContext(leer('app.js'), {
        document: { getElementById: id => elementos[id] }, sessionStorage: storage,
        window: { location: { assign: ruta => { destino = ruta; } } },
        API: { login: async () => ({ token: 'token-prueba', usuario: { email: 'admin@example.com', id_rol: 1 } }) }
    });
    await enviar({ preventDefault() {} });
    assert.equal(storage.getItem('token'), 'token-prueba');
    assert.equal(JSON.parse(storage.getItem('usuario')).id_rol, 1);
    assert.equal(destino, 'pages/dashboard.html');
    storage.removeItem('token');
    vm.runInNewContext(leer('dashboard.js'), {
        document: { getElementById: () => ({}) }, sessionStorage: storage,
        window: { location: { replace: ruta => { destino = ruta; } } }
    });
    assert.equal(destino, '../index.html');
    assert.equal(storage.getItem('usuario'), null);
});
