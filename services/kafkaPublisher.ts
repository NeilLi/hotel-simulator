/* ---------------------------- Kafka Publisher Service ---------------------------- */

import type { SeedcoreHotelEvent, EventType } from './eventTypes';
import { ALLOWED_EVENT_TYPES } from './eventTypes';

class KafkaPublisherService {
  private enabled: boolean = false;
  private eventQueue: SeedcoreHotelEvent[] = [];
  private flushInterval: number | null = null;
  private consecutiveFailures: number = 0;
  private maxFailures: number = 3; // Stop trying after 3 consecutive failures
  private isCircuitOpen: boolean = false; // Circuit breaker pattern
  private isAiEnabled: boolean = false; // Track AI enabled state for boot screen safety net

  constructor() {
    // Check if Kafka is configured (via backend proxy)
    this.enabled = true; // Always enabled - backend handles Kafka config
    this.startFlushInterval();
    console.log('[KafkaPublisher] ✅ Enabled (publishing to backend /api/events)');
  }

  // Set AI enabled state (called from App.tsx when AI is enabled/disabled)
  setAiEnabled(enabled: boolean) {
    this.isAiEnabled = enabled;
  }

  private startFlushInterval() {
    // Stop existing interval if any
    this.stopFlushInterval();
    
    // Flush events every 2s to batch them (increased from 500ms to reduce message volume)
    this.flushInterval = window.setInterval(() => {
      if (this.eventQueue.length > 0 && !this.isCircuitOpen) {
        this.flush();
      }
    }, 2000);
  }

  private stopFlushInterval() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  private async flush() {
    if (this.eventQueue.length === 0) return;

    // Circuit breaker: if too many failures, stop trying
    if (this.isCircuitOpen) {
      // Silently drop events when circuit is open
      this.eventQueue = [];
      return;
    }

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      // Send to backend /api/events endpoint
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!response.ok) {
        this.consecutiveFailures++;
        // Only log first failure, then silence
        if (this.consecutiveFailures === 1) {
          console.warn('[KafkaPublisher] Failed to publish events:', response.status, '(server may be down)');
        }
        
        // Open circuit after max failures
        if (this.consecutiveFailures >= this.maxFailures) {
          this.isCircuitOpen = true;
          console.warn(`[KafkaPublisher] ⚠️  Circuit opened after ${this.maxFailures} failures. Stopping event publishing.`);
          this.stopFlushInterval();
          // Clear queue to prevent memory buildup
          this.eventQueue = [];
          return;
        }
        
        // Re-queue events on failure (with limit to prevent memory issues)
        if (this.eventQueue.length < 100) {
          this.eventQueue.unshift(...events);
        }
      } else {
        // Success - reset failure counter and close circuit if it was open
        if (this.consecutiveFailures > 0) {
          this.consecutiveFailures = 0;
          if (this.isCircuitOpen) {
            this.isCircuitOpen = false;
            console.log('[KafkaPublisher] ✅ Circuit closed - server is back online');
            this.startFlushInterval();
          }
        }
        const result = await response.json();
        const published = result.published || events.length;
        // Suppress frequent logs - only log errors or very large batches
        // (Server-side logging handles the periodic summary)
      }
    } catch (error: any) {
      this.consecutiveFailures++;
      
      // Only log first failure, then silence to avoid spam
      if (this.consecutiveFailures === 1) {
        console.warn('[KafkaPublisher] Connection error (server may be down):', error.message);
      }
      
      // Open circuit after max failures
      if (this.consecutiveFailures >= this.maxFailures) {
        this.isCircuitOpen = true;
        console.warn(`[KafkaPublisher] ⚠️  Circuit opened after ${this.maxFailures} failures. Stopping event publishing.`);
        this.stopFlushInterval();
        // Clear queue to prevent memory buildup
        this.eventQueue = [];
        return;
      }
      
      // Re-queue on error (with limit)
      if (this.eventQueue.length < 100) {
        this.eventQueue.unshift(...events);
      }
    }
  }

  publish(event: SeedcoreHotelEvent) {
    // If circuit is open, silently drop events
    if (this.isCircuitOpen) {
      return;
    }

    // ✅ Safety net: Block sim events during boot screen (when AI is disabled)
    // Only allow explicit boot screen UI interactions
    if (!this.isAiEnabled) {
      const BOOT_ALLOWED_UI = new Set([
        'ui.button.clicked',
        'ui.keyboard.pressed',
      ]);
      
      // Block all sim events during boot screen
      if (event.source === 'sim') {
        return; // Silently drop sim events on boot screen
      }
      
      // Only allow specific UI events during boot screen
      if (event.source === 'ui' && !BOOT_ALLOWED_UI.has(event.type)) {
        return; // Block other UI events during boot screen
      }
    }

    // Filter: Only publish allowed event types
    if (!ALLOWED_EVENT_TYPES.has(event.type as EventType)) {
      if (import.meta.env.DEV) {
        console.log('[KafkaPublisher] Skipping non-allowed event type:', event.type);
      }
      return;
    }

    // Deduplicate: Check if same event type + payload was recently added
    const eventKey = `${event.type}:${JSON.stringify(event.payload)}`;
    const recentKey = `recent_${eventKey}`;
    const lastEmitted = (window as any)[recentKey];
    const now = Date.now();
    
    // Skip if same event was emitted in last 1 second (deduplication)
    if (lastEmitted && (now - lastEmitted) < 1000) {
      return;
    }
    (window as any)[recentKey] = now;

    // Add to queue
    this.eventQueue.push(event);

    // Flush immediately only if queue is very large (increased threshold from 10 to 50)
    if (this.eventQueue.length >= 50 && !this.isCircuitOpen) {
      this.flush();
    }
  }

  destroy() {
    this.stopFlushInterval();
    // Flush remaining events only if circuit is not open
    if (this.eventQueue.length > 0 && !this.isCircuitOpen) {
      this.flush();
    }
  }

  // Public method to reset circuit breaker (e.g., when server comes back)
  resetCircuit() {
    if (this.isCircuitOpen) {
      this.isCircuitOpen = false;
      this.consecutiveFailures = 0;
      this.startFlushInterval();
      console.log('[KafkaPublisher] ✅ Circuit breaker reset');
    }
  }
}

export const kafkaPublisher = new KafkaPublisherService();
