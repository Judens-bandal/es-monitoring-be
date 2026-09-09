import { Injectable } from '@nestjs/common';
import { NodeResourceStatsResponse } from '../interfaces/node-elasticsearch.interface';

const THRESHOLDS = {
  memWarning: 75,
  memCritical: 90,
  diskWarning: 50,
  diskCritical: 85,
  cpuWarning: 70,
  cpuCritical: 90,
  heapWarning: 75,
  heapCritical: 85,
};

function bytesToGB(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

function bytesToMB(bytes: number): string {
  return (bytes / 1024 ** 2).toFixed(0);
}

function statusLevel(value: number, warn: number, crit: number) {
  if (value >= crit) return { label: 'CRITICAL', emoji: '🔴', color: 0xe74c3c };
  if (value >= warn) return { label: 'WARNING', emoji: '🟡', color: 0xf1c40f };
  return { label: 'HEALTHY', emoji: '🟢', color: 0x2ecc71 };
}

function bar(percent: number, size = 12): string {
  const p = Math.min(100, Math.max(0, percent));
  const filled = Math.round((p / 100) * size);
  return '▓'.repeat(filled) + '░'.repeat(size - filled);
}

function worstColor(...colors: number[]): number {
  if (colors.includes(0xe74c3c)) return 0xe74c3c;
  if (colors.includes(0xf1c40f)) return 0xf1c40f;
  return 0x2ecc71;
}

@Injectable()
export class EsDiscordFormatterService {
  formatAlert(stats: NodeResourceStatsResponse): object {
    const { cluster } = stats;
    const node = stats.nodes[0];

    if (!node) {
      return {
        embeds: [
          {
            title: '🚨 Elasticsearch Alert',
            description: 'No node data available',
            color: 0xe74c3c,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    const mem = node.os.mem;
    const disk = node.fs.total;
    const heap = node.jvm.mem;
    const cpu = node.os.cpu.percent;
    const load1m = node.os.cpu.load_average?.['1m'] ?? 0;
    const load5m = node.os.cpu.load_average?.['5m'] ?? 0;
    const load15m = node.os.cpu.load_average?.['15m'] ?? 0;

    const diskUsed = disk.total_in_bytes - disk.available_in_bytes;

    const memS = statusLevel(
      mem.used_percent,
      THRESHOLDS.memWarning,
      THRESHOLDS.memCritical,
    );
    const diskS = statusLevel(
      disk.disk_used_percent,
      THRESHOLDS.diskWarning,
      THRESHOLDS.diskCritical,
    );
    const cpuS = statusLevel(
      cpu,
      THRESHOLDS.cpuWarning,
      THRESHOLDS.cpuCritical,
    );
    const heapS = statusLevel(
      heap.heap_used_percent,
      THRESHOLDS.heapWarning,
      THRESHOLDS.heapCritical,
    );

    const clusterS =
      cluster.status === 'red'
        ? { label: 'RED', emoji: '🔴', color: 0xe74c3c }
        : cluster.status === 'yellow'
          ? { label: 'YELLOW', emoji: '🟡', color: 0xf1c40f }
          : { label: 'GREEN', emoji: '🟢', color: 0x2ecc71 };

    const color = worstColor(
      clusterS.color,
      memS.color,
      diskS.color,
      cpuS.color,
      heapS.color,
    );

    return {
      username: 'ES Monitor',
      avatar_url:
        'https://www.elastic.co/static-res/images/elastic-logo-200.png',
      embeds: [
        {
          author: {
            name: 'ELASTICSEARCH MONITORING',
            icon_url:
              'https://www.elastic.co/static-res/images/elastic-logo-200.png',
          },
          title: `${clusterS.emoji}  ${node.node_name}`,
          description: [
            `> **Cluster**  ${clusterS.emoji} \`${clusterS.label}\``,
            `> **Node**  \`${node.type}\` · \`${node.node_status}\``,
            `> **Address**  \`${node.transport_address}\``,
          ].join('\n'),
          color,
          fields: [
            {
              name: '━━━━━━━━  SHARDS  ━━━━━━━━',
              value: [
                '```yaml',
                `Active:      ${cluster.active_shards}  (${cluster.active_shards_percent}%)`,
                `Primary:     ${cluster.active_primary_shards}`,
                `Unassigned:  ${cluster.unassigned_shards}  (replicas)`,
                '```',
              ].join('\n'),
              inline: false,
            },
            {
              name: `${memS.emoji}  MEMORY  ·  ${memS.label}`,
              value: [
                `\`${bar(mem.used_percent)}\`  **${mem.used_percent}%**`,
                '',
                ` Used   \`${bytesToGB(mem.used_in_bytes)} GB\``,
                ` Free   \`${bytesToMB(mem.free_in_bytes)} MB\` (${mem.free_percent}%)`,
                ` Total  \`${bytesToGB(mem.total_in_bytes)} GB\``,
              ].join('\n'),
              inline: true,
            },
            {
              name: `${heapS.emoji}  JVM HEAP  ·  ${heapS.label}`,
              value: [
                `\`${bar(heap.heap_used_percent)}\`  **${heap.heap_used_percent}%**`,
                '',
                ` Used  \`${bytesToGB(heap.heap_used_in_bytes)} GB\``,
                ` Max   \`${bytesToGB(heap.heap_max_in_bytes)} GB\``,
                ` Uptime \`${Math.floor((node.jvm.uptime_in_millis ?? 0) / 3600000)}h\``,
              ].join('\n'),
              inline: true,
            },
            { name: '\u200b', value: '\u200b', inline: false },
            {
              name: `${diskS.emoji}  DISK  ·  ${diskS.label}`,
              value: [
                `\`${bar(disk.disk_used_percent)}\`  **${disk.disk_used_percent}%**`,
                '',
                ` Used  \`${bytesToGB(diskUsed)} GB\``,
                ` Free  \`${bytesToGB(disk.available_in_bytes)} GB\``,
                ` Total \`${bytesToGB(disk.total_in_bytes)} GB\``,
              ].join('\n'),
              inline: true,
            },
            {
              name: `${cpuS.emoji}  CPU  ·  ${cpuS.label}`,
              value: [
                `\`${bar(cpu)}\`  **${cpu}%**`,
                '',
                ` System CPU`,
                ` Load 1m  \`${load1m}\``,
                ` Load 5m  \`${load5m}\``,
                ` Load 15m  \`${load15m}\``,
                ` ES CPU   \`${node.process.cpu.percent}%\``,
              ].join('\n'),
              inline: true,
            },
          ],
          footer: {
            text: `ES Monitor  •  cooldown 30 min  •  ${new Date().toLocaleString()}`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
