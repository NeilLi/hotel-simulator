/**
 * SeedCore API Client Service
 * 
 * Provides a TypeScript client for interacting with the SeedCore API.
 * Supports task creation, task inspection, facts management, and health checks.
 * 
 * Based on SeedCore CLI v2.5 (multimodal support)
 * 
 * @example
 * ```typescript
 * import { seedcoreService } from './services/seedcoreService';
 * 
 * // Create a query task
 * const task = await seedcoreService.createQuery("Analyze energy usage");
 * 
 * // Create a device action
 * await seedcoreService.createDeviceAction("on", "light", { room: "1203" });
 * 
 * // Create a voice task with multimodal envelope
 * await seedcoreService.createVoiceTask(
 *   "Turn off the lights",
 *   "s3://hotel-assets/audio/clip_99.wav",
 *   { confidence: 0.98, location_context: "lobby" }
 * );
 * 
 * // List tasks with filters
 * const tasks = await seedcoreService.listTasks({
 *   status: "completed",
 *   type: "action",
 *   since: "24h",
 *   limit: 10
 * });
 * 
 * // Search tasks
 * const results = await seedcoreService.searchTasks("energy");
 * 
 * // Check health
 * const health = await seedcoreService.checkHealth();
 * ```
 */

// ------------------- Types -------------------

export type TaskType = "query" | "action" | "graph" | "maintenance" | "chat";
export type TaskStatus = "queued" | "running" | "completed" | "failed";

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  description: string;
  params?: Record<string, any>;
  domain?: string;
  result?: any;
  error?: string;
  drift_score?: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskListResponse {
  items: Task[];
  total: number;
}

export interface Fact {
  id: string;
  text: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export interface ReadinessResponse {
  status: string;
  deps?: Record<string, string>;
}

export interface MultimodalVoice {
  source: "voice";
  media_uri: string;
  transcription: string;
  transcription_engine?: string;
  confidence?: number;
  duration_seconds?: number;
  language?: string;
  location_context?: string;
  is_real_time?: boolean;
  ttl_seconds?: number;
}

export interface MultimodalVision {
  source: "vision";
  media_uri: string;
  scene_description: string;
  detection_engine?: string;
  confidence?: number;
  timestamp?: string;
  camera_id?: string;
  location_context?: string;
  is_real_time?: boolean;
  ttl_seconds?: number;
  parent_stream_id?: string;
  detected_objects?: any;
}

export interface CreateTaskOptions {
  type: TaskType;
  description: string;
  params?: Record<string, any>;
  domain?: string;
  run_immediately?: boolean;
}

export interface TaskFilters {
  status?: TaskStatus;
  type?: TaskType;
  since?: string; // e.g., "1h", "24h", "2d", "YYYY-MM-DD"
  limit?: number;
}

// ------------------- Client Class -------------------

class SeedCoreService {
  private apiBase: string;
  private apiV1Base: string;

  constructor() {
    // Support SEEDCORE_API or VITE_SEEDCORE_API env vars, default to localhost
    // In browser context, process.env is defined by Vite (see vite.config.ts)
    // In Node.js context, process.env is available directly
    const apiUrl = 
      (typeof process !== 'undefined' && process.env?.SEEDCORE_API) ||
      (typeof process !== 'undefined' && process.env?.VITE_SEEDCORE_API) ||
      "http://127.0.0.1:8002";
    this.apiBase = apiUrl;
    this.apiV1Base = `${this.apiBase}/api/v1`;
  }

  /**
   * Parse time string like "1h", "24h", "2d", "30m", or ISO date "YYYY-MM-DD"
   */
  private parseSince(val: string): Date | null {
    if (!val) return null;
    
    const trimmed = val.trim().toLowerCase();
    const match = trimmed.match(/^(\d+)([smhd])$/);
    
    if (match) {
      const n = parseInt(match[1], 10);
      const unit = match[2];
      const now = new Date();
      const deltaMs = {
        s: n * 1000,
        m: n * 60 * 1000,
        h: n * 60 * 60 * 1000,
        d: n * 24 * 60 * 60 * 1000,
      }[unit];
      return new Date(now.getTime() - deltaMs);
    }
    
    // Try ISO date
    try {
      return new Date(trimmed);
    } catch {
      return null;
    }
  }

  /**
   * Format datetime for display
   */
  private formatDateTime(isoString?: string): string {
    if (!isoString) return "N/A";
    try {
      const dt = new Date(isoString);
      return dt.toLocaleString();
    } catch {
      return isoString;
    }
  }

  /**
   * Make API request with error handling
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<T> {
    const url = `${this.apiV1Base}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Request failed: ${String(error)}`);
    }
  }

  // ------------------- Health Checks -------------------

  /**
   * Check API health status
   */
  async checkHealth(): Promise<HealthResponse> {
    try {
      const response = await fetch(`${this.apiBase}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check API readiness (including database connectivity)
   */
  async checkReadiness(): Promise<ReadinessResponse> {
    try {
      const response = await fetch(`${this.apiBase}/readyz`);
      if (!response.ok) {
        throw new Error(`Readiness check failed: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(`Readiness check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ------------------- Task Creation -------------------

  /**
   * Create a task
   */
  async createTask(options: CreateTaskOptions): Promise<Task> {
    const payload = {
      type: options.type,
      description: options.description,
      params: options.params || {},
      run_immediately: options.run_immediately !== false, // default true
      ...(options.domain && { domain: options.domain }),
    };

    return this.request<Task>("POST", "/tasks", payload);
  }

  /**
   * Create a QUERY task (reasoning, analysis, planning)
   */
  async createQuery(description: string, params?: Record<string, any>): Promise<Task> {
    return this.createTask({
      type: "query",
      description,
      params: params || { task_description: description },
    });
  }

  /**
   * Create an ACTION task for device control
   */
  async createDeviceAction(
    action: "on" | "off",
    deviceType: string,
    params?: Record<string, any>
  ): Promise<Task> {
    const description = `${action} ${deviceType}`;
    return this.createTask({
      type: "action",
      description,
      domain: "device",
      params: {
        domain: "device",
        action,
        device: deviceType,
        ...params,
      },
    });
  }

  /**
   * Create an ACTION task for robot control
   */
  async createRobotAction(
    action: "dispatch" | "stop",
    task: string,
    params?: Record<string, any>
  ): Promise<Task> {
    const description = `robot ${action} ${task}`;
    return this.createTask({
      type: "action",
      description,
      domain: "robot",
      params: {
        domain: "robot",
        action,
        task,
        ...params,
      },
    });
  }

  /**
   * Create a GRAPH task for knowledge graph operations
   */
  async createGraphTask(
    operation: string,
    args?: string[],
    params?: Record<string, any>
  ): Promise<Task> {
    const description = operation + (args ? ` ${args.join(" ")}` : "");
    return this.createTask({
      type: "graph",
      description,
      params: {
        operation,
        args: args || [],
        ...params,
      },
    });
  }

  /**
   * Create a MAINTENANCE task for system operations
   */
  async createMaintenanceTask(
    operation: string,
    args?: string[],
    params?: Record<string, any>
  ): Promise<Task> {
    const description = operation + (args ? ` ${args.join(" ")}` : "");
    return this.createTask({
      type: "maintenance",
      description,
      params: {
        operation,
        args: args || [],
        ...params,
      },
    });
  }

  /**
   * Create a CHAT task with multimodal voice envelope
   */
  async createVoiceTask(
    transcription: string,
    mediaUri: string,
    options?: Partial<MultimodalVoice>
  ): Promise<Task> {
    const multimodal: MultimodalVoice = {
      source: "voice",
      media_uri: mediaUri,
      transcription,
      ...options,
    };

    return this.createTask({
      type: "chat",
      description: transcription,
      params: {
        multimodal,
        chat: {
          message: transcription,
        },
      },
    });
  }

  /**
   * Create an ACTION or QUERY task with multimodal vision envelope
   */
  async createVisionTask(
    sceneDescription: string,
    mediaUri: string,
    type: "action" | "query" = "action",
    options?: Partial<MultimodalVision>
  ): Promise<Task> {
    const multimodal: MultimodalVision = {
      source: "vision",
      media_uri: mediaUri,
      scene_description: sceneDescription,
      ...options,
    };

    return this.createTask({
      type,
      description: sceneDescription,
      params: {
        multimodal,
      },
    });
  }

  // ------------------- Task Inspection -------------------

  /**
   * List all tasks with optional filters
   */
  async listTasks(filters?: TaskFilters): Promise<TaskListResponse> {
    const tasks = await this.request<TaskListResponse>("GET", "/tasks");
    
    let filtered = tasks.items;
    
    // Apply filters
    if (filters?.status) {
      const wantStatus = filters.status.toLowerCase();
      filtered = filtered.filter((t) => {
        const status = (t.status || "").toLowerCase();
        return status.startsWith(wantStatus) || status === wantStatus;
      });
    }
    
    if (filters?.type) {
      const wantType = filters.type.toLowerCase();
      filtered = filtered.filter((t) => {
        const type = (t.type || "").toLowerCase();
        return type === wantType || type.includes(wantType);
      });
    }
    
    if (filters?.since) {
      const sinceDate = this.parseSince(filters.since);
      if (sinceDate) {
        filtered = filtered.filter((t) => {
          const updatedAt = t.updated_at || t.created_at || "";
          if (!updatedAt) return true;
          try {
            const taskDate = new Date(updatedAt);
            return taskDate >= sinceDate;
          } catch {
            return true;
          }
        });
      }
    }
    
    // Sort by created_at (newest first)
    filtered.sort((a, b) => {
      const aTime = a.created_at || "";
      const bTime = b.created_at || "";
      return bTime.localeCompare(aTime);
    });
    
    if (filters?.limit && filters.limit > 0) {
      filtered = filtered.slice(0, filters.limit);
    }
    
    return {
      items: filtered,
      total: tasks.total,
    };
  }

  /**
   * Get detailed task status by ID (accepts short IDs)
   */
  async getTaskStatus(taskId: string): Promise<Task> {
    // First, try to fetch all tasks to find matching ID
    const tasks = await this.request<TaskListResponse>("GET", "/tasks");
    const matches = tasks.items.filter((t) => t.id.startsWith(taskId));
    
    if (matches.length === 0) {
      throw new Error(`No task found with ID starting with ${taskId}`);
    }
    
    if (matches.length > 1) {
      throw new Error(
        `Multiple tasks match prefix ${taskId}. Use a longer prefix to disambiguate.`
      );
    }
    
    // Fetch full task details
    return this.request<Task>("GET", `/tasks/${matches[0].id}`);
  }

  /**
   * Quick status check (returns basic info)
   */
  async getQuickStatus(taskId: string): Promise<{
    id: string;
    type: string;
    status: string;
    description: string;
    updated_at?: string;
    error?: string;
    hasResult: boolean;
  }> {
    const tasks = await this.request<TaskListResponse>("GET", "/tasks");
    const matches = tasks.items.filter((t) => t.id.startsWith(taskId));
    
    if (matches.length === 0) {
      throw new Error(`No task found with ID starting with ${taskId}`);
    }
    
    if (matches.length > 1) {
      throw new Error(
        `Multiple tasks match prefix ${taskId}. Use getTaskStatus() for details.`
      );
    }
    
    const task = matches[0];
    return {
      id: task.id,
      type: task.type,
      status: task.status,
      description: task.description,
      updated_at: task.updated_at,
      error: task.error,
      hasResult: !!task.result,
    };
  }

  /**
   * Search tasks with fuzzy matching across id/type/description/result
   */
  async searchTasks(
    query: string,
    filters?: TaskFilters
  ): Promise<TaskListResponse> {
    const tasks = await this.request<TaskListResponse>("GET", "/tasks");
    
    // Simple fuzzy matching (can be enhanced with better algorithm)
    const queryLower = query.toLowerCase();
    const scored = tasks.items
      .map((task) => {
        const fields = [
          task.id,
          task.type,
          task.description,
          JSON.stringify(task.result || {}),
        ];
        const maxScore = Math.max(
          ...fields.map((field) => {
            if (!field) return 0;
            const fieldLower = field.toLowerCase();
            // Simple substring match score
            if (fieldLower.includes(queryLower)) {
              return queryLower.length / fieldLower.length;
            }
            return 0;
          })
        );
        return { score: maxScore, task };
      })
      .filter((item) => item.score >= 0.3) // Threshold
      .sort((a, b) => {
        // Sort by created_at first, then by score
        const aTime = a.task.created_at || "";
        const bTime = b.task.created_at || "";
        const timeCompare = bTime.localeCompare(aTime);
        if (timeCompare !== 0) return timeCompare;
        return b.score - a.score;
      })
      .map((item) => item.task);
    
    // Apply filters (reuse listTasks logic)
    let filtered = scored;
    
    if (filters?.status) {
      const wantStatus = filters.status.toLowerCase();
      filtered = filtered.filter((t) => {
        const status = (t.status || "").toLowerCase();
        return status.startsWith(wantStatus) || status === wantStatus;
      });
    }
    
    if (filters?.type) {
      const wantType = filters.type.toLowerCase();
      filtered = filtered.filter((t) => {
        const type = (t.type || "").toLowerCase();
        return type === wantType || type.includes(wantType);
      });
    }
    
    if (filters?.since) {
      const sinceDate = this.parseSince(filters.since);
      if (sinceDate) {
        filtered = filtered.filter((t) => {
          const updatedAt = t.updated_at || t.created_at || "";
          if (!updatedAt) return true;
          try {
            const taskDate = new Date(updatedAt);
            return taskDate >= sinceDate;
          } catch {
            return true;
          }
        });
      }
    }
    
    if (filters?.limit && filters.limit > 0) {
      filtered = filtered.slice(0, filters.limit);
    }
    
    return {
      items: filtered,
      total: tasks.total,
    };
  }

  // ------------------- Facts Management -------------------

  /**
   * List all facts
   */
  async listFacts(): Promise<Fact[]> {
    const response = await this.request<{ items: Fact[]; total: number }>(
      "GET",
      "/facts"
    );
    return response.items;
  }

  /**
   * Create a new fact
   */
  async createFact(text: string, metadata?: Record<string, any>): Promise<Fact> {
    return this.request<Fact>("POST", "/facts", {
      text,
      metadata: metadata || { source: "seedcore-client" },
    });
  }

  /**
   * Delete a fact by ID (accepts short IDs)
   */
  async deleteFact(factId: string): Promise<void> {
    // First, try to find the fact
    const facts = await this.listFacts();
    const matches = facts.filter((f) => f.id.startsWith(factId));
    
    if (matches.length === 0) {
      throw new Error(`No fact found with ID starting with ${factId}`);
    }
    
    if (matches.length > 1) {
      throw new Error(
        `Multiple facts match prefix ${factId}. Use a longer prefix to disambiguate.`
      );
    }
    
    await this.request<void>("DELETE", `/facts/${matches[0].id}`);
  }
}

// Export singleton instance
export const seedcoreService = new SeedCoreService();
