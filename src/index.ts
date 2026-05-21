import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits,
  REST,
  Routes,
  TextChannel
} from 'discord.js';
import { DateTime, Duration } from 'luxon';
import { loadEnv } from './config/env.js';
import { openDb, kvGet, kvSet, hasFired, markFired } from './db/db.js';
import { fetchPopulation } from './rcon/rcon.js';
import {
  humanizeCountdown,
  nextRecurringEvent,
  nextRestartTime,
  parseCtAnchor,
  parseOffsets
} from './schedule/time.js';
import 'dotenv/config';

const env = loadEnv();
const db = openDb();

const KV_STATUS_MESSAGE_ID = 'status_message_id';
const KV_WIPE_NOTES = 'wipe_notes';

function nowTz(): DateTime {
  return DateTime.now().setZone(env.TIMEZONE);
}

function isStaff(member: GuildMember | null): boolean {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (env.STAFF_ROLE_ID && member.roles.cache.has(env.STAFF_ROLE_ID)) return true;
  return false;
}

async function ensureTextChannel(id: string): Promise<TextChannel> {
  const ch = await client.channels.fetch(id);
  if (!ch) throw new Error(`Channel not found: ${id}`);
  if (ch.type !== ChannelType.GuildText) {
    throw new Error(`Channel ${id} is not a text channel`);
  }
  return ch as TextChannel;
}

function computeNextWipe(now: DateTime): DateTime {
  const anchor = parseCtAnchor(env.WIPE_ANCHOR_AT_CT, env.TIMEZONE);
  const period = Duration.fromObject({ days: env.WIPE_PERIOD_DAYS });
  return nextRecurringEvent(anchor, period, now);
}

function formatCt(dt: DateTime): string {
  return dt.toFormat("ccc, LLL d, yyyy 'at' h:mm a ZZZZ");
}

function buildStatusEmbed(opts: {
  onlineText: string;
  nextRestart: DateTime;
  nextWipe: DateTime;
  lastUpdated: DateTime;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Server Status')
    .setColor(0x2b90d9)
    .addFields(
      { name: 'Population', value: opts.onlineText, inline: true },
      {
        name: 'Next Restart (CT)',
        value: `${formatCt(opts.nextRestart)}\n(${humanizeCountdown(opts.nextRestart, opts.lastUpdated)} from now)`,
        inline: false
      },
      {
        name: 'Next Wipe (CT)',
        value: `${formatCt(opts.nextWipe)}\n(${humanizeCountdown(opts.nextWipe, opts.lastUpdated)} from now)`,
        inline: false
      },
      {
        name: 'Last Updated (CT)',
        value: opts.lastUpdated.toFormat('fff'),
        inline: false
      }
    );

  // Placeholder for future wipe notes (do not display if empty)
  const notes = kvGet(db, KV_WIPE_NOTES);
  if (notes && notes.trim().length) {
    embed.addFields({ name: 'Wipe Notes', value: notes.trim(), inline: false });
  }

  return embed;
}

async function updateStatusOnce(): Promise<void> {
  const now = nowTz();
  const nextRestart = nextRestartTime(now);
  const nextWipe = computeNextWipe(now);

  let onlineText = 'Unknown';
  try {
    const pop = await fetchPopulation({
      host: env.RCON_HOST,
      port: env.RCON_PORT,
      password: env.RCON_PASSWORD
    });
    if (typeof pop.online === 'number' && typeof pop.max === 'number') {
      onlineText = `${pop.online}/${pop.max}`;
    } else {
      onlineText = 'Online (unparsed)';
    }
  } catch (e) {
    onlineText = 'RCON error';
    console.error('RCON poll failed:', e);
  }

  const msgId = kvGet(db, KV_STATUS_MESSAGE_ID);
  if (!msgId) return;

  const channel = await ensureTextChannel(env.STATUS_CHANNEL_ID);
  const msg = await channel.messages.fetch(msgId);

  const embed = buildStatusEmbed({ onlineText, nextRestart, nextWipe, lastUpdated: now });
  await msg.edit({ embeds: [embed] });
}

async function announceIfDue(kind: 'wipe' | 'restart'): Promise<void> {
  const now = nowTz();
  const channelId = env.ANNOUNCE_CHANNEL_ID || env.STATUS_CHANNEL_ID;
  const channel = await ensureTextChannel(channelId);

  if (kind === 'wipe') {
    const eventAt = computeNextWipe(now);
    const offsets = parseOffsets(env.WIPE_OFFSETS);
    for (const offsetSec of offsets) {
      const fireAt = eventAt.minus({ seconds: offsetSec });
      if (now < fireAt || now > fireAt.plus({ seconds: 30 })) continue;

      const eventUtcIso = eventAt.toUTC().toISO()!;
      if (hasFired(db, 'wipe', eventUtcIso, offsetSec)) continue;

      const msg = `Wipe in ${humanizeCountdown(eventAt, now)} — ${formatCt(eventAt)}.`;
      await channel.send({ content: msg });

      markFired(db, 'wipe', eventUtcIso, offsetSec, now.toUTC().toISO()!);
    }
  }

  if (kind === 'restart') {
    const eventAt = nextRestartTime(now);
    const offsets = parseOffsets(env.RESTART_OFFSETS);
    for (const offsetSec of offsets) {
      const fireAt = eventAt.minus({ seconds: offsetSec });
      if (now < fireAt || now > fireAt.plus({ seconds: 30 })) continue;

      const eventUtcIso = eventAt.toUTC().toISO()!;
      if (hasFired(db, 'restart', eventUtcIso, offsetSec)) continue;

      const msg = `Restart in ${humanizeCountdown(eventAt, now)} — ${formatCt(eventAt)}.`;
      await channel.send({ content: msg });

      markFired(db, 'restart', eventUtcIso, offsetSec, now.toUTC().toISO()!);
    }
  }
}

async function tickSchedulers(): Promise<void> {
  try {
    await updateStatusOnce();
  } catch (e) {
    console.error('Status update failed:', e);
  }

  try {
    await announceIfDue('wipe');
    await announceIfDue('restart');
  } catch (e) {
    console.error('Announcement tick failed:', e);
  }
}

const client = new Client({
  intents: []
});

const commands = [
  {
    name: 'setup',
    description: 'Staff setup commands',
    options: [
      {
        type: 1, // SUB_COMMAND
        name: 'status',
        description: 'Create the live status message in the configured channel'
      }
    ]
  },
  {
    name: 'wipe',
    description: 'Show next wipe time and countdown'
  },
  {
    name: 'restart',
    description: 'Show next restart time and countdown'
  }
] as const;

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_APPLICATION_ID, env.DISCORD_GUILD_ID), {
    body: commands
  });
}

client.on('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  try {
    await registerCommands();
    console.log('Slash commands registered.');
  } catch (e) {
    console.error('Failed to register commands:', e);
  }

  // initial tick and then interval
  await tickSchedulers();
  setInterval(() => {
    void tickSchedulers();
  }, env.STATUS_POLL_SECONDS * 1000);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await handleCommand(interaction);
  } catch (e) {
    console.error('Command failed:', e);
    if (interaction.isRepliable()) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: `Error: ${msg}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `Error: ${msg}`, ephemeral: true });
      }
    }
  }
});

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const now = nowTz();

  if (interaction.commandName === 'setup') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'status') {
      const member = interaction.member instanceof GuildMember ? interaction.member : null;
      if (!isStaff(member)) {
        await interaction.reply({ content: 'You do not have permission to run this.', ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      const channel = await ensureTextChannel(env.STATUS_CHANNEL_ID);

      const embed = buildStatusEmbed({
        onlineText: 'Initializing…',
        nextRestart: nextRestartTime(now),
        nextWipe: computeNextWipe(now),
        lastUpdated: now
      });

      const msg = await channel.send({ embeds: [embed] });
      kvSet(db, KV_STATUS_MESSAGE_ID, msg.id);

      await interaction.editReply('Status message created and will begin updating.');
      return;
    }
  }

  if (interaction.commandName === 'wipe') {
    const nextWipe = computeNextWipe(now);
    await interaction.reply({
      content: `Next wipe: ${formatCt(nextWipe)} (in ${humanizeCountdown(nextWipe, now)}).`
    });
    return;
  }

  if (interaction.commandName === 'restart') {
    const nextR = nextRestartTime(now);
    await interaction.reply({
      content: `Next restart: ${formatCt(nextR)} (in ${humanizeCountdown(nextR, now)}).`
    });
    return;
  }

  await interaction.reply({ content: 'Unknown command.', ephemeral: true });
}

await client.login(env.DISCORD_TOKEN);
