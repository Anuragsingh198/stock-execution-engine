import { useState } from 'react';
import { SocketMessage, OrderUpdate } from '../types/order.types';
import { formatTxHash, getSolanaExplorerUrl } from '../utils/solana.utils';

interface SocketEventLogProps {
  events: Array<SocketMessage | OrderUpdate>;
}


export function SocketEventLog({ events }: SocketEventLogProps) {
  const [isExpanded, setIsExpanded] = useState(true);


  const formatEvent = (event: SocketMessage | OrderUpdate) => {
    if ('type' in event) {
      return {
        type: event.type,
        timestamp: event.timestamp || new Date().toISOString(),
        data: event,
      };
    } else {
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
            <div className="no-events">No events yet. Waiting for WebSocket connection...</div>
          ) : (
            events.map((event, index) => {
              const formatted = formatEvent(event);
              const isStatusUpdate = 'status' in formatted.data && formatted.data.status;
              return (
                <div key={index} className={`socket-event-item ${isStatusUpdate ? 'status-update' : ''}`}>
                  <div className="event-header">
                    <span className="event-type">
                      {isStatusUpdate && formatted.data.status ? `STATUS: ${formatted.data.status.toUpperCase()}` : formatted.type.toUpperCase()}
                    </span>
                    <span className="event-time">
                      {new Date(formatted.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="event-data">{JSON.stringify(formatted.data, null, 2)}</pre>
                  {formatted.data.txHash && (
                    <div className="event-tx-link">
                      <a
                        href={getSolanaExplorerUrl(formatted.data.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tx-link-button"
                      >
                        🔗 View Transaction: {formatTxHash(formatted.data.txHash, 8)}
                      </a>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

