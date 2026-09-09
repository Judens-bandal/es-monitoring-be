import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import discordConfig from '../config/discord.config';
import { EsDiscordFormatterService } from './es-discord-formatter.service';
import { DiscordAlertsService } from './discord-alerts.service';

@Module({
  imports: [ConfigModule.forFeature(discordConfig)],
  providers: [DiscordAlertsService, EsDiscordFormatterService],
  exports: [EsDiscordFormatterService, DiscordAlertsService],
})
export class DiscordAlertsModule {}
