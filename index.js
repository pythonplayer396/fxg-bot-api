
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Initialize Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Login to Discord
client.login(process.env.DISCORD_BOT_TOKEN);

client.once('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    bot: client.user?.tag || 'connecting...' 
  });
});

// Send interview DM
app.post('/send-interview-dm', async (req, res) => {
  // Check API key
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (apiKey !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { discordId, applicantName, applicationType } = req.body;

  if (!discordId || !applicantName || !applicationType) {
    return res.status(400).json({ 
      error: 'Missing required fields: discordId, applicantName, applicationType' 
    });
  }

  try {
    const user = await client.users.fetch(discordId);
    
    const embed = new EmbedBuilder()
      .setTitle('🎉 Interview Invitation')
      .setDescription(
        `Hi **${applicantName}**!\n\n` +
        `Congratulations! You've been selected for an interview for the **${applicationType}** position.\n\n` +
        `Our team will contact you soon with more details about the next steps.\n\n` +
        `Good luck! 🍀`
      )
      .setColor(0x8B5CF6)
      .setFooter({ text: 'FxG Team' })
      .setTimestamp();

    await user.send({ embeds: [embed] });
    
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

  const { discordId, applicantName, applicationType } = req.body;

  try {
    const user = await client.users.fetch(discordId);
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Application Approved!')
      .setDescription(
        `Hi **${applicantName}**!\n\n` +
        `Congratulations! Your application for the **${applicationType}** position has been **APPROVED**! 🎉\n\n` +
        `Welcome to the FxG team! We're excited to have you on board.\n\n` +
        `You'll receive further instructions soon.`
      )
      .setColor(0x10B981)
      .setFooter({ text: 'FxG Team' })
      .setTimestamp();

    await user.send({ embeds: [embed] });
    
    res.json({ 
      success: true, 
      message: `Approval DM sent to ${user.tag}` 
    });
  } catch (error) {
    console.error('Error sending DM:', error);
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

  const { discordId, applicantName, applicationType } = req.body;

  try {
    const user = await client.users.fetch(discordId);
    
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
      message: `Denial DM sent to ${user.tag}` 
    });
  } catch (error) {
    console.error('Error sending DM:', error);
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