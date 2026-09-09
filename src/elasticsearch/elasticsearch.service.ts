import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { ElasticsearchConfig } from '../config/elasticsearch-config';
import { ElasticsearchInfo } from '../interfaces/elasticsearch-info.interface';

interface ElasticsearchConnectionConfig {
  node: string;
  username: string;
  password: string;
}

interface ElasticsearchConfigProvider {
  getConfig(): ElasticsearchConnectionConfig;
}

@Injectable()
export class ElasticsearchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client!: Client;

  constructor(private readonly elasticsearchConfig: ElasticsearchConfig) {}

  onModuleInit(): void {
    const configProvider = this
      .elasticsearchConfig as ElasticsearchConfigProvider;

    const { node, username, password } = configProvider.getConfig();

    this.client = new Client({
      node,
      auth: { username, password },
      requestTimeout: 10000,
      maxRetries: 2,
      pingTimeout: 3000,
    });

    this.testConnection()
      .then((info) =>
        this.logger.log(
          `Connected to Elasticsearch cluster "${info.cluster_name}" (version ${info.version.number})`,
        ),
      )
      .catch((error) =>
        this.logger.error(
          `Failed to connect to Elasticsearch at startup: ${this.getErrorMessage(error)}`,
        ),
      );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  getClient(): Client {
    return this.client;
  }

  async testConnection(): Promise<ElasticsearchInfo> {
    try {
      const response = await this.client.info<ElasticsearchInfo>();
      return response.body;
    } catch (error) {
      this.logger.error(
        `Elasticsearch connection test failed: ${this.getErrorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        `Cannot reach Elasticsearch cluster: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
