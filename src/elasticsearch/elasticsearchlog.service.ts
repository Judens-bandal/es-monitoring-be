import { Client } from '@elastic/elasticsearch';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as os from 'os';
import { ElasticsearchlogConfig } from '../config/elasticsearchlog-config';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

let _meta: Record<string, unknown> = {};
export const getMeta = (): Record<string, unknown> => ({ ..._meta });
@Injectable()
export class ElasticsearchlogService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchlogService.name);
  private esClient!: Client;
  private readonly serviceMeta: Record<string, unknown> = {};

  constructor(private readonly logConfig: ElasticsearchlogConfig) {}

  onModuleInit() {
    const {
      node,
      username,
      password,
      requestTimeout,
      pingTimeout,
      maxRetries,
    } = this.logConfig.getConfig();

    this.esClient = new Client({
      node,
      auth: { username, password },
      requestTimeout,
      pingTimeout,
      maxRetries,
    });

    Object.assign(this.serviceMeta, {
      application: 'elasticsearch-monitoring',
      environment: process.env.NODE_ENV,
      host: { name: os.hostname(), system: os.platform() },
    });
    _meta = { ...this.serviceMeta };

    void this.ensureIndex(this.logConfig.getConfig().indexPrefix);
  }

  private async ensureIndex(indexPrefix: string): Promise<void> {
    const index = this.getIndexName(indexPrefix);
    try {
      const exists = await this.esClient.indices.exists({ index });
      if (!exists.body) {
        await this.esClient.indices.create({
          index,
          body: {
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,
            },
          },
        });
        this.logger.log(`Created index: ${index}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to ensure index ${index}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async log(
    level: LogLevel,
    message: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    if (!this.esClient) {
      this.logger.warn('ES client not initialized, dropping log');
      return;
    }

    const document = {
      '@timestamp': new Date().toISOString(),
      severity: level,
      message,
      ...this.serviceMeta,
      ...metadata,
    };

    try {
      await this.esClient.index({
        index: this.getIndexName(this.logConfig.getConfig().indexPrefix),
        body: document,
      });
    } catch (error) {
      this.logger.error(
        `Failed to write log to Elasticsearch (level=${level}, message=${message})`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  async info(
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.log('info', message, metadata);
  }

  async warn(
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.log('warn', message, metadata);
  }

  async error(
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.log('error', message, metadata);
  }

  async debug(
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.log('debug', message, metadata);
  }

  private getIndexName(prefix: string): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    return `${prefix}-${date}`;
  }
}
