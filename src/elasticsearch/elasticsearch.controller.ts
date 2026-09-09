import { Controller, Get } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { NodeSummaryDetail } from '../interfaces/node-elasticsearch.interface';

@Controller('elasticsearch')
export class ElasticsearchController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('node-resources')
  async getDashboard() {
    return await this.monitoringService.getNodeResourceStats();
  }

  @Get('node-detail')
  async getNodeDetail(): Promise<NodeSummaryDetail> {
    return this.monitoringService.getNodeSummaryDetail();
  }
}
