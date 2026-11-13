require("dotenv").config();

const express = require("express");
const pool = require("./config/database");
const turnosRoutes = require("./routes/turnos.routes");
const authRoutes = require("./routes/auth.routes");


const app = express();

app.use(require('./middlewares/cors.middleware'));
app.use(express.json());
app.use("/api/turnos", turnosRoutes);
app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("API de gestión de turnos funcionando");
});

// Responde siempre con JSON, sin exponer detalles internos del parser.
app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
        return res.status(400).json({ error: "Body JSON inválido o demasiado grande" });
    }
    return res.status(500).json({ error: "Error interno del servidor" });
});

async function iniciarServidor() {
    try {
        await pool.query("SELECT 1");

        console.log("Base de datos conectada correctamente");

        app.listen(PORT, () => {
            console.log(`Servidor funcionando en http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Error al conectar con la base de datos:");
        process.exitCode = 1;
        await pool.end();
    }
}

if (require.main === module) iniciarServidor();
module.exports = app;
