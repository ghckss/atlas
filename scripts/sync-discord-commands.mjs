import { REST, Routes, SlashCommandBuilder } from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;
const applicationId =
  process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_BOT_USER_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token) {
  throw new Error("DISCORD_BOT_TOKEN is required.");
}

if (!applicationId) {
  throw new Error("DISCORD_APPLICATION_ID or DISCORD_BOT_USER_ID is required.");
}

const commands = [
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Hermes runtime 상태를 확인합니다."),
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Hermes 설정 접근 권한을 확인합니다."),
  new SlashCommandBuilder()
    .setName("일정")
    .setDescription("일정을 추가하는 입력 모달을 엽니다."),
  new SlashCommandBuilder()
    .setName("작업승인")
    .setDescription("봇이 수정한 작업을 commit 후 push합니다. Owner 전용입니다.")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("사용할 commit message입니다.")
        .setMaxLength(200)
        .setRequired(false)
    )
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);
const route = guildId
  ? Routes.applicationGuildCommands(applicationId, guildId)
  : Routes.applicationCommands(applicationId);

await rest.put(route, {
  body: commands
});

console.log(
  `Synced ${commands.length} Discord application commands${
    guildId ? ` for guild ${guildId}` : ""
  }.`
);
