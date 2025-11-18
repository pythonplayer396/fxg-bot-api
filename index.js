
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Configuration
const CONFIG = {
  CATEGORY_ID: '1436453776113270904', // Interview channels category
  APPROVED_CATEGORY_ID: '1436462936028614687', // Approved channels category
  DENIED_CATEGORY_ID: '1436463032174776420', // Denied channels category
  ROLE_1: '1308840318690394233',
  ROLE_2: '1246460406055178260',
  WELCOME_CHANNEL: '1412296487987056650',
  GUILD_ID: process.env.GUILD_ID // Add this to .env
};

// Storage for interview channels and counter
const interviewChannels = new Map(); // discordId -> channelId
let channelCounter = 0;

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// Track bot ready state
let botReady = false;

// Login to Discord
client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
  console.error('❌ Failed to login bot:', err);
  process.exit(1);
});

client.once('ready', () => {
  botReady = true;
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  
  // Initialize channel counter by checking existing channels
  const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
  if (guild) {
    const category = guild.channels.cache.get(CONFIG.CATEGORY_ID);
    if (category) {
      const intChannels = category.children.cache.filter(ch => ch.name.startsWith('int-'));
      const numbers = intChannels.map(ch => {
        const match = ch.name.match(/int-(\d+)/);
        return match ? parseInt(match[1]) : 0;
      });
      channelCounter = numbers.length > 0 ? Math.max(...numbers) : 0;
      console.log(`📊 Found ${intChannels.size} interview channels, counter set to ${channelCounter}`);
    }
  }
});

client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

client.on('disconnect', () => {
  botReady = false;
  console.warn('⚠️ Bot disconnected from Discord');
});

// Helper function to check if bot is ready
function checkBotReady(res) {
  if (!botReady || !client.user) {
    return res.status(503).json({ 
      error: 'Bot is not ready. Please wait a moment and try again.',
      botStatus: client.user ? 'connecting' : 'offline'
    });
  }
  return null;
}

// Helper function to fetch user with timeout
async function fetchUserWithTimeout(discordId, timeout = 10000) {
  return Promise.race([
    client.users.fetch(discordId),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('User fetch timeout')), timeout)
    )
  ]);
}

// Button interaction handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'join_interview') {
    try {
      const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
      if (!guild) {
        return interaction.reply({ content: '❌ Server not found!', ephemeral: true });
      }

      const member = await guild.members.fetch(interaction.user.id);
      if (!member) {
        return interaction.reply({ content: '❌ You are not a member of the server!', ephemeral: true });
      }

      // Check if user already has a channel
      if (interviewChannels.has(interaction.user.id)) {
        const existingChannelId = interviewChannels.get(interaction.user.id);
        const existingChannel = guild.channels.cache.get(existingChannelId);
        if (existingChannel) {
          return interaction.reply({ 
            content: `✅ You already have an interview channel: <#${existingChannelId}>`, 
            ephemeral: true 
          });
        }
      }

      // Create interview channel
      channelCounter++;
      const channelName = `int-${channelCounter}`;

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: CONFIG.CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }
        ]
      });

      // Store channel mapping
      interviewChannels.set(interaction.user.id, channel.id);

      // Send channel link to user
      await interaction.user.send({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Interview Channel Created!')
          .setDescription(
            `Your interview channel has been created!\n\n` +
            `Channel: <#${channel.id}>\n\n` +
            `Our staff will join you shortly. Good luck!`
          )
          .setColor(0x10B981)
          .setFooter({ text: 'FxG Team' })
          .setTimestamp()
        ]
      });

      await interaction.reply({ 
        content: `✅ Interview channel created: <#${channel.id}>`, 
        ephemeral: true 
      });

      console.log(`✅ Created interview channel ${channelName} for ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error creating interview channel:', error);
      await interaction.reply({ 
        content: '❌ Failed to create interview channel. Please contact an administrator.', 
        ephemeral: true 
      });
    }
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: botReady ? 'online' : 'offline',
    bot: client.user?.tag || 'connecting...',
    ready: botReady,
    timestamp: new Date().toISOString()
  });
});

// Lightweight ping endpoint for keep-alive
app.get('/ping', (req, res) => {
  res.json({ 
    pong: true,
    timestamp: new Date().toISOString(),
    botReady: botReady
  });
});

// Send interview DM
app.post('/send-interview-dm', async (req, res) => {
  // Check API key
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (apiKey !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if bot is ready
  const notReady = checkBotReady(res);
  if (notReady) return notReady;

  const { discordId, applicantName, applicationType } = req.body;

  if (!discordId || !applicantName || !applicationType) {
    return res.status(400).json({ 
      error: 'Missing required fields: discordId, applicantName, applicationType' 
    });
  }

  try {
    const user = await fetchUserWithTimeout(discordId);
    
    const embed = new EmbedBuilder()
      .setTitle('🎉 Interview Invitation')
      .setDescription(
        `Hi **${applicantName}**!\n\n` +
        `You have been selected for an interview for the **${applicationType}** position.\n\n` +
        `Our staff managers will contact you soon with more details about the interview.\n\n` +
        `Click the button below to join your interview channel!\n\n` +
        `Good luck! 🍀`
      )
      .setColor(0x8B5CF6)
      .setFooter({ text: 'FxG Team' })
      .setTimestamp();

    const button = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('join_interview')
          .setLabel('Join')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
      );

    await user.send({ embeds: [embed], components: [button] });
    
    res.json({ 
      success: true, 
      message: `Interview DM sent to ${user.tag}` 
    });
  } catch (error) {
    console.error('Error sending DM:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Send approval DM
app.post('/send-approval-dm', async (req, res) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (apiKey !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if bot is ready
  const notReady = checkBotReady(res);
  if (notReady) return notReady;

  const { discordId, applicantName, applicationType } = req.body;

  try {
    const user = await fetchUserWithTimeout(discordId);
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
    
    if (!guild) {
      return res.status(500).json({ error: 'Guild not found' });
    }

    const member = await guild.members.fetch(discordId);
    
    // Add roles
    await member.roles.add([CONFIG.ROLE_1, CONFIG.ROLE_2]);
    console.log(`✅ Added roles to ${user.tag}`);

    // Move interview channel to approved category
    if (interviewChannels.has(discordId)) {
      const channelId = interviewChannels.get(discordId);
      const channel = guild.channels.cache.get(channelId);
      
      if (channel) {
        await channel.setParent(CONFIG.APPROVED_CATEGORY_ID);
        console.log(`✅ Moved ${channel.name} to approved category`);
      }
    }

    // Send welcome message in staff channel ONLY for Helper applications
    if (applicationType === 'helper') {
      const welcomeChannel = guild.channels.cache.get(CONFIG.WELCOME_CHANNEL);
      if (welcomeChannel) {
        await welcomeChannel.send(`Welcome <@${discordId}> to staff!!`);
        console.log(`✅ Sent welcome message for ${user.tag}`);
      }
    } else {
      console.log(`ℹ️ Skipping welcome message for ${applicationType} application`);
    }

    // Send approval DM
    const embed = new EmbedBuilder()
      .setTitle('✅ Application Approved!')
      .setDescription(
        `Hi **${applicantName}**!\n\n` +
        `Congratulations! Your interview has been successful and your application for the **${applicationType}** position has been **APPROVED**! 🎉\n\n` +
        `Welcome to the FxG team! We're excited to have you on board.\n\n` +
        `You'll receive further instructions from our staff managers soon.`
      )
      .setColor(0x10B981)
      .setFooter({ text: 'FxG Team' })
      .setTimestamp();

    await user.send({ embeds: [embed] });
    
    res.json({ 
      success: true, 
      message: `Approval DM sent to ${user.tag}, roles added, welcome message sent` 
    });
  } catch (error) {
    console.error('Error sending approval:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Send denial DM
app.post('/send-denial-dm', async (req, res) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (apiKey !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if bot is ready
  const notReady = checkBotReady(res);
  if (notReady) return notReady;

  const { discordId, applicantName, applicationType } = req.body;

  try {
    const user = await fetchUserWithTimeout(discordId);
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID);

    // Move channel to denied category and remove user permissions
    if (interviewChannels.has(discordId) && guild) {
      const channelId = interviewChannels.get(discordId);
      const channel = guild.channels.cache.get(channelId);
      
      if (channel) {
        // Move to denied category
        await channel.setParent(CONFIG.DENIED_CATEGORY_ID);
        console.log(`✅ Moved ${channel.name} to denied category`);
        
        // Remove user permissions
        await channel.permissionOverwrites.delete(discordId);
        console.log(`✅ Removed channel permissions for ${user.tag} from ${channel.name}`);
      }
      
      // Remove from tracking
      interviewChannels.delete(discordId);
    }
    
    // Send denial DM
    const embed = new EmbedBuilder()
      .setTitle('Application Update')
      .setDescription(
        `Hi **${applicantName}**,\n\n` +
        `Thank you for your interest in the **${applicationType}** position.\n\n` +
        `Unfortunately, we've decided to move forward with other candidates at this time.\n\n` +
        `We appreciate your time and encourage you to apply again in the future!`
      )
      .setColor(0xEF4444)
      .setFooter({ text: 'FxG Team' })
      .setTimestamp();

    await user.send({ embeds: [embed] });
    
    res.json({ 
      success: true, 
      message: `Denial DM sent to ${user.tag}, channel permissions removed` 
    });
  } catch (error) {
    console.error('Error sending denial:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Send career approval DM (for Slayer/Dungeon)
app.post('/send-career-approval-dm', async (req, res) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (apiKey !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if bot is ready
  const notReady = checkBotReady(res);
  if (notReady) return notReady;

  const { discordId, applicantName, applicationType } = req.body;

  try {
    const user = await fetchUserWithTimeout(discordId);
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
    
    if (!guild) {
      return res.status(500).json({ error: 'Guild not found' });
    }

    const member = await guild.members.fetch(discordId);
    
    // Add roles
    await member.roles.add([CONFIG.ROLE_1, CONFIG.ROLE_2]);
    console.log(`✅ Added roles to ${user.tag}`);

    // NO welcome message for career applications (only for Helper)
    console.log(`ℹ️ Skipping welcome message for career application`);

    // Send approval DM
    const embed = new EmbedBuilder()
      .setTitle('✅ You Have Been Selected!')
      .setDescription(
        `Hi **${applicantName}**!\n\n` +
        `You have been selected for the **${applicationType}** carrier position.\n\n` +
        `Welcome to the FxG team!`
      )
      .setColor(0x10B981)
      .setFooter({ text: 'FxG Team' })
      .setTimestamp();

    await user.send({ embeds: [embed] });
    
    res.json({ 
      success: true, 
      message: `Career approval DM sent to ${user.tag}, roles added (no welcome message)` 
    });
  } catch (error) {
    console.error('Error sending career approval:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Send career denial DM (for Slayer/Dungeon)
app.post('/send-career-denial-dm', async (req, res) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (apiKey !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if bot is ready
  const notReady = checkBotReady(res);
  if (notReady) return notReady;

  const { discordId, applicantName, applicationType } = req.body;

  try {
    const user = await fetchUserWithTimeout(discordId);
    
    // Send denial DM
    const embed = new EmbedBuilder()
      .setTitle('❌ Application Declined')
      .setDescription(
        `Hi **${applicantName}**,\n\n` +
        `You have been declined from joining the **${applicationType}** carrier team.\n\n` +
        `**You may try again in 2 weeks.**\n\n` +
        `⚠️ **Important:** If you apply before 2 weeks, your application won't be seen and might cause you serious issues or you might get punished.`
      )
      .setColor(0xEF4444)
      .setFooter({ text: 'FxG Team' })
      .setTimestamp();

    await user.send({ embeds: [embed] });
    
    res.json({ 
      success: true, 
      message: `Career denial DM sent to ${user.tag}` 
    });
  } catch (error) {
    console.error('Error sending career denial:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API server running on port ${PORT}`);
});
