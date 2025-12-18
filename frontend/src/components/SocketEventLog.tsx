import { useEffect, useState } from 'react';
import { SocketMessage, OrderUpdate } from '../types/order.types';

interface SocketEventLogProps {
  events: Array<SocketMessage | OrderUpdate>;
}

export function SocketEventLog({ events }: SocketEventLogProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const formatEvent = (event: SocketMessage | OrderUpdate) => {
    if ('type' in event) {
      // SocketMessage
      return {
        type: event.type,
        timestamp: event.timestamp || new Date().toISOString(),
        data: event,
      };
    } else {
      // OrderUpdate
      return {
        type: 'update',
        timestamp: event.timestamp,
        data: event,
      };
    }
  };

  return (
    <div className="socket-event-log">
      <div className="socket-event-log-header" onClick={() => setIsExpanded(!isExpanded)}>
        <h3>Socket Events ({events.length})</h3>
        <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
      </div>
      {isExpanded && (
        <div className="socket-event-list">
          {events.length === 0 ? (
            <div className="no-events">No events yet</div>
          ) : (
            events.map((event, index) => {
              const formatted = formatEvent(event);
              return (
                <div key={index} className="socket-event-item">
                  <div className="event-header">
                    <span className="event-type">{formatted.type.toUpperCase()}</span>
                    <span className="event-time">
                      {new Date(formatted.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="event-data">{JSON.stringify(formatted.data, null, 2)}</pre>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

