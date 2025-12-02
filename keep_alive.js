const express = require("express");
const app = express();

// Ruta principal
app.get("/", (req, res) => {
  res.send("Bot activo y autosustentable 🚀");
});

// Puerto 3000
app.listen(3000, () => {
  console.log("Servidor web de keep-alive iniciado en puerto 3000");
});
