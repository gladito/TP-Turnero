require('dotenv').config();
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function inicializarPerfiles() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rol (
                id_rol INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(50) NOT NULL UNIQUE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await pool.query(`
            INSERT IGNORE INTO rol (id_rol, nombre) VALUES
            (1, 'ADMIN'),
            (2, 'PACIENTE'),
            (3, 'MEDICO')
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuario (
                id_usuario INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(150) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                id_rol INT NOT NULL DEFAULT 2,
                email_verificado TINYINT(1) NOT NULL DEFAULT 0,
                dni_paciente INT DEFAULT NULL,
                matricula_medico INT DEFAULT NULL,
                fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (id_rol) REFERENCES rol(id_rol)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Agrega las columnas dni_paciente y matricula_medico si la tabla ya existía sin ellas.
        const [columnas] = await pool.query('SHOW COLUMNS FROM usuario');
        const nombresColumnas = columnas.map((c) => c.Field);
        if (!nombresColumnas.includes('dni_paciente')) {
            await pool.query('ALTER TABLE usuario ADD COLUMN dni_paciente INT DEFAULT NULL');
        }
        if (!nombresColumnas.includes('matricula_medico')) {
            await pool.query('ALTER TABLE usuario ADD COLUMN matricula_medico INT DEFAULT NULL');
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS token_cuenta (
                id_token INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                id_usuario INT NOT NULL,
                token_hash CHAR(64) NOT NULL,
                tipo VARCHAR(30) NOT NULL,
                fecha_expiracion DATETIME NOT NULL,
                usado TINYINT(1) NOT NULL DEFAULT 0,
                fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        const hashAdmin = await bcrypt.hash('Admin123!', 12);
        const hashPaciente = await bcrypt.hash('Paciente123!', 12);
        const hashMedico = await bcrypt.hash('Medico123!', 12);

        const cuentas = [
            ['admin@ejemplo.com', hashAdmin, 1, 1, null, null],
            ['juan.perez@gmail.com', hashPaciente, 2, 1, 30100101, null],
            ['medico@ejemplo.com', hashMedico, 3, 1, null, 1001]
        ];

        for (const [email, hash, idRol, verificado, dniPaciente, matriculaMedico] of cuentas) {
            await pool.query(
                `INSERT INTO usuario (email, password_hash, id_rol, email_verificado, dni_paciente, matricula_medico)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    password_hash = VALUES(password_hash),
                    id_rol = VALUES(id_rol),
                    email_verificado = VALUES(email_verificado),
                    dni_paciente = VALUES(dni_paciente),
                    matricula_medico = VALUES(matricula_medico)`,
                [email, hash, idRol, verificado, dniPaciente, matriculaMedico]
            );
        }

        console.log('Perfiles inicializados correctamente (Admin, Paciente y Médico listos).');
    } finally {
        await pool.end();
    }
}

inicializarPerfiles();
