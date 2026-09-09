export interface EsNodeStats {
  node_name: string;
  os: {
    cpu: { percent: number };
    mem: {
      total_in_bytes: number;
      used_in_bytes: number;
      free_in_bytes: number;
      used_percent: number;
      free_percent: number;
    };
  };
  jvm: {
    mem: {
      heap_used_in_bytes: number;
      heap_max_in_bytes: number;
      heap_used_percent: number;
    };
  };
  fs: {
    total: {
      total_in_bytes: number;
      available_in_bytes: number;
      disk_used_percent: number;
    };
  };
}

export interface EsClusterStats {
  cluster: {
    cluster_name: string;
    status: 'green' | 'yellow' | 'red';
    active_primary_shards: number;
    active_shards: number;
    unassigned_shards: number;
    active_shards_percent: number;
  };
  nodes: EsNodeStats[];
}

export enum AlertSeverity {
  INFO = 3447003,
  WARNING = 16776960,
  ERROR = 15158332,
  CRITICAL = 10038562,
}
