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

export type PKGMode = "advisory" | "control";

export interface HotelTaskFacts {
  namespace: string;
  subject: string;
  predicate: string; // e.g., "request_diy_print", "request_magic_atelier", etc.
  object_data?: Record<string, any>;
}

export interface GovernedFact {
  subject: string;
  predicate: string;
  object_data: Record<string, any>;
}

export interface PKGEvaluateAsyncRequest {
  task_facts: HotelTaskFacts;
  snapshot_id?: number;
  current_time?: string; // ISO8601 datetime string
  embedding?: number[]; // 1024d embedding vector
  mode?: PKGMode; // Default: "advisory"
  zone_id?: string; // e.g., "magic_atelier", "journey_studio"
  related_subjects?: string[]; // Additional subjects for multi-subject fact hydration (e.g., ["system:room_environment", "system:doors_management", "zone:DIRECTOR"])
  signals?: Record<string, any>; // Actor/requestor context (e.g., { actor_subject, actor_role, actor_auth_level })
  governed_facts?: GovernedFact[]; // Curated facts explicitly injected into evaluation (max 5-15, keep input <2KB)
}

export interface PKGEvaluateResponse {
  decision: {
    allowed: boolean;
    reason: string;
  };
  emissions: {
    subtasks: any[];
    dag: any[];
  };
  provenance: {
    rules: any[];
    snapshot?: any;
    governed_facts?: any;
    semantic_context?: any;
  };
  meta?: {
    duration_ms?: number;
    engine?: 'wasm' | 'native';
    rules_matched?: number;
    subtasks_count?: number;
    snapshot?: string;
    had_semantic_context?: boolean;
    [key: string]: any; // Allow additional meta fields
  };
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
  description?: string; // Optional, defaults to '' on backend
  params?: Record<string, any>; // Optional, defaults to {} on backend
  domain?: string; // Optional, Coordinator will infer if missing
  run_immediately?: boolean; // Optional, defaults to true (sets status to QUEUED)
  snapshot_id?: number; // Optional, explicit snapshot ID override
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
    // Vite-native environment loading: prioritize import.meta.env for browser context
    // Fallback to process.env for Node.js/SSR contexts, then default to localhost
    let apiUrl: string = "";
    
    // Check import.meta.env (Vite browser context)
    // Use try-catch since import.meta may not be available in all contexts
    try {
      // @ts-ignore - import.meta is a Vite-specific feature
      if (import.meta?.env?.VITE_SEEDCORE_API) {
        // @ts-ignore
        apiUrl = import.meta.env.VITE_SEEDCORE_API;
      }
    } catch {
      // import.meta not available, will fall back to process.env
    }
    
    // Fallback to process.env if import.meta.env didn't provide a value
    if (!apiUrl && typeof process !== 'undefined' && process.env) {
      apiUrl = process.env.VITE_SEEDCORE_API || process.env.SEEDCORE_API || "";
    }
    
    // Default to localhost if no environment variable is set
    this.apiBase = apiUrl || "http://127.0.0.1:8002";
    this.apiV1Base = `${this.apiBase}/api/v1`;
  }

  /**
   * Normalize specialization string from legacy format to canonical format
   * 
   * Converts "Manufacturing.Design" → "manufacturing_design"
   * This ensures compatibility with router registration and prevents fallback to default handlers.
   * 
   * @param input - Specialization string (may be legacy format with dots)
   * @returns Normalized specialization string (lowercase, underscores instead of dots)
   */
  private normalizeSpecialization(input: string): string {
    if (!input || typeof input !== 'string') return input;

    // Manufacturing.Design → manufacturing_design
    if (input.includes('.')) {
      const normalized = input.toLowerCase().replace(/\./g, '_');
      console.log(`[normalizeSpecialization] "${input}" → "${normalized}"`);
      return normalized;
    }

    return input.toLowerCase();
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
      // Log task creation payloads to debug specialization issues
      if (endpoint === '/tasks' && method === 'POST') {
        const specializationInfo: Record<string, any> = {};
        if (body.params?.routing?.specialization) {
          specializationInfo.routing_specialization = body.params.routing.specialization;
        }
        if (body.params?.specialization) {
          specializationInfo.specialization = body.params.specialization;
        }
        if (Object.keys(specializationInfo).length > 0) {
          console.log('[request] Sending task to API with specialization:', JSON.stringify(specializationInfo, null, 2));
          // Also check for legacy format in the actual body being sent
          const bodyStr = JSON.stringify(body);
          if (bodyStr.includes('Manufacturing.Design') || bodyStr.includes('manufacturing.design')) {
            console.error('[request] ⚠️ LEGACY FORMAT DETECTED IN REQUEST BODY!');
            console.error('[request] Body contains legacy format:', bodyStr.substring(0, 500));
          }
        }
      }
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API error (${response.status}): ${errorText}`;
        
        // Check for database constraint errors (server not initialized)
        if (errorText.includes('snapshot_id') || errorText.includes('null value') || errorText.includes('violates not-null constraint')) {
          errorMessage = 'SERVER_NOT_INITIALIZED';
        }
        
        const error = new Error(errorMessage);
        (error as any).status = response.status;
        (error as any).originalMessage = errorText;
        throw error;
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        // Check if it's a network error (server not running)
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ECONNREFUSED')) {
          const networkError = new Error('SERVER_NOT_RUNNING');
          (networkError as any).originalError = error;
          throw networkError;
        }
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
    // Build payload matching backend API format
    const payload: Record<string, any> = {
      type: options.type, // Required (but backend defaults to 'unknown_task' if missing)
      ...(options.description !== undefined && { description: options.description }),
      ...(options.params !== undefined && { params: options.params }),
      ...(options.domain && { domain: options.domain }),
      ...(options.run_immediately !== undefined && { run_immediately: options.run_immediately }),
      ...(options.snapshot_id !== undefined && { snapshot_id: options.snapshot_id }),
    };

    // Default run_immediately to true if not specified (sets status to QUEUED)
    if (options.run_immediately === undefined) {
      payload.run_immediately = true;
    }

    // Log specialization values BEFORE normalization for debugging
    const beforeNormalization = {
      routing_specialization: payload.params?.routing?.specialization,
      specialization: payload.params?.specialization,
    };
    if (beforeNormalization.routing_specialization || beforeNormalization.specialization) {
      console.log('[createTask] BEFORE normalization:', JSON.stringify(beforeNormalization, null, 2));
    }

    // Recursively normalize all specialization fields in params
    const normalizeSpecializationsInObject = (obj: any, path: string = 'payload.params'): void => {
      if (obj === null || obj === undefined) return;
      
      if (typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [key, value] of Object.entries(obj)) {
          // Skip _emission to preserve provenance data
          if (key === '_emission') continue;
          
          // Normalize specialization fields
          if (key === 'specialization' && typeof value === 'string') {
            const original = value;
            const normalized = this.normalizeSpecialization(value);
            if (original !== normalized) {
              console.log(`[createTask] Normalized ${path}.${key}: "${original}" → "${normalized}"`);
              obj[key] = normalized;
            }
          }
          
          // Recursively check nested objects
          if (typeof value === 'object' && value !== null) {
            normalizeSpecializationsInObject(value, `${path}.${key}`);
          }
        }
      }
    };

    // Enforce normalization at the boundary - prevent legacy strings from crossing API boundary
    normalizeSpecializationsInObject(payload.params);

    // Log final payload specialization values AFTER normalization
    const afterNormalization = {
      routing_specialization: payload.params?.routing?.specialization,
      specialization: payload.params?.specialization,
    };
    if (afterNormalization.routing_specialization || afterNormalization.specialization) {
      console.log('[createTask] AFTER normalization (sending to API):', JSON.stringify(afterNormalization, null, 2));
      // Also log full routing object to catch any nested issues
      if (payload.params?.routing) {
        console.log('[createTask] Full routing object:', JSON.stringify(payload.params.routing, null, 2));
      }
    }

    // Deep check for any remaining legacy format in params (defensive)
    const checkForLegacyInObject = (obj: any, path: string = 'payload.params'): void => {
      if (obj === null || obj === undefined) return;
      if (typeof obj === 'string') {
        if (obj.includes('.') && obj.split('.').length === 2) {
          const parts = obj.split('.');
          if (parts[0].length > 0 && parts[1].length > 0) {
            console.error(`[createTask] ⚠️ LEGACY FORMAT STILL PRESENT at ${path}: "${obj}"`);
          }
        }
        return;
      }
      if (Array.isArray(obj)) {
        obj.forEach((item, idx) => checkForLegacyInObject(item, `${path}[${idx}]`));
        return;
      }
      if (typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          // Skip _emission to avoid false positives on provenance data
          if (key === '_emission') continue;
          checkForLegacyInObject(value, `${path}.${key}`);
        }
      }
    };
    checkForLegacyInObject(payload.params);

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
   * 
   * Filters are passed as URL query parameters to the backend for server-side filtering,
   * reducing bandwidth and improving performance for large datasets.
   */
  async listTasks(filters?: TaskFilters): Promise<TaskListResponse> {
    // Build query parameters for server-side filtering
    const params = new URLSearchParams();
    
    if (filters?.status) {
      params.append("status", filters.status);
    }
    
    if (filters?.type) {
      params.append("type", filters.type);
    }
    
    if (filters?.since) {
      params.append("since", filters.since);
    }
    
    if (filters?.limit && filters.limit > 0) {
      params.append("limit", String(filters.limit));
    }
    
    const queryString = params.toString();
    const endpoint = queryString ? `/tasks?${queryString}` : "/tasks";
    
    return this.request<TaskListResponse>("GET", endpoint);
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
   * 
   * Search query and filters are passed as URL query parameters to the backend
   * for server-side filtering and search, reducing bandwidth and improving performance.
   */
  async searchTasks(
    query: string,
    filters?: TaskFilters
  ): Promise<TaskListResponse> {
    // Build query parameters for server-side search and filtering
    const params = new URLSearchParams();
    params.append("q", query);
    
    if (filters?.status) {
      params.append("status", filters.status);
    }
    
    if (filters?.type) {
      params.append("type", filters.type);
    }
    
    if (filters?.since) {
      params.append("since", filters.since);
    }
    
    if (filters?.limit && filters.limit > 0) {
      params.append("limit", String(filters.limit));
    }
    
    const endpoint = `/tasks?${params.toString()}`;
    return this.request<TaskListResponse>("GET", endpoint);
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

  // ------------------- PKG Evaluation -------------------

  /**
   * Evaluate a task using PKG (Policy Knowledge Graph) async evaluation
   * 
   * This is a hotel-simulator friendly wrapper around PKGManager/PKGEvaluator.
   * It takes a simple SPO-style triple (namespace/subject/predicate/object_data)
   * and returns a policy decision with emissions and provenance.
   * 
   * The endpoint is `/api/v1/pkg/evaluate_async` (matching the FastAPI router prefix).
   * 
   * @param options - PKG evaluation request options
   * @returns Policy decision with emissions and provenance
   * 
   * @example
   * ```typescript
   * const result = await seedcoreService.evaluatePKGAsync({
   *   task_facts: {
   *     namespace: "hospitality",
   *     subject: "guest:neil",
   *     predicate: "request_diy_print",
   *     object_data: { material: "PLA", size: 12 }
   *   },
   *   snapshot_id: 1,
   *   zone_id: "wearable_studio"
   * });
   * 
   * if (result.decision.allowed) {
   *   console.log("Request allowed:", result.emissions.subtasks);
   * } else {
   *   console.log("Request blocked:", result.decision.reason);
   * }
   * ```
   */
  async evaluatePKGAsync(options: PKGEvaluateAsyncRequest): Promise<PKGEvaluateResponse> {
    const payload: PKGEvaluateAsyncRequest = {
      mode: options.mode || "advisory",
      ...options,
    };

    try {
      const response = await fetch(`${this.apiV1Base}/pkg/evaluate_async`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `PKG evaluation error (${response.status}): ${errorText}`;
        
        // Handle 403 Forbidden (policy gate blocked)
        // FastAPI HTTPException with status_code=403 returns detail as JSON
        if (response.status === 403) {
          try {
            const errorDetail = JSON.parse(errorText);
            // FastAPI returns error details in 'detail' field when it's a dict
            const detail = errorDetail.detail || errorDetail;
            const ruleId = detail.rule_id || detail.rule_name || "unknown_gate";
            const reason = detail.reason || detail.error || String(detail) || "Request blocked by policy gate";
            const error = new Error(`POLICY_BLOCKED: ${reason}`);
            (error as any).status = 403;
            (error as any).ruleId = ruleId;
            (error as any).ruleName = detail.rule_name;
            (error as any).originalMessage = errorText;
            throw error;
          } catch {
            // If parsing fails, throw generic 403 error
            const error = new Error(`POLICY_BLOCKED: Request blocked by policy gate`);
            (error as any).status = 403;
            (error as any).originalMessage = errorText;
            throw error;
          }
        }
        
        // Handle 503 Service Unavailable (PKG not available)
        // FastAPI HTTPException with status_code=503 returns detail as string or dict
        if (response.status === 503) {
          try {
            const errorDetail = JSON.parse(errorText);
            const detail = errorDetail.detail || errorDetail;
            errorMessage = `PKG_NOT_AVAILABLE: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
          } catch {
            errorMessage = 'PKG_NOT_AVAILABLE';
          }
        }
        
        // Check for database constraint errors (server not initialized)
        if (errorText.includes('snapshot_id') || errorText.includes('null value') || errorText.includes('violates not-null constraint')) {
          errorMessage = 'SERVER_NOT_INITIALIZED';
        }
        
        const error = new Error(errorMessage);
        (error as any).status = response.status;
        (error as any).originalMessage = errorText;
        throw error;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        // Check if it's a network error (server not running)
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ECONNREFUSED')) {
          const networkError = new Error('SERVER_NOT_RUNNING');
          (networkError as any).originalError = error;
          throw networkError;
        }
        throw error;
      }
      throw new Error(`PKG evaluation failed: ${String(error)}`);
    }
  }

  /**
   * Execute emissions from a PKG policy decision (Reflex helper)
   * 
   * This helper automatically creates SeedCore tasks from the `emissions.subtasks` array
   * returned by `evaluatePKGAsync`. This simplifies React components by handling the
   * "Reflex" logic automatically, allowing the UI to focus on displaying results rather
   * than orchestrating task creation.
   * 
   * @param emissions - Emissions object from PKG evaluation response
   * @param options - Optional configuration for task creation
   * @returns Array of created tasks with their corresponding emission metadata
   * 
   * @example
   * ```typescript
   * const result = await seedcoreService.evaluatePKGAsync({
   *   task_facts: {
   *     namespace: "hospitality",
   *     subject: "guest:neil",
   *     predicate: "request_diy_print",
   *     object_data: { material: "PLA", size: 12 }
   *   }
   * });
   * 
   * if (result.decision.allowed) {
   *   // Automatically create tasks from emissions
   *   const createdTasks = await seedcoreService.executeEmissions(result.emissions);
   *   console.log(`Created ${createdTasks.length} tasks from policy emissions`);
   * }
   * ```
   */
  async executeEmissions(
    emissions: PKGEvaluateResponse['emissions'],
    options?: {
      runImmediately?: boolean;
      domain?: string;
    }
  ): Promise<Array<{ task: Task; emission: any }>> {
    console.error('[executeEmissions] 🔥 Called with emissions:', JSON.stringify({
      subtasks_count: emissions?.subtasks?.length || 0,
      subtasks: emissions?.subtasks?.map((s: any) => ({
        subtask_type: s.subtask_type || s.type,
        specialization: s.specialization,
        params_routing_specialization: s.params?.routing?.specialization,
        params_specialization: s.params?.specialization,
        params_keys: s.params ? Object.keys(s.params) : [],
      })),
    }, null, 2));
    
    const { subtasks = [] } = emissions;
    const results: Array<{ task: Task; emission: any }> = [];

    // Filter out subtasks that should not be executed as SeedCore tasks
    const excludedSubtaskTypes = ['control_zone_access'];
    const filteredSubtasks = subtasks.filter((emission: any) => {
      const subtaskType = emission.subtask_type || emission.type || emission.name || '';
      const shouldExclude = excludedSubtaskTypes.includes(subtaskType.toLowerCase());
      if (shouldExclude) {
        console.error(`[executeEmissions] ⏭️ Skipping excluded subtask type: "${subtaskType}"`);
      }
      return !shouldExclude;
    });

    // Execute each subtask emission as a SeedCore task
    for (const emission of filteredSubtasks) {
      try {
        // Extract task type and description from emission
        const subtaskType = emission.subtask_type || emission.type || "action";
        const description = emission.description || emission.name || JSON.stringify(emission.params || {});
        // Create a deep copy of params to ensure modifications are preserved
        // Handle edge cases: null, undefined, or non-serializable values
        let params: Record<string, any> = {};
        try {
          if (emission.params) {
            params = JSON.parse(JSON.stringify(emission.params));
          }
        } catch (e) {
          // Fallback to shallow copy if deep copy fails (e.g., circular references)
          console.warn('[executeEmissions] Failed to deep copy params, using shallow copy:', e);
          params = { ...emission.params };
        }

        // Ensure routing structure exists and is properly formatted
        if (!params.routing) {
          params.routing = {};
        }
        if (!Array.isArray(params.routing.routing_tags)) {
          params.routing.routing_tags = params.routing.routing_tags ? [params.routing.routing_tags] : [];
        }

        // Fail fast if legacy specialization format is detected
        // Normalization should happen upstream - if we see legacy format here, it's a bug
        const checkForLegacyFormat = (value: any, path: string): void => {
          if (typeof value === 'string' && value.includes('.')) {
            // Check if it looks like a legacy specialization format (e.g., "Manufacturing.Design")
            const parts = value.split('.');
            if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
              throw new Error(
                `Legacy specialization format detected at "${path}": "${value}". ` +
                `Expected canonical format (e.g., "design" with routing_tags: ["manufacturing"]). ` +
                `This should have been normalized upstream before reaching executeEmissions().`
              );
            }
          }
        };

        // Check for legacy format in common locations
        if (params.routing?.specialization) {
          checkForLegacyFormat(params.routing.specialization, 'params.routing.specialization');
        }
        if (params.specialization) {
          checkForLegacyFormat(params.specialization, 'params.specialization');
        }
        if ((emission as any).specialization) {
          checkForLegacyFormat((emission as any).specialization, 'emission.specialization');
        }
        
        // Set default specialization if missing (infer from subtask_type)
        if (!params.routing.specialization) {
          // Map common subtask types to specializations
          const specializationMap: Record<string, string> = {
            'generate_precision_mockups': 'design',
            'manufacture_wearable': 'manufacturing',
            'design_wearable': 'design',
            'print_placement': 'design',
            'fabric_selection': 'design',
          };
          
          // Try to infer from subtask_type name
          let inferredSpecialization = specializationMap[subtaskType.toLowerCase()];
          
          // Fallback: extract from subtask_type if it contains known patterns
          if (!inferredSpecialization) {
            if (subtaskType.toLowerCase().includes('design') || 
                subtaskType.toLowerCase().includes('mockup') ||
                subtaskType.toLowerCase().includes('render')) {
              inferredSpecialization = 'design';
            } else if (subtaskType.toLowerCase().includes('manufacture') ||
                      subtaskType.toLowerCase().includes('mfg') ||
                      subtaskType.toLowerCase().includes('production')) {
              inferredSpecialization = 'manufacturing';
            }
          }
          
          if (inferredSpecialization) {
            params.routing.specialization = inferredSpecialization;
            
            // Set required_specialization for critical subtask types
            const requiresHardConstraint = ['generate_precision_mockups'];
            if (requiresHardConstraint.includes(subtaskType.toLowerCase())) {
              params.routing.required_specialization = inferredSpecialization;
              console.error(`[executeEmissions] 🔧 Set required_specialization "${inferredSpecialization}" for subtask "${subtaskType}"`);
            } else {
              console.error(`[executeEmissions] 🔧 Set default specialization "${inferredSpecialization}" for subtask "${subtaskType}"`);
            }
          } else {
            console.error(`[executeEmissions] ⚠️ No specialization found in params.routing for subtask "${subtaskType}"`);
          }
        } else {
          // Specialization already exists - set required_specialization for critical subtask types
          const requiresHardConstraint = ['generate_precision_mockups'];
          if (requiresHardConstraint.includes(subtaskType.toLowerCase())) {
            params.routing.required_specialization = params.routing.specialization;
            console.error(`[executeEmissions] 🔧 Set required_specialization "${params.routing.specialization}" for subtask "${subtaskType}"`);
          }
        }

        // Map subtask_type to TaskType (default to "action" if unknown)
        const taskType: TaskType = 
          (subtaskType === "query" || subtaskType === "action" || subtaskType === "graph" || subtaskType === "maintenance" || subtaskType === "chat")
            ? subtaskType as TaskType
            : "action";

        // Build final params with _emission metadata
        const finalParams: Record<string, any> = {
          ...params,
          // Preserve emission metadata for provenance
          _emission: {
            subtask_type: subtaskType,
            position: emission.position,
            original_emission: emission,
          },
        };

        // Log params BEFORE createTask to see what's being sent
        const routingInfo = (finalParams as any).routing;
        const specializationInfo = (finalParams as any).specialization;
        console.error(`[executeEmissions] 📤 About to createTask for subtask "${subtaskType}":`, JSON.stringify({
          type: taskType,
          description,
          domain: options?.domain || params.domain,
          params: {
            routing_specialization: routingInfo?.specialization,
            routing_required_specialization: routingInfo?.required_specialization,
            routing_tags: routingInfo?.routing_tags,
            specialization: specializationInfo,
            _emission: {
              subtask_type: finalParams._emission.subtask_type,
              position: finalParams._emission.position,
              original_emission_specialization: finalParams._emission.original_emission?.params?.routing?.specialization || 
                                               finalParams._emission.original_emission?.params?.specialization ||
                                               finalParams._emission.original_emission?.specialization,
            },
            all_param_keys: Object.keys(finalParams),
          },
        }, null, 2));

        // Create the task
        const task = await this.createTask({
          type: taskType,
          description,
          params: finalParams,
          domain: options?.domain || params.domain,
          run_immediately: options?.runImmediately !== false,
        });

        results.push({ task, emission });
      } catch (error) {
        // Log error but continue processing other emissions
        console.error(`Failed to execute emission:`, emission, error);
        // Optionally, you could collect failed emissions and return them separately
      }
    }

    return results;
  }

  /**
   * Get PKG status with detailed error information
   * 
   * This endpoint provides diagnostic information about the PKG system state,
   * including any errors that occurred during snapshot loading, integrity checks,
   * or evaluator creation.
   * 
   * @returns PKG status object with detailed error information if any issues exist
   * 
   * @example
   * ```typescript
   * const status = await seedcoreService.getPKGStatus();
   * if (status.error) {
   *   console.error('PKG Error:', status.error);
   *   console.log('Diagnostic SQL:', status.diagnostic_sql);
   * }
   * ```
   */
  async getPKGStatus(): Promise<{
    initialized: boolean;
    snapshot_id?: number;
    snapshot_version?: string;
    error?: string;
    error_type?: 'snapshot_integrity' | 'missing_artifacts' | 'missing_rules' | 'evaluator_creation' | 'unknown';
    diagnostic_sql?: string[];
    suggestion?: string;
  }> {
    try {
      const response = await fetch(`${this.apiV1Base}/pkg/status`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PKG status check failed (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        // Check if it's a network error (server not running)
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ECONNREFUSED')) {
          const networkError = new Error('SERVER_NOT_RUNNING');
          (networkError as any).originalError = error;
          throw networkError;
        }
        throw error;
      }
      throw new Error(`Unknown error checking PKG status: ${error}`);
    }
  }

  /**
   * Manually reload PKG snapshot
   * 
   * This endpoint triggers a manual reload of the PKG snapshot, which can help
   * diagnose and recover from snapshot loading errors. The response includes
   * detailed error information if the reload fails.
   * 
   * @param snapshotId - Optional snapshot ID to reload. If not provided, reloads the active snapshot.
   * @returns Reload result with detailed error information if reload fails
   * 
   * @example
   * ```typescript
   * try {
   *   const result = await seedcoreService.reloadPKG();
   *   console.log('PKG reloaded successfully:', result.snapshot_version);
   * } catch (error) {
   *   console.error('PKG reload failed:', error);
   * }
   * ```
   */
  async reloadPKG(snapshotId?: number): Promise<{
    success: boolean;
    snapshot_id?: number;
    snapshot_version?: string;
    error?: string;
    error_type?: 'snapshot_integrity' | 'missing_artifacts' | 'missing_rules' | 'evaluator_creation' | 'unknown';
    diagnostic_sql?: string[];
    suggestion?: string;
  }> {
    try {
      const response = await fetch(`${this.apiV1Base}/pkg/reload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(snapshotId ? { snapshot_id: snapshotId } : {}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `PKG reload failed (${response.status}): ${errorText}`;
        
        // Try to parse detailed error information
        try {
          const errorDetail = JSON.parse(errorText);
          const detail = errorDetail.detail || errorDetail;
          if (typeof detail === 'object' && detail.error) {
            errorMessage = detail.error;
          } else if (typeof detail === 'string') {
            errorMessage = detail;
          }
        } catch {
          // If parsing fails, use the raw error text
        }
        
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        // Check if it's a network error (server not running)
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ECONNREFUSED')) {
          const networkError = new Error('SERVER_NOT_RUNNING');
          (networkError as any).originalError = error;
          throw networkError;
        }
        throw error;
      }
      throw new Error(`Unknown error reloading PKG: ${error}`);
    }
  }

  // ------------------- Agent Registration -------------------

  /**
   * Register or update a SeedCore agent with personality configuration
   * 
   * This method initializes a specialized agent (e.g., Reachy Mini) with a role profile
   * that includes personality traits, skills, and behavior configuration for VLA control.
   * 
   * @param options - Agent registration options
   * @returns Registration result with agent ID and status
   * 
   * @example
   * ```typescript
   * const result = await seedcoreService.registerAgent({
   *   agent_id: "reachy_mimi",
   *   specialization: "reachy_actuator",
   *   role_profile: {
   *     default_skills: { roomService: 0.9, orderTowels: 0.8 },
   *     behavior_config: {
   *       personality: { energy: 0.65, warmth: 0.8, humor: 0.7 },
   *       motion: { velocity_multiplier: 1.2, smoothness: 0.9 },
   *       llm: { temperature: 0.8 },
   *       audio: { pitch: 1.05 }
   *     },
   *     routing_tags: ["hotel_guest_room", "Concierge"]
   *   }
   * });
   * ```
   */
  async registerAgent(options: {
    agent_id: string;
    specialization: string;
    role_profile: {
      default_skills?: Record<string, number | boolean>;
      behavior_config?: {
        personality?: {
          energy?: number;
          warmth?: number;
          humor?: number;
        };
        motion?: {
          velocity_multiplier?: number;
          smoothness?: number;
        };
        llm?: {
          temperature?: number;
        };
        audio?: {
          pitch?: number;
        };
        safety_check?: {
          enabled?: boolean;
        };
      };
      routing_tags?: string[];
    };
  }): Promise<{
    agent_id: string;
    status: 'registered' | 'updated';
    message: string;
  }> {
    try {
      const response = await fetch(`${this.apiV1Base}/agents/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Agent registration error (${response.status}): ${errorText}`;
        
        // Check for database constraint errors (server not initialized)
        if (errorText.includes('snapshot_id') || errorText.includes('null value') || errorText.includes('violates not-null constraint')) {
          errorMessage = 'SERVER_NOT_INITIALIZED';
        }
        
        const error = new Error(errorMessage);
        (error as any).status = response.status;
        (error as any).originalMessage = errorText;
        throw error;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        // Check if it's a network error (server not running)
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ECONNREFUSED')) {
          const networkError = new Error('SERVER_NOT_RUNNING');
          (networkError as any).originalError = error;
          throw networkError;
        }
        throw error;
      }
      throw new Error(`Agent registration failed: ${String(error)}`);
    }
  }

  /**
   * Register a guest capability (Phase 1: Agent Materialization with Two-Layer Architecture)
   * 
   * This method registers a guest capability overlay in the guest_capabilities table,
   * which serves as a temporal overlay on top of the immutable system layer (pkg_subtask_types).
   * The CapabilityMonitor will detect the new entry and register it with the SpecializationManager.
   * 
   * Architecture:
   * - System Layer (immutable): pkg_subtask_types contains base capabilities
   * - Guest Layer (temporal): guest_capabilities contains guest-specific persona overrides
   * - Resolution: Router checks guest_capabilities first, then falls back to pkg_subtask_types
   * 
   * @param options - Guest capability registration options
   * @returns Registration result with capability name and status
   * 
   * @example
   * ```typescript
   * const result = await seedcoreService.registerCapability({
   *   guest_id: "550e8400-e29b-41d4-a716-446655440000",
   *   persona_name: "Mimi",
   *   base_capability_name: "reachy_actuator",
   *   executor: {
   *     specialization: "reachy_actuator",
   *     behaviors: ["background_loop", "proprioception_sync"],
   *     behavior_config: {
   *       motion: { velocity_multiplier: 0.85, smoothness: 0.80 },
   *       llm: { temperature: 0.70 }
   *     }
   *   },
   *   routing: {
   *     skills: { roomService: 0.9 },
   *     routing_tags: ["reachy_mini", "Concierge"]
   *   },
   *   valid_to: "2025-02-05T12:00:00Z"
   * });
   * ```
   */
  async registerCapability(options: {
    guest_id: string;
    persona_name: string;
    base_capability_name: string;
    executor?: {
      specialization: string;
      behaviors?: string[];
      behavior_config?: {
        motion?: {
          velocity_multiplier?: number;
          smoothness?: number;
        };
        llm?: {
          temperature?: number;
        };
        executor?: {
          behavior_config?: {
            background_loop?: {
              interval_s?: number;
            };
          };
        };
        cognitive?: {
          llm_model_override?: string;
        };
        audio?: {
          pitch?: number;
        };
        safety_check?: {
          enabled?: boolean;
        };
      };
      tools?: string[];
    };
    routing?: {
      skills?: Record<string, number>;
      routing_tags?: string[];
    };
    valid_to: string; // ISO8601 datetime string
  }): Promise<{
    name: string;
    updated: boolean;
    message: string;
  }> {
    try {
      const response = await fetch(`${this.apiV1Base}/capabilities/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Capability registration error (${response.status}): ${errorText}`;
        
        // Check for database constraint errors (server not initialized)
        if (errorText.includes('snapshot_id') || errorText.includes('null value') || errorText.includes('violates not-null constraint')) {
          errorMessage = 'SERVER_NOT_INITIALIZED';
        }
        
        const error = new Error(errorMessage);
        (error as any).status = response.status;
        (error as any).originalMessage = errorText;
        throw error;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        // Check if it's a network error (server not running)
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ECONNREFUSED')) {
          const networkError = new Error('SERVER_NOT_RUNNING');
          (networkError as any).originalError = error;
          throw networkError;
        }
        throw error;
      }
      throw new Error(`Capability registration failed: ${String(error)}`);
    }
  }

  /**
   * Stream task logs (thought trace) for a specific task via Server-Sent Events (SSE)
   * 
   * Phase 3: Streams the "Thought Trace" back to the React UI in real-time.
   * This is the canonical way to get logs for a task instance.
   * 
   * @param taskId - The task ID to get logs for
   * @param onLog - Callback function called for each log entry
   * @param onError - Optional callback for errors
   * @param onComplete - Optional callback when streaming completes
   * @param pollInterval - Polling interval in seconds (default: 1.0)
   * @returns Function to close the EventSource connection
   * 
   * @example
   * ```typescript
   * const close = seedcoreService.streamTaskLogs(
   *   "task_123",
   *   (log) => console.log("Log:", log),
   *   (error) => console.error("Error:", error),
   *   () => console.log("Complete")
   * );
   * // Later: close(); // Stop streaming
   * ```
   */
  streamTaskLogs(
    taskId: string,
    onLog: (log: {
      timestamp: string;
      level: 'info' | 'debug' | 'warning' | 'error';
      message: string;
      context?: Record<string, any>;
      routing_path?: string[];
    }) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void,
    pollInterval: number = 1.0
  ): () => void {
    const url = `${this.apiV1Base}/tasks/${taskId}/logs?poll_interval=${pollInterval}`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      // Connection opened - wait for 'connected' event
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle different event types from SSE stream
        switch (data.type) {
          case 'connected':
            // Initial connection established
            break;
          
          case 'log':
            // New log entry
            if (data.log) {
              onLog({
                timestamp: data.log.timestamp || new Date().toISOString(),
                level: data.log.level || 'info',
                message: data.log.message || '',
                context: data.log.context,
                routing_path: data.log.routing_path,
              });
            }
            break;
          
          case 'status':
            // Task status update
            if (data.status) {
              onLog({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `Task status: ${data.status}`,
                context: { status: data.status },
              });
            }
            break;
          
          case 'complete':
            // Task completed - close connection
            if (onComplete) {
              onComplete();
            }
            eventSource.close();
            break;
          
          case 'error':
            // Error occurred
            const error = new Error(data.message || 'Unknown error');
            if (onError) {
              onError(error);
            }
            eventSource.close();
            break;
          
          default:
            // Unknown event type - try to parse as log
            if (data.timestamp || data.message) {
              onLog({
                timestamp: data.timestamp || new Date().toISOString(),
                level: data.level || 'info',
                message: data.message || JSON.stringify(data),
                context: data.context,
                routing_path: data.routing_path,
              });
            }
        }
      } catch (parseError) {
        console.warn('Failed to parse SSE event:', parseError, event.data);
        if (onError && parseError instanceof Error) {
          onError(parseError);
        }
      }
    };

    eventSource.onerror = (error) => {
      // EventSource error - connection lost or failed
      // Don't immediately close - EventSource will auto-reconnect
      // Only call onError if connection is truly dead (check readyState)
      if (eventSource.readyState === EventSource.CLOSED) {
        const err = new Error('SSE connection closed');
        if (onError) {
          onError(err);
        }
        eventSource.close();
      }
      // If readyState is CONNECTING or OPEN, EventSource will auto-reconnect
      // Don't trigger error callback for temporary connection issues
    };

    // Return close function
    return () => {
      eventSource.close();
    };
  }

  /**
   * Get task logs (thought trace) for a specific task (legacy polling method)
   * 
   * @deprecated Use streamTaskLogs() for real-time streaming via SSE
   * This method is kept for backward compatibility but will return empty array
   * as the endpoint now uses SSE streaming.
   * 
   * @param taskId - The task ID to get logs for
   * @param limit - Maximum number of log entries to return (default: 50)
   * @returns Array of routing log entries (empty array - use streamTaskLogs instead)
   */
  async getTaskLogs(
    taskId: string,
    limit: number = 50
  ): Promise<Array<{
    timestamp: string;
    level: 'info' | 'debug' | 'warning' | 'error';
    message: string;
    context?: Record<string, any>;
    routing_path?: string[];
  }>> {
    // Legacy method - SSE endpoint doesn't support GET with limit
    // Return empty array and log deprecation warning
    console.warn('getTaskLogs() is deprecated. Use streamTaskLogs() for real-time SSE streaming.');
    return [];
  }

  /**
   * Get routing logs (thought trace) for an active agent
   * 
   * This method retrieves the real-time routing logs showing how the agent
   * processes requests, routes to different handlers, and executes actions.
   * 
   * @param agentId - The agent ID to get logs for
   * @param limit - Maximum number of log entries to return (default: 50)
   * @returns Array of routing log entries
   * 
   * @example
   * ```typescript
   * const logs = await seedcoreService.getAgentRoutingLogs("reachy_mimi", 20);
   * console.log("Agent thought trace:", logs);
   * ```
   */
  async getAgentRoutingLogs(
    agentId: string,
    limit: number = 50
  ): Promise<Array<{
    timestamp: string;
    level: 'info' | 'debug' | 'warning' | 'error';
    message: string;
    context?: Record<string, any>;
    routing_path?: string[];
  }>> {
    try {
      const response = await fetch(`${this.apiV1Base}/agents/${agentId}/logs?limit=${limit}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        // If agent doesn't exist or has no logs, return empty array
        if (response.status === 404) {
          return [];
        }
        
        const error = new Error(`Failed to fetch routing logs (${response.status}): ${errorText}`);
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      return Array.isArray(data.logs) ? data.logs : [];
    } catch (error) {
      if (error instanceof Error) {
        // Check if it's a network error (server not running)
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ECONNREFUSED')) {
          const networkError = new Error('SERVER_NOT_RUNNING');
          (networkError as any).originalError = error;
          throw networkError;
        }
        // If agent not found, return empty array
        if (error.message.includes('404')) {
          return [];
        }
        throw error;
      }
      return [];
    }
  }
}

// Export singleton instance
export const seedcoreService = new SeedCoreService();

// Re-export TaskPayload v2.5+ types and helpers for convenience
export {
  type TaskParamsV25,
  type RouterInbox,
  type RouterOutput,
  type CognitiveEnvelope,
  type ChatEnvelope,
  type RiskEnvelope,
  type GraphEnvelope,
  type MultimodalEnvelope,
  type ToolCall,
  type InteractionEnvelope,
  buildRouterInbox,
  buildCognitiveEnvelope,
  buildToolCalls,
  buildMultimodalEnvelope,
  buildTaskParamsV25,
  validateRouterTools,
  shouldBypassRouter,
  getRequiredTools,
  getToolCalls,
} from './taskPayloadTypes';
