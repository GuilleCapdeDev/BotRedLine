import "dotenv/config";
import fs from "fs";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

// --- Keep-alive ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("Bot activo y autosustentable"));
app.listen(PORT, () => console.log(`Servidor web keep-alive iniciado en puerto ${PORT}`));

// --- Configuración Bot ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const fichajeChannelId = process.env.FICHAJE_CHANNEL_ID;
const weeklyChannelId = process.env.WEEKLY_CHANNEL_ID;
const MAX_HOURS = 6; // horas máximas por fichaje
let buttonsMessageId = null;

// --- Datos persistentes ---
let data = {
  userClockData: {}, // Entradas activas
  weeklyHours: {}    // Horas acumuladas
};

// Cargar datos
if (fs.existsSync("data.json")) {
  const saved = JSON.parse(fs.readFileSync("data.json"));
  data = { ...data, ...saved };
}

function saveData() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

// --- Función resumen semanal ---
async function sendWeeklySummary() {
  const weeklyChannel = await client.channels.fetch(weeklyChannelId).catch(() => null);
  if (!weeklyChannel) return;

  if (Object.keys(data.weeklyHours).length === 0) {
    return weeklyChannel.send("📝 No hay registros de horas esta semana.");
  }

  const guild = client.guilds.cache.first();
  let lines = [];

  for (const [userId, ms] of Object.entries(data.weeklyHours)) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const displayName = member ? member.displayName : userId;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    lines.push(`- ${displayName}: ${hours}h ${minutes}m`);
  }

  const summary = "🗓️ Resumen semanal de horas trabajadas:\n" + lines.join("\n");
  await weeklyChannel.send(summary);

  data.weeklyHours = {}; // reset semanal
  saveData();
}

// --- Comando slash ---
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("prueba_resumen")
      .setDescription("Enviar resumen semanal instantáneo")
  ].map(c => c.toJSON());

  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ Comando slash registrado");
  } catch (err) {
    console.error(err);
  }
}

registerCommands();

// --- Bot listo ---
client.once("clientReady", async () => {
  console.log(`🤖 Bot conectado como: ${client.user.tag}`);

  const fichajeChannel = await client.channels.fetch(fichajeChannelId).catch(() => null);
  if (!fichajeChannel) return console.log("❌ Canal FICHAJE no encontrado!");

  // Botones
  const botones = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("entrada")
      .setLabel("📥 Fichar Entrada")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("salida")
      .setLabel("📤 Fichar Salida")
      .setStyle(ButtonStyle.Danger)
  );

  // Enviar botón solo si no existe
  const mensajes = await fichajeChannel.messages.fetch({ limit: 10 });
  const botonesMsg = mensajes.find(m => m.author.id === client.user.id && m.components.length > 0);

  if (!botonesMsg) {
    const msg = await fichajeChannel.send({ content: "\u200b", components: [botones] });
    await msg.pin();
    buttonsMessageId = msg.id;
    console.log("📌 Botones enviados y fijados en FICHAJE.");
  } else {
    buttonsMessageId = botonesMsg.id;
    console.log("📌 Mensaje de botones ya existente.");
  }

  // Revisar fichajes abiertos > MAX_HOURS
  setInterval(async () => {
    const weeklyChannel = await client.channels.fetch(weeklyChannelId).catch(() => null);
    if (!weeklyChannel) return;

    const now = Date.now();
    for (const [userId, entrada] of Object.entries(data.userClockData)) {
      if (now - entrada >= MAX_HOURS * 60 * 60 * 1000) {
        delete data.userClockData[userId];
        saveData();

        const guild = client.guilds.cache.first();
        const member = await guild.members.fetch(userId).catch(() => null);
        const displayName = member ? member.displayName : userId;

        weeklyChannel.send(
          `⚠️ **${displayName}** tenía un fichaje abierto por más de ${MAX_HOURS} horas y fue cerrado automáticamente como infracción.`
        );
      }
    }
  }, 60 * 1000);

  // Resumen semanal automático (domingo 23:59)
  const nowDate = new Date();
  const millisToSunday =
    (7 - nowDate.getDay()) * 24 * 60 * 60 * 1000 -
    nowDate.getHours() * 3600000 -
    nowDate.getMinutes() * 60000 -
    nowDate.getSeconds() * 1000;
  setTimeout(() => {
    sendWeeklySummary();
    setInterval(sendWeeklySummary, 7 * 24 * 60 * 60 * 1000);
  }, millisToSunday);
});

// --- Manejo de botones ---
client.on("interactionCreate", async interaction => {
  const userId = interaction.user.id;
  const guild = interaction.guild;

  if (interaction.isButton()) {
    const weeklyChannel = await client.channels.fetch(weeklyChannelId).catch(() => null);
    if (!weeklyChannel) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    const displayName = member ? member.displayName : interaction.user.username;

    const now = Date.now();

    if (interaction.customId === "entrada") {
      if (data.userClockData[userId]) {
        return interaction.reply({ content: "⚠️ Ya tienes una entrada activa.", ephemeral: true });
      }
      data.userClockData[userId] = now;
      saveData();
      return interaction.reply({ content: "🟢 ¡Entrada fichada! No olvdes cerrar tu fichaje, evita sanción", ephemeral: true });
    }

    if (interaction.customId === "salida") {
      const entrada = data.userClockData[userId];
      if (!entrada) {
        return interaction.reply({ content: "⚠️ No registré tu entrada.", ephemeral: true });
      }

      const workedMs = now - entrada;
      delete data.userClockData[userId];

      if (data.weeklyHours[userId]) {
        data.weeklyHours[userId] += workedMs;
      } else {
        data.weeklyHours[userId] = workedMs;
      }
      saveData();

      const hours = Math.floor(workedMs / (1000 * 60 * 60));
      const minutes = Math.floor((workedMs / (1000 * 60)) % 60);

      await interaction.reply({ content: "🔴 ¡Salida fichada!", ephemeral: true });
      await weeklyChannel.send(`🕒 **${displayName}** ha trabajado **${hours}h ${minutes}m** hoy.`);
    }
  }

  // Comando slash para prueba de resumen
  if (interaction.isChatInputCommand() && interaction.commandName === "prueba_resumen") {
    await sendWeeklySummary();
    interaction.reply({ content: "✅ Resumen semanal enviado!", ephemeral: true });
  }
});

// --- Login ---
client.login(process.env.DISCORD_TOKEN);
