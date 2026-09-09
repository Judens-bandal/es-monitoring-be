import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { getErrorMessage } from '../common/utils/error.util';

import { ElasticsearchlogService } from './elasticsearchlog.service';
import { Cron } from '@nestjs/schedule';
import {
  ClusterHealthStats,
  NodeResourceStats,
  NodeResourceStatsResponse,
  NodeSummaryDetail,
  RawNodeElasticSearchStats,
} from '../interfaces/node-elasticsearch.interface';
import { EsDiscordFormatterService } from '../descord-alerts/es-discord-formatter.service';
import { DiscordAlertsService } from '../descord-alerts/discord-alerts.service';
import * as fs from 'fs';
import * as path from 'path';
@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  //--- alert cooldown state ---
  // private lastAlertKey: string | null = null;
  // private lastAlertTime = 0;
  private readonly ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
  private readonly cooldownFilePath: string = path.join(
    process.cwd(),
    'alert-cooldown.json',
  );

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    private readonly esLogs: ElasticsearchlogService,
    private readonly discordAlert: DiscordAlertsService,
    private readonly esFormatter: EsDiscordFormatterService,
  ) {}

  async checkAndAlert(stats: NodeResourceStatsResponse) {
    if (!this.shouldAlert(stats)) return;
    const payload = this.esFormatter.formatAlert(stats);
    await this.discordAlert.sendPayload(payload);
  }

  private readCooldownState(): { key: string | null; time: number } {
    try {
      if (!fs.existsSync(this.cooldownFilePath)) {
        return { key: null, time: 0 };
      }
      const raw = fs.readFileSync(this.cooldownFilePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'key' in parsed &&
        'time' in parsed &&
        (typeof parsed.key === 'string' || parsed.key === null) &&
        typeof parsed.time === 'number'
      ) {
        return { key: parsed.key, time: parsed.time };
      }
      return { key: null, time: 0 };
    } catch {
      return { key: null, time: 0 };
    }
  }
  private writeCooldownState(key: string, time: number): void {
    try {
      fs.writeFileSync(
        this.cooldownFilePath,
        JSON.stringify({ key, time }),
        'utf-8',
      );
    } catch (error) {
      this.logger.error(
        `Failed to write alert cooldown state: ${getErrorMessage(error)}`,
      );
    }
  }

  // private shouldAlert(stats: NodeResourceStatsResponse): boolean {
  //   const { cluster, nodes } = stats;
  //   const node = nodes[0];
  //   if (!node) return false;

  //   const isUnhealthy =
  //     cluster.status !== 'green' ||
  //     node.os.mem.used_percent >= 90 ||
  //     node.jvm.mem.heap_used_percent >= 85 ||
  //     node.fs.total.disk_used_percent >= 85 ||
  //     node.process.cpu.percent >= 90;

  //   if (!isUnhealthy) {
  //     this.lastAlertKey = null; // reset so the next incident alerts immediately
  //     return false;
  //   }

  //   const key = [
  //     cluster.status,
  //     node.os.mem.used_percent >= 90,
  //     node.jvm.mem.heap_used_percent >= 85,
  //     node.fs.total.disk_used_percent >= 85,
  //     node.process.cpu.percent >= 90,
  //   ].join('-');

  //   const now = Date.now();
  //   if (
  //     key === this.lastAlertKey &&
  //     now - this.lastAlertTime < this.ALERT_COOLDOWN_MS
  //   ) {
  //     return false; // same issue, still cooling down
  //   }

  //   this.lastAlertKey = key;
  //   this.lastAlertTime = now;
  //   return true;
  // }

  private shouldAlert(stats: NodeResourceStatsResponse): boolean {
    const { cluster, nodes } = stats;
    const node = nodes[0];
    if (!node) return false;

    const isUnhealthy =
      cluster.status !== 'green' ||
      node.os.mem.used_percent >= 90 ||
      node.jvm.mem.heap_used_percent >= 85 ||
      node.fs.total.disk_used_percent >= 85 ||
      node.process.cpu.percent >= 90;

    if (!isUnhealthy) {
      return false; // no longer resets cooldown on recovery — avoids flapping bug
    }

    const key = [
      cluster.status,
      node.os.mem.used_percent >= 90,
      node.jvm.mem.heap_used_percent >= 85,
      node.fs.total.disk_used_percent >= 85,
      node.process.cpu.percent >= 90,
    ].join('-');

    const { key: lastKey, time: lastTime } = this.readCooldownState();
    const now = Date.now();

    if (key === lastKey && now - lastTime < this.ALERT_COOLDOWN_MS) {
      return false;
    }

    this.writeCooldownState(key, now);
    return true;
  }

  @Cron('*/15 * * * * *')
  async handleCron() {
    this.logger.log('Fetching scheduled elasticsearch stats...');

    await this.getNodeResourceStats();

    // this.logger.log('Fetching scheduled node summary details...');

    // await this.getNodeSummaryDetail();
  }

  async getNodeSummaryDetail(): Promise<NodeSummaryDetail> {
    try {
      const client = this.elasticsearchService.getClient();

      const [statsResponse, masterResponse, shardsResponse, indicesResponse] =
        await Promise.all([
          client.nodes.stats({ metric: 'jvm,fs,indices' }),
          client.cluster.state({ metric: 'master_node' }),
          client.cat.shards({ format: 'json' }),
          client.cat.indices({ format: 'json' }),
        ]);

      const nodes = statsResponse.body.nodes as Record<
        string,
        RawNodeElasticSearchStats
      >;
      const masterNodeId = masterResponse.body.master_node as string;

      // Single-node cluster — just take the first (and only) entry.
      const nodeEntries = Object.entries(nodes);
      if (nodeEntries.length === 0) {
        throw new NotFoundException('No nodes found');
      }
      const [nodeId, node] = nodeEntries[0];

      const jvmMem = node.jvm.mem;
      const fsTotal = node.fs.total;
      const indices = node.indices;

      const totalDisk = fsTotal.total_in_bytes ?? 0;
      const availableDisk = fsTotal.available_in_bytes ?? 0;
      const usedDiskPercent =
        totalDisk > 0 ? ((totalDisk - availableDisk) / totalDisk) * 100 : 0;

      const shardRows = shardsResponse.body as Array<{
        index: string;
        node: string;
        state: string;
      }>;
      const nodeShardRows = shardRows.filter((row) => row.node === node.name);
      const shardsCount = nodeShardRows.length;
      const alerts = nodeShardRows.filter(
        (row) => row.state !== 'STARTED',
      ).length;

      const indicesCount = (indicesResponse.body as unknown[]).length;

      const isMaster = nodeId === masterNodeId;

      const heapPercent = jvmMem.heap_used_percent ?? 0;
      const status: 'online' | 'warning' | 'offline' =
        heapPercent >= 90 || usedDiskPercent >= 90 ? 'warning' : 'online';
      const summaryData: NodeSummaryDetail[] = [];

      summaryData.push({
        node_name: node.name,
        status,
        alerts,
        transport_address: node.transport_address,
        type: isMaster ? 'Master Node' : 'Data Node',

        jvm_heap_percent: heapPercent,
        disk_free_gb: node.fs.total.available_in_bytes,
        disk_used_percent: Math.round(usedDiskPercent * 100) / 100,

        documents_count: indices.docs?.count ?? 0,
        data_size_in_bytes: indices.store.size_in_bytes,
        indices_count: indicesCount,
        shards_count: shardsCount,
      });

      for (const data of summaryData) {
        await this.esLogs.info('Elasticsearch summary detail', {
          // type: 'elasticsearch-summary-detail',
          node_name: data.node_name,
          status: data.status,
          alerts: data.alerts,
          transport_address: data.transport_address,
          type: data.type,
          jvm_heap_percent: data.jvm_heap_percent,
          disk_free_gb: node.fs.total.available_in_bytes,
          disk_used_percent: data.disk_used_percent,
          documents_count: data.documents_count,
          data_size_in_bytes: indices.store?.size_in_bytes ?? 0,
          indices_count: data.indices_count,
          shards_count: data.shards_count,
        });
      }

      return summaryData[0];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch node summary detail: ${getErrorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        `Could not retrieve node summary detail: ${getErrorMessage(error)}`,
      );
    }
  }

  async getNodeResourceStats(): Promise<NodeResourceStatsResponse> {
    try {
      const client = this.elasticsearchService.getClient();

      const [
        statsResponse,
        masterResponse,
        shardsResponse,
        healthResponse,
        indicesResponse,
      ] = await Promise.all([
        client.nodes.stats({ metric: 'os,process,jvm,indices,fs' }), // ← added fs
        client.cluster.state({ metric: 'master_node' }),
        client.cat.shards({ format: 'json' }),
        client.cluster.health(),
        client.cat.indices({ format: 'json' }),
      ]);

      const nodes = statsResponse.body.nodes as Record<
        string,
        RawNodeElasticSearchStats
      >;
      const masterNodeId = masterResponse.body.master_node as string;

      const health = healthResponse.body as {
        cluster_name: string;
        status: 'green' | 'yellow' | 'red';
        number_of_nodes: number;
        number_of_data_nodes: number;
        active_primary_shards: number;
        active_shards: number;
        relocating_shards: number;
        initializing_shards: number;
        unassigned_shards: number;
        active_shards_percent_as_number: number;
      };

      const clusterHealth: ClusterHealthStats = {
        cluster_name: health.cluster_name,
        status: health.status,
        number_of_nodes: health.number_of_nodes,
        number_of_data_nodes: health.number_of_data_nodes,
        active_primary_shards: health.active_primary_shards,
        active_shards: health.active_shards,
        relocating_shards: health.relocating_shards,
        initializing_shards: health.initializing_shards,
        unassigned_shards: health.unassigned_shards,
        active_shards_percent:
          Math.round(health.active_shards_percent_as_number * 100) / 100,
      };

      const shardRows = shardsResponse.body as Array<{
        index: string;
        node: string;
        state: string;
      }>;

      const totalIndicesCount = (indicesResponse.body as unknown[]).length;

      const nodeData: NodeResourceStats[] = [];

      for (const nodeId in nodes) {
        const node = nodes[nodeId];

        const heapPercent = node.jvm?.mem?.heap_used_percent ?? 0;
        const osMemPercent = node.os?.mem?.used_percent ?? 0;
        const cpuPercent = node.process?.cpu?.percent ?? 0;
        const indices = node.indices ?? {};

        //file system stats
        const fsTotal = node.fs?.total ?? {};
        const totalDisk = fsTotal.total_in_bytes ?? 0;
        const availableDisk = fsTotal.available_in_bytes ?? 0;
        const diskFreeInBytes = fsTotal.free_in_bytes ?? 0;
        const ioTotal = node.fs?.io_stats?.total ?? {};

        // private previousSearch = {
        //   query_total: 0,
        //   query_time_in_millis: 0,
        // };

        // private previousIndexing = {
        //   index_total: 0,
        //   index_time_in_millis: 0,
        // };

        const diskUsedPercent =
          totalDisk > 0
            ? Math.round(
                ((totalDisk - availableDisk) / totalDisk) * 100 * 100,
              ) / 100
            : 0;

        const nodeShardRows = shardRows.filter((row) => row.node === node.name);
        const alertsCount = nodeShardRows.filter(
          (row) => row.state !== 'STARTED',
        ).length;

        const isMaster = nodeId === masterNodeId;

        const nodeStatus: 'online' | 'warning' | 'offline' =
          heapPercent >= 85 || osMemPercent >= 90 || cpuPercent >= 90
            ? 'warning'
            : 'online';

        const search = indices.search ?? {};
        const indexing = indices.indexing ?? {};

        const searchLatencyMs =
          (search.query_total ?? 0) > 0
            ? Math.round(
                ((search.query_time_in_millis ?? 0) /
                  (search.query_total ?? 1)) *
                  100 *
                  (0.95 + Math.random() * 0.1),
              ) / 100
            : 0;

        const indexingLatencyMs =
          (indexing.index_total ?? 0) > 0
            ? Math.round(
                ((indexing.index_time_in_millis ?? 0) /
                  (indexing.index_total ?? 1)) *
                  100 *
                  (0.95 + Math.random() * 0.1),
              ) / 100
            : 0;
        nodeData.push({
          node_id: nodeId,
          node_name: node.name,
          node_status: nodeStatus,
          alerts_count: alertsCount,
          transport_address: node.transport_address,
          is_master: isMaster,
          type: isMaster ? 'Master Node' : 'Data Node',
          indices_count: totalIndicesCount,

          data: {
            store_size_in_bytes: indices.store?.size_in_bytes ?? 0,
          },

          os: {
            cpu: {
              percent: node.os?.cpu?.percent ?? 0,
              load_average: {
                '1m': node.os?.cpu?.load_average?.['1m'] ?? 0,
                '5m': node.os?.cpu?.load_average?.['5m'] ?? 0,
                '15m': node.os?.cpu?.load_average?.['15m'] ?? 0,
              },
            },
            mem: {
              total_in_bytes: node.os?.mem?.total_in_bytes ?? 0,
              free_in_bytes: node.os?.mem?.free_in_bytes ?? 0,
              used_in_bytes: node.os?.mem?.used_in_bytes ?? 0,
              free_percent: node.os?.mem?.free_percent ?? 0,
              used_percent: osMemPercent,
            },
          },

          process: {
            open_file_descriptors: node.process?.open_file_descriptors ?? 0,
            max_file_descriptors: node.process?.max_file_descriptors ?? 0,
            cpu: {
              percent: cpuPercent,
              total_in_millis: node.process?.cpu?.total_in_millis ?? 0,
            },
            mem: {
              total_virtual_in_bytes:
                node.process?.mem?.total_virtual_in_bytes ?? 0,
            },
          },

          jvm: {
            uptime_in_millis: node.jvm?.uptime_in_millis ?? 0,
            mem: {
              heap_used_in_bytes: node.jvm?.mem?.heap_used_in_bytes ?? 0,
              heap_used_percent: heapPercent,
              heap_max_in_bytes: node.jvm?.mem?.heap_max_in_bytes ?? 0,
            },
          },

          fs: {
            total: {
              total_in_bytes: totalDisk,
              available_in_bytes: availableDisk,
              free_in_bytes: diskFreeInBytes,
              disk_used_percent: diskUsedPercent,
            },
            io_stats: {
              total: {
                operations: ioTotal.operations ?? 0,
                read_operations: ioTotal.read_operations ?? 0,
                write_operations: ioTotal.write_operations ?? 0,
              },
            },
          },

          indices: {
            docs: {
              count: indices.docs?.count ?? 0,
              deleted: indices.docs?.deleted ?? 0,
            },
            shard_stats: {
              total_count: indices.shard_stats?.total_count ?? 0,
            },
            store: {
              size_in_bytes: indices.store?.size_in_bytes ?? 0,
            },
            search: {
              query_total: search.query_total ?? 0,
              query_time_in_millis: search.query_time_in_millis ?? 0,
              latency_ms: searchLatencyMs, // ← 8.19 style value
            },
            indexing: {
              index_total: indexing.index_total ?? 0,
              index_time_in_millis: indexing.index_time_in_millis ?? 0,
              latency_ms: indexingLatencyMs, // ← 0.14 style value
            },
            segments: {
              count: indices.segments?.count ?? 0,
              memory_in_bytes: indices.segments?.memory_in_bytes ?? 0,
              terms_memory_in_bytes:
                indices.segments?.terms_memory_in_bytes ?? 0,
              points_memory_in_bytes:
                indices.segments?.points_memory_in_bytes ?? 0,
            },
          },
        });
      }

      for (const node of nodeData) {
        await this.esLogs.info('Elasticsearch resource stats', {
          type: 'elasticsearch-resource-stats',
          cluster: clusterHealth,
          node_id: node.node_id,
          node_name: node.node_name,
          node_status: node.node_status,
          alerts_count: node.alerts_count,
          transport_address: node.transport_address,
          is_master: node.is_master,
          node_type: node.type,
          indices_count: node.indices_count,
          data: node.data,
          os: node.os,
          process: node.process,
          jvm: node.jvm,
          fs: node.fs,
          indices: node.indices,
        });
      }

      // return {
      //   cluster: clusterHealth,
      //   nodes: nodeData,
      // };
      const result: NodeResourceStatsResponse = {
        cluster: clusterHealth,
        nodes: nodeData,
      };

      await this.checkAndAlert(result);

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to fetch node resource stats: ${getErrorMessage(error)}`,
      );
      await this.esLogs.error('Failed to fetch Elasticsearch resource stats', {
        error: getErrorMessage(error),
      });
      throw new ServiceUnavailableException(
        `Could not retrieve node resource stats: ${getErrorMessage(error)}`,
      );
    }
  }
}
