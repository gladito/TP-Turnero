const { enviarCorreo } = require('../services/emailService');

async function probarCorreo() {
    try {
        const info = await enviarCorreo({
            to: 'destinatario@example.com',
            subject: 'Prueba de correo',
            text: 'Este es un correo de prueba de Gestión de Turnos enviado con Ethereal.',
            html: '<h1>Prueba de correo</h1><p>Este es un correo de prueba de Gestión de Turnos enviado con Ethereal.</p>'
        });

        console.log('ID del mensaje:', info.messageId);
        console.log('URL de vista previa:', info.previewUrl);
    } catch (error) {
        console.error('No se pudo enviar el correo de prueba:', error.message);
        process.exitCode = 1;
    }
}

probarCorreo();
