import expressModule from "express";

const express = expressModule.default ?? expressModule; // compatibilidad ESM

const app = express();

app.get("/", (req, res) => res.send("Bot activo y autosustentable"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor web keep-alive iniciado en puerto ${PORT}`));
