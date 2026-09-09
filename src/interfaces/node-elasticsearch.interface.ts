export interface ClusterHealthStats {
  cluster_name: string;
  status: 'green' | 'yellow' | 'red';
  number_of_nodes: number;
  number_of_data_nodes: number;
  active_primary_shards: number;
  active_shards: number;
  relocating_shards: number;
  initializing_shards: number;
  unassigned_shards: number;
  active_shards_percent: number;
}

export interface RawNodeElasticSearchStats {
  name: string;
  transport_address: string;
  jvm: {
    uptime_in_millis: number;
    mem: {
      heap_used_percent: number;
      heap_used_in_bytes: number;
      heap_max_in_bytes: number;
    };
  };
  os: {
    cpu: {
      percent: number;
      load_average: {
        '1m': number;
        '5m': number;
        '15m': number;
      };
    };
    mem: {
      total_in_bytes: number;
      free_in_bytes: number;
      used_in_bytes: number;
      free_percent: number;
      used_percent: number;
    };
  };
  process: {
    open_file_descriptors: number;
    max_file_descriptors: number;
    cpu: {
      percent: number;
      total_in_millis: number;
    };
    mem: {
      total_virtual_in_bytes: number;
    };
  };
  fs: {
    total: {
      total_in_bytes: number;
      available_in_bytes: number;
      free_in_bytes: number;
      disk_used_percent: number;
    };
    io_stats: {
      total: {
        operations: number;
        read_operations: number;
        write_operations: number;
      };
    };
  };
  indices: {
    docs: {
      count: number;
      deleted: number;
    };
    shard_stats: {
      total_count: number;
    };
    store: { size_in_bytes: number };
    search: {
      query_total: number;
      query_time_in_millis: number;
      latency_ms: number; // ← add
    };
    indexing: {
      index_total: number;
      index_time_in_millis: number;
      latency_ms: number; // ← add
    };
    segments: {
      count: number;
      memory_in_bytes: number;
      terms_memory_in_bytes: number;
      points_memory_in_bytes: number;
    };
  };
}

export interface NodeResourceStats {
  node_id: string;
  node_name: string;
  node_status: 'online' | 'warning' | 'offline';
  alerts_count: number;
  transport_address: string;
  is_master: boolean;
  type: 'Master Node' | 'Data Node';
  indices_count: number; // cluster-wide, verified via _cat/indices — not per-node data from _nodes/stats

  data: {
    store_size_in_bytes: number;
  };

  os: {
    cpu: {
      percent: number;
      load_average: {
        '1m': number;
        '5m': number;
        '15m': number;
      };
    };
    mem: {
      total_in_bytes: number;
      free_in_bytes: number;
      used_in_bytes: number;
      free_percent: number;
      used_percent: number;
    };
  };
  process: {
    open_file_descriptors: number;
    max_file_descriptors: number;
    cpu: {
      percent: number;
      total_in_millis: number;
    };
    mem: {
      total_virtual_in_bytes: number;
    };
  };
  jvm: {
    uptime_in_millis: number;
    mem: {
      heap_used_in_bytes: number;
      heap_used_percent: number;
      heap_max_in_bytes: number;
    };
  };
  fs: {
    total: {
      total_in_bytes: number;
      available_in_bytes: number;
      free_in_bytes: number;
      disk_used_percent: number;
    };
    io_stats: {
      total: {
        operations: number;
        read_operations: number;
        write_operations: number;
      };
    };
  };
  indices: {
    docs: {
      count: number;
      deleted: number;
    };
    shard_stats: {
      total_count: number;
    };
    store: { size_in_bytes: number };
    search: {
      query_total: number;
      query_time_in_millis: number;
      latency_ms: number; // ← add
    };
    indexing: {
      index_total: number;
      index_time_in_millis: number;
      latency_ms: number; // ← add
    };
    segments: {
      count: number;
      memory_in_bytes: number;
      terms_memory_in_bytes: number;
      points_memory_in_bytes: number;
    };
  };
}

export interface NodeResourceStatsResponse {
  cluster: ClusterHealthStats;
  nodes: NodeResourceStats[];
}

export interface NodeTableStats {
  name: string;
  transport_address: string;
  alerts: number | string;
  status: 'online' | 'warning' | 'offline';
  shards: number;
  cpu_usage_percent: number;
  load_average_1m: number;
  jvm_heap_percent: number;
  disk_free_gb: number;
  disk_used_percent: number;
}

/**
 * Detail view for a single node, returned by GET /monitoring/node-detail/:nodeName
 * — the "click a row in the node table" destination page.
 */
export interface NodeSummaryDetail {
  node_name: string;
  status: 'online' | 'warning' | 'offline';
  alerts: number;
  transport_address: string;
  type: 'Master Node' | 'Data Node';

  jvm_heap_percent: number;
  disk_free_gb: number;
  disk_used_percent: number;

  documents_count: number;
  data_size_in_bytes: number;

  indices_count: number;
  shards_count: number;
}
