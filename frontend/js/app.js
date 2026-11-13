const formulario = document.getElementById('login-form');
const mensaje = document.getElementById('login-error');
const boton = document.getElementById('login-boton');
formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formulario.reportValidity()) return;
    mensaje.textContent = '';
    boton.disabled = true;
    boton.textContent = 'Ingresando…';
    try {
        const datos = await API.login(formulario.email.value.trim(), formulario.password.value);
        if (typeof datos.token !== 'string' || !datos.usuario) throw new Error('La respuesta del login está incompleta. Reiniciá el backend actualizado.');
        if (![1, 2, 3].includes(Number(datos.usuario.id_rol))) throw new Error('Tu cuenta no tiene un perfil válido para acceder al sistema.');
        try {
            sessionStorage.setItem('token', datos.token);
            sessionStorage.setItem('usuario', JSON.stringify(datos.usuario));
        } catch {
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('usuario');
            throw new Error('Habilitá el almacenamiento de sesión del navegador para ingresar.');
        }
        formulario.reset();
        window.location.assign('pages/dashboard.html');
    } catch (error) {
        mensaje.textContent = error.message;
    } finally {
        boton.disabled = false;
        boton.textContent = 'Iniciar sesión';
    }
});
