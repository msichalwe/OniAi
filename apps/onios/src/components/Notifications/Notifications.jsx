import React from "react";
import { X } from "lucide-react";
import useNotificationStore from "../../stores/notificationStore";
import "./Notifications.css";

export default function Notifications() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismissNotification = useNotificationStore(
    (s) => s.dismissNotification,
  );

  return (
    <div className="notifications-container">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="notification-toast"
          onClick={() => dismissNotification(n.id)}
        >
          <div className={`notification-dot ${n.type}`} />
          <span className="notification-message">{n.message}</span>
          <button
            className="notification-close"
            onClick={(e) => {
              e.stopPropagation();
              dismissNotification(n.id);
            }}
          >
            <X />
          </button>
        </div>
      ))}
    </div>
  );
}
