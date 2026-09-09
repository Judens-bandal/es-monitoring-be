import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ESLogConfig {
  node: string;
  username: string;
  password: string;
  requestTimeout: number;
  pingTimeout: number;
  maxRetries: number;
  indexPrefix: string;
}

@Injectable()
export class ElasticsearchlogConfig {
  private readonly logger = new Logger(ElasticsearchlogConfig.name);
  private readonly config: ESLogConfig;

  constructor(private readonly configService: ConfigService) {
    try {
      const node = this.configService.get<string>(
        'MONITORING_ELASTICSEARCH_URL',
      );
      const username = this.configService.get<string>(
        'MONITORING_ELASTICSEARCH_USERNAME',
      );
      const password = this.configService.get<string>(
        'MONITORING_ELASTICSEARCH_PASSWORD',
      );

      if (!node) throw new Error('Missing MONITORING_ELASTICSEARCH_URL');
      if (!username)
        throw new Error('Missing MONITORING_ELASTICSEARCH_USERNAME');
      if (!password)
        throw new Error('Missing MONITORING_ELASTICSEARCH_PASSWORD');

      this.config = {
        node,
        username,
        password,
        requestTimeout: 30000,
        pingTimeout: 3000,
        maxRetries: 3,
        indexPrefix: 'elasticsearch-monitoring',
      };
    } catch (error) {
      this.logger.error('Error initializing ElasticsearchlogConfigService');
      throw error;
    }
  }

  getConfig(): ESLogConfig {
    return this.config;
  }
}
