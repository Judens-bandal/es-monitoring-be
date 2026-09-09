import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { ElasticsearchService } from './elasticsearch/elasticsearch.service';
import { ElasticsearchConfig } from './config/elasticsearch-config';
import { ElasticsearchlogConfig } from './config/elasticsearchlog-config';
import { MonitoringService } from './elasticsearch/monitoring.service';
import { ElasticsearchlogService } from './elasticsearch/elasticsearchlog.service';
import { ElasticsearchController } from './elasticsearch/elasticsearch.controller';
import { EsDiscordFormatterService } from './descord-alerts/es-discord-formatter.service';
import { DiscordAlertsModule } from './descord-alerts/discord-alerts.module';
import { DiscordAlertsService } from './descord-alerts/discord-alerts.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env`,
    }),

    ScheduleModule.forRoot(),

    DiscordAlertsModule,
  ],

  controllers: [ElasticsearchController],

  providers: [
    EsDiscordFormatterService,
    DiscordAlertsService,
    ElasticsearchService,
    ElasticsearchConfig,
    ElasticsearchlogConfig,
    MonitoringService,
    ElasticsearchlogService,
  ],
})
export class AppModule {}
