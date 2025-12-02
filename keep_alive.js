import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot activo y autosustentable"));

app.listen(PORT, () => console.log(`Servidor web keep-alive iniciado en puerto ${PORT}`));

export default app;
