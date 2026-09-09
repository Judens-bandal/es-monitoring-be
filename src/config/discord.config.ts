import { registerAs } from '@nestjs/config';

export default registerAs('discord', () => ({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  alertsEnabled: process.env.DISCORD_ALERTS_ENABLED === 'true',
}));
