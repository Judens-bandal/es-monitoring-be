import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AlertSeverity } from './interfaces/cluster-stats.interface';
import { getErrorMessage } from '../common/utils/error.util';

@Injectable()
export class DiscordAlertsService {
  private readonly logger = new Logger(DiscordAlertsService.name);
  private readonly webhookUrl: string;
  private readonly alertsEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl =
      this.configService.get<string>('discord.webhookUrl') ?? '';
    this.alertsEnabled =
      this.configService.get<boolean>('discord.alertsEnabled') ?? false;
  }

  async sendRawMessage(content: string): Promise<void> {
    if (!this.canSend()) return;
    try {
      await axios.post(this.webhookUrl, { content });
    } catch (error) {
      this.logger.error(
        `Error sending message to Discord: ${getErrorMessage(error)}`,
      );
    }
  }

  async sendPayload(payload: object): Promise<void> {
    if (!this.canSend()) return;
    try {
      await axios.post(this.webhookUrl, payload);
    } catch (error) {
      this.logger.error(
        `Error sending payload to Discord: ${getErrorMessage(error)}`,
      );
    }
  }

  async sendEmbed(
    title: string,
    description: string,
    severity: AlertSeverity = AlertSeverity.ERROR,

    fields?: { name: string; value: string; inline?: boolean }[],
  ): Promise<void> {
    if (!this.canSend()) return;
    try {
      await axios.post(this.webhookUrl, {
        embeds: [
          {
            title,
            description,
            color: severity,
            fields: fields ?? [],
            timestamp: new Date().toISOString(),
            footer: { text: 'ES Monitoring' },
          },
        ],
      });
    } catch (error) {
      this.logger.error(
        `Failed to send Discord embed: ${getErrorMessage(error)}`,
      );
    }
  }

  private canSend(): boolean {
    if (!this.alertsEnabled) {
      this.logger.debug('Discord alerts disabled via config, skipping');
      return false;
    }
    if (!this.webhookUrl) {
      this.logger.warn('DISCORD_WEBHOOK_URL not configured, skipping alert');
      return false;
    }
    return true;
  }
}
