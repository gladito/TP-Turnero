const nodemailer = require('nodemailer');

let transporter;
let inicializacion;

async function obtenerTransporter() {
    if (transporter) return transporter;

    // Comparte la inicialización si llegan varios envíos al mismo tiempo.
    if (!inicializacion) {
        inicializacion = (async () => {
            const cuenta = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: {
                    user: cuenta.user,
                    pass: cuenta.pass
                }
            }, {
                from: `Gestión de Turnos <${cuenta.user}>`
            });
            return transporter;
        })();
    }

    try {
        return await inicializacion;
    } finally {
        // Permite reintentar si falla la creación de la cuenta.
        inicializacion = null;
    }
}

async function enviarCorreo({ to, subject, text, html }) {
    const transporte = await obtenerTransporter();
    const info = await transporte.sendMail({ to, subject, text, html });
    const previewUrl = nodemailer.getTestMessageUrl(info);

    console.log('Correo enviado al servicio de pruebas.');
    console.log('Asunto:', subject);
    console.log('Vista previa:', previewUrl);

    return {
        messageId: info.messageId,
        previewUrl
    };
}

module.exports = { enviarCorreo };
