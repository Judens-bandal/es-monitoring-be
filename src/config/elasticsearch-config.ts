import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ESConfig {
  node: string;
  username: string;
  password: string;
}

@Injectable()
export class ElasticsearchConfig {
  private readonly logger = new Logger(ElasticsearchConfig.name);
  private readonly config: ESConfig;

  constructor(private readonly configservice: ConfigService) {
    try {
      const node = this.configservice.get<string>('ELASTICSEARCH_URL');
      const username = this.configservice.get<string>('ELASTICSEARCH_USERNAME');
      const password = this.configservice.get<string>('ELASTICSEARCH_PASSWORD');

      if (!node) throw new Error('Missing ELASTICSEARCH_URL');
      if (!username) throw new Error('Missing ELASTICSEARCH_USERNAME');
      if (!password) throw new Error('Missing ELASTICSEARCH_PASSWORD');

      this.config = { node, username, password };
    } catch (error) {
      this.logger.error('Error initializing ElasticsearchConfig');
      throw error;
    }
  }

  getConfig(): ESConfig {
    return this.config;
  }
}
