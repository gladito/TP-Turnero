(() => {
    const panel = document.getElementById('panel');
    const estado = document.getElementById('estado');
    const boton = document.getElementById('actualizar');
    const cuerpo = document.getElementById('turnos');
    const cantidad = document.getElementById('cantidad');
    const region = document.getElementById('region-tabla');

    function cerrarSesion() {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('usuario');
        window.location.replace('../index.html');
    }

    function validarSesion() {
        try {
            const usuario = JSON.parse(sessionStorage.getItem('usuario'));
            if (!sessionStorage.getItem('token') || !usuario || ![1, 2, 3].includes(Number(usuario.id_rol))) {
                cerrarSesion();
                return null;
            }
            return usuario;
        } catch {
            cerrarSesion();
            return null;
        }
    }

    // La autorización definitiva se realiza siempre en el backend.
    const usuario = validarSesion();
    if (!usuario) return;

    const idRol = Number(usuario.id_rol);
    const nombresRol = { 1: 'ADMINISTRADOR', 2: 'PACIENTE', 3: 'MÉDICO' };
    const descripcionesRol = {
        1: 'Perfil Administrador: tenés acceso completo para consultar, asignar, reprogramar, confirmar, cancelar y eliminar turnos del centro.',
        2: `Perfil Paciente${usuario.dni_paciente ? ` (DNI ${usuario.dni_paciente})` : ''}: podés consultar tus propios turnos, reservar nuevos turnos y cancelar turnos pendientes.`,
        3: `Perfil Médico${usuario.matricula_medico ? ` (Matrícula ${usuario.matricula_medico})` : ''}: podés consultar la agenda del centro, confirmar turnos reservados y reprogramar horarios.`
    };

    document.getElementById('usuario').textContent = usuario.email || nombresRol[idRol];
    const badgeRol = document.getElementById('badge-rol');
    if (badgeRol) badgeRol.textContent = nombresRol[idRol];
    const etiquetaRol = document.getElementById('etiqueta-rol');
    if (etiquetaRol) etiquetaRol.textContent = `PANEL DE ${nombresRol[idRol]}`;
    const descRol = document.getElementById('descripcion-rol');
    if (descRol) descRol.textContent = descripcionesRol[idRol];

    const cardCrear = document.getElementById('card-crear-turno');
    const cardReprog = document.getElementById('card-reprogramar-turno');
    const inputCrearDni = document.getElementById('crear-dni');
    const inputCrearFecha = document.getElementById('crear-fecha');
    const inputReprogFecha = document.getElementById('reprog-fecha');
    const mensajeAccion = document.getElementById('mensaje-accion');

    function obtenerHoyIso() {
        const hoy = new Date();
        const anio = hoy.getFullYear();
        const mes = String(hoy.getMonth() + 1).padStart(2, '0');
        const dia = String(hoy.getDate()).padStart(2, '0');
        return `${anio}-${mes}-${dia}`;
    }

    const hoyIso = obtenerHoyIso();
    if (inputCrearFecha) inputCrearFecha.min = hoyIso;
    if (inputReprogFecha) inputReprogFecha.min = hoyIso;

    // Adaptación de vistas y formularios según el rol que inició sesión.
    if (cardCrear && (idRol === 1 || idRol === 2)) {
        cardCrear.hidden = false;
        if (idRol === 2 && inputCrearDni && usuario.dni_paciente) {
            inputCrearDni.value = usuario.dni_paciente;
            inputCrearDni.readOnly = true;
        }
    }
    if (cardReprog && (idRol === 1 || idRol === 3)) {
        cardReprog.hidden = false;
    }

    panel.hidden = false;
    document.getElementById('salir').addEventListener('click', cerrarSesion);

    const inicio = document.getElementById('seccion-inicio');
    const seccionTurnos = document.getElementById('seccion-turnos');
    const menuInicio = document.getElementById('menu-inicio');
    const menuTurnos = document.getElementById('menu-turnos');

    function informarAccion(texto, esError = false) {
        if (!mensajeAccion) return;
        mensajeAccion.textContent = texto;
        mensajeAccion.classList.toggle('error', Boolean(esError));
    }

    // Cambia únicamente la sección visible, sin recargar la página.
    function mostrarSeccion(turnosVisible) {
        inicio.hidden = turnosVisible;
        seccionTurnos.hidden = !turnosVisible;
        for (const [opcion, activa] of [[menuInicio, !turnosVisible], [menuTurnos, turnosVisible]]) {
            opcion.classList.toggle('activo', activa);
            if (activa) opcion.setAttribute('aria-current', 'page');
            else opcion.removeAttribute('aria-current');
        }
        if (turnosVisible && !boton.disabled) cargarTurnos();
    }

    menuInicio.addEventListener('click', () => mostrarSeccion(false));
    menuTurnos.addEventListener('click', () => mostrarSeccion(true));

    function mostrarFecha(valor, conHora = false) {
        if (!valor) return '—';
        const texto = String(valor);
        const fecha = texto.slice(0, 10).split('-');
        return fecha.length === 3 ? `${fecha[2]}/${fecha[1]}/${fecha[0]}${conHora ? ' ' + texto.slice(11, 19) : ''}` : texto;
    }

    async function ejecutarOperacion(promesa) {
        if (!validarSesion()) return;
        try {
            const respuesta = await promesa();
            informarAccion(respuesta?.mensaje || 'Operación realizada correctamente.', false);
            await cargarTurnos();
        } catch (error) {
            if (error.status === 401) { cerrarSesion(); return; }
            informarAccion(error.message || 'No se pudo completar la operación.', true);
        }
    }

    const formCrear = document.getElementById('form-crear-turno');
    if (formCrear) {
        formCrear.addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const dni = Number(formCrear.dni_paciente.value);
            const idPractica = Number(formCrear.id_practica.value);
            const fechaTurno = formCrear.fecha_turno.value;
            const horaTurno = formCrear.hora_turno.value;
            const medio = formCrear.medio_solicitado.value || 'Web';

            await ejecutarOperacion(() => API.crearTurno({
                dni_paciente: dni,
                id_practica: idPractica,
                fecha_turno: fechaTurno,
                hora_turno: horaTurno,
                medio_solicitado: medio
            }));
        });
    }

    const formReprog = document.getElementById('form-reprogramar-turno');
    if (formReprog) {
        formReprog.addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const idTurno = formReprog.id_turno.value;
            const fechaTurno = formReprog.fecha_turno.value;
            const horaTurno = formReprog.hora_turno.value;

            await ejecutarOperacion(() => API.reprogramarTurno(idTurno, {
                fecha_turno: fechaTurno,
                hora_turno: horaTurno
            }));
        });
    }

    function crearBotonAccion(texto, clase, deshabilitado, manejador) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = texto;
        btn.className = `btn-accion ${clase}`;
        btn.disabled = Boolean(deshabilitado);
        btn.addEventListener('click', manejador);
        return btn;
    }

    async function cargarTurnos() {
        if (!validarSesion()) return;
        boton.disabled = true;
        region.setAttribute('aria-busy', 'true');
        cuerpo.replaceChildren();
        cantidad.textContent = '—';
        estado.classList.remove('error');
        estado.textContent = 'Cargando turnos…';
        try {
            const turnos = await API.obtenerTurnos();
            if (!Array.isArray(turnos)) throw new Error('El servidor devolvió un listado inválido.');
            const fragmento = document.createDocumentFragment();
            for (const turno of turnos) {
                const fila = document.createElement('tr');
                const estadoActual = String(turno.estado_turno || '').trim();
                const estaCancelado = estadoActual.toLowerCase() === 'cancelado';
                const estaConfirmado = estadoActual.toLowerCase() === 'confirmado';

                const valores = [
                    turno.id_turno,
                    mostrarFecha(turno.fecha_turno),
                    turno.hora_turno,
                    turno.dni_paciente,
                    turno.id_practica,
                    turno.id_equipo,
                    turno.id_disponibilidad,
                    turno.medio_solicitado,
                    turno.estado_turno,
                    mostrarFecha(turno.fecha_confirmacion, true),
                    turno.medico_confirmacion
                ];

                valores.forEach((valor, indice) => {
                    const celda = document.createElement('td');
                    // textContent evita interpretar datos del servidor como HTML.
                    celda.textContent = valor === null || valor === undefined || valor === '' ? '—' : String(valor);
                    if (indice === 8) {
                        celda.classList.add('estado-turno');
                        if (estaCancelado) celda.classList.add('estado-cancelado');
                    }
                    fila.append(celda);
                });

                const celdaAcciones = document.createElement('td');
                const contenedorAcciones = document.createElement('div');
                contenedorAcciones.className = 'acciones-celda';

                // Botones exclusivos de Admin (1) y Médico (3)
                if (idRol === 1 || idRol === 3) {
                    contenedorAcciones.append(
                        crearBotonAccion('Confirmar', 'btn-confirmar', estaCancelado || estaConfirmado, () => {
                            ejecutarOperacion(() => API.confirmarTurno(turno.id_turno));
                        }),
                        crearBotonAccion('Reprogramar', 'btn-reprogramar', estaCancelado, () => {
                            if (formReprog) {
                                formReprog.id_turno.value = turno.id_turno;
                                formReprog.fecha_turno.value = String(turno.fecha_turno || '').slice(0, 10);
                                formReprog.hora_turno.value = String(turno.hora_turno || '').slice(0, 5);
                                formReprog.fecha_turno.focus();
                                informarAccion(`Editando reprogramación del turno #${turno.id_turno}. Elegí la nueva fecha y hora.`, false);
                            }
                        })
                    );
                }

                // Botón Cancelar disponible para los 3 roles (en sus turnos permitidos)
                contenedorAcciones.append(
                    crearBotonAccion('Cancelar', 'btn-cancelar', estaCancelado, () => {
                        ejecutarOperacion(() => API.cancelarTurno(turno.id_turno));
                    })
                );

                // Botón Eliminar exclusivo del Administrador (1)
                if (idRol === 1) {
                    contenedorAcciones.append(
                        crearBotonAccion('Eliminar', 'btn-eliminar', false, () => {
                            ejecutarOperacion(() => API.eliminarTurno(turno.id_turno));
                        })
                    );
                }

                celdaAcciones.append(contenedorAcciones);
                fila.append(celdaAcciones);
                fragmento.append(fila);
            }
            cuerpo.replaceChildren(fragmento);
            cantidad.textContent = `${turnos.length} ${turnos.length === 1 ? 'turno' : 'turnos'}`;
            estado.textContent = turnos.length ? '' : 'No hay turnos registrados.';
        } catch (error) {
            if (error.status === 401) { cerrarSesion(); return; }
            estado.classList.add('error');
            estado.textContent = error.status === 403 ? 'Tu cuenta no tiene permiso para consultar los turnos.' : error.message;
        } finally {
            boton.disabled = false;
            region.setAttribute('aria-busy', 'false');
        }
    }

    boton.addEventListener('click', cargarTurnos);
    // Revalida incluso cuando el navegador restaura la página desde su caché.
    window.addEventListener('pageshow', (evento) => { if (evento.persisted && validarSesion()) cargarTurnos(); });
    mostrarSeccion(false);
})();
