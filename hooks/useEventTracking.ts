/* ---------------------------- Event Tracking Hook ---------------------------- */

import { useEffect, useRef } from 'react';
import { eventEmitter } from '../services/eventEmitter';
import { kafkaPublisher } from '../services/kafkaPublisher';
import type { SeedcoreHotelEvent } from '../services/eventTypes';

export function useEventTracking() {
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Subscribe to events and publish to Kafka
    unsubscribeRef.current = eventEmitter.subscribe((event: SeedcoreHotelEvent) => {
      kafkaPublisher.publish(event);
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  return {
    emitHotelEvent: eventEmitter.emitHotelEvent.bind(eventEmitter),
    emitHotspotEntered: eventEmitter.emitHotspotEntered.bind(eventEmitter),
    emitHotspotLeft: eventEmitter.emitHotspotLeft.bind(eventEmitter),
    emitVoiceTranscript: eventEmitter.emitVoiceTranscript.bind(eventEmitter),
    emitButtonClick: eventEmitter.emitButtonClick.bind(eventEmitter),
    emitKeyboardPressed: eventEmitter.emitKeyboardPressed.bind(eventEmitter),
    emitRoomOccupancyChanged: eventEmitter.emitRoomOccupancyChanged.bind(eventEmitter),
    emitAgentStateChanged: eventEmitter.emitAgentStateChanged.bind(eventEmitter),
  };
}
