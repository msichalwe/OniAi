/**
 * Calendar — Month/week view with tasks and events.
 *
 * Features:
 * - Month grid with day cells showing task/event dots
 * - Click a day to view/add tasks and events
 * - Quick-add task/event from the side panel
 * - Connected to TaskStore — syncs automatically
 * - Today highlight, overdue indicators
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Circle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CalendarDays,
  X,
} from "lucide-react";
import useTaskStore from "../../stores/taskStore";
import { useWidgetContext } from "../../core/useWidgetContext";
import "./Calendar.css";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatDate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const PRIORITY_COLORS = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#6b7280",
};

export default function Calendar({ windowId, widgetType }) {
  const tasks = useTaskStore((s) => s.tasks);
  const events = useTaskStore((s) => s.events);
  const addTask = useTaskStore((s) => s.addTask);
  const addEvent = useTaskStore((s) => s.addEvent);
  const completeTask = useTaskStore((s) => s.completeTask);
  const reopenTask = useTaskStore((s) => s.reopenTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const deleteEvent = useTaskStore((s) => s.deleteEvent);

  const today = new Date();
  const todayStr = formatDate(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState("task"); // 'task' or 'event'
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    time: "",
    endTime: "",
    priority: "medium",
    color: "#3b82f6",
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Report live context for AI agents
  useWidgetContext(windowId, "calendar", {
    currentMonth: `${MONTHS[month]} ${year}`,
    selectedDate,
    totalTasks: tasks.length,
    pendingTasks: tasks.filter(
      (t) => t.status !== "done" && t.status !== "cancelled",
    ).length,
    overdueTasks: tasks.filter(
      (t) => t.dueDate && t.dueDate < todayStr && t.status !== "done",
    ).length,
    totalEvents: events.length,
    upcomingEvents: events
      .filter((e) => e.date >= todayStr)
      .slice(0, 10)
      .map((e) => ({ title: e.title, date: e.date, time: e.time })),
    tasksOnSelectedDate: tasks
      .filter((t) => t.dueDate === selectedDate)
      .map((t) => ({ title: t.title, status: t.status, priority: t.priority })),
    eventsOnSelectedDate: events
      .filter((e) => e.date === selectedDate)
      .map((e) => ({ title: e.title, time: e.time })),
  });

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    // Previous month fill
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      days.push({
        day: d,
        dateStr: formatDate(y, m, d),
        isCurrentMonth: false,
      });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        day: d,
        dateStr: formatDate(year, month, d),
        isCurrentMonth: true,
      });
    }

    // Next month fill
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 0 : month + 1;
      const y = month === 11 ? year + 1 : year;
      days.push({
        day: d,
        dateStr: formatDate(y, m, d),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [year, month]);

  // Count items per date for dots
  const dateItemCounts = useMemo(() => {
    const counts = {};
    tasks.forEach((t) => {
      if (t.dueDate) {
        if (!counts[t.dueDate])
          counts[t.dueDate] = {
            tasks: 0,
            events: 0,
            overdue: false,
            hasUrgent: false,
          };
        counts[t.dueDate].tasks++;
        if (t.dueDate < todayStr && t.status !== "done")
          counts[t.dueDate].overdue = true;
        if (t.priority === "urgent" || t.priority === "high")
          counts[t.dueDate].hasUrgent = true;
      }
    });
    events.forEach((e) => {
      if (e.date) {
        if (!counts[e.date])
          counts[e.date] = {
            tasks: 0,
            events: 0,
            overdue: false,
            hasUrgent: false,
          };
        counts[e.date].events++;
      }
    });
    return counts;
  }, [tasks, events, todayStr]);

  // Items for selected date
  const selectedItems = useMemo(() => {
    const dayTasks = tasks.filter((t) => t.dueDate === selectedDate);
    const dayEvents = events.filter((e) => e.date === selectedDate);
    return { tasks: dayTasks, events: dayEvents };
  }, [tasks, events, selectedDate]);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => {
    setViewDate(new Date());
    setSelectedDate(todayStr);
  };

  const handleAddSubmit = () => {
    if (!formData.title.trim()) return;
    if (addType === "task") {
      addTask({
        title: formData.title,
        description: formData.description,
        dueDate: selectedDate,
        dueTime: formData.time || null,
        priority: formData.priority,
      });
    } else {
      addEvent({
        title: formData.title,
        description: formData.description,
        date: selectedDate,
        startTime: formData.time || null,
        endTime: formData.endTime || null,
        color: formData.color,
      });
    }
    setFormData({
      title: "",
      description: "",
      time: "",
      endTime: "",
      priority: "medium",
      color: "#3b82f6",
    });
    setShowAddForm(false);
  };

  return (
    <div className="calendar-widget">
      {/* Left: Month grid */}
      <div className="cal-grid-panel">
        <div className="cal-header">
          <button className="cal-nav-btn" onClick={prevMonth}>
            <ChevronLeft size={16} />
          </button>
          <div className="cal-header-title">
            <span className="cal-month">{MONTHS[month]}</span>
            <span className="cal-year">{year}</span>
          </div>
          <button className="cal-nav-btn" onClick={goToday}>
            Today
          </button>
          <button className="cal-nav-btn" onClick={nextMonth}>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="cal-day-names">
          {DAYS.map((d) => (
            <div key={d} className="cal-day-name">
              {d}
            </div>
          ))}
        </div>

        <div className="cal-days">
          {calendarDays.map((d, i) => {
            const counts = dateItemCounts[d.dateStr];
            const isToday = d.dateStr === todayStr;
            const isSelected = d.dateStr === selectedDate;
            return (
              <button
                key={i}
                className={[
                  "cal-day",
                  !d.isCurrentMonth && "cal-day-outside",
                  isToday && "cal-day-today",
                  isSelected && "cal-day-selected",
                  counts?.overdue && "cal-day-overdue",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelectedDate(d.dateStr)}
              >
                <span className="cal-day-num">{d.day}</span>
                {counts && (
                  <div className="cal-day-dots">
                    {counts.tasks > 0 && (
                      <span
                        className="cal-dot"
                        style={{
                          background: counts.hasUrgent ? "#ef4444" : "#3b82f6",
                        }}
                      />
                    )}
                    {counts.events > 0 && (
                      <span
                        className="cal-dot"
                        style={{ background: "#a78bfa" }}
                      />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Day detail panel */}
      <div className="cal-detail-panel">
        <div className="cal-detail-header">
          <span className="cal-detail-date">
            {parseDate(selectedDate).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
          <button className="cal-add-btn" onClick={() => setShowAddForm(true)}>
            <Plus size={14} /> Add
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="cal-add-form">
            <div className="cal-form-tabs">
              <button
                className={`cal-form-tab ${addType === "task" ? "active" : ""}`}
                onClick={() => setAddType("task")}
              >
                Task
              </button>
              <button
                className={`cal-form-tab ${addType === "event" ? "active" : ""}`}
                onClick={() => setAddType("event")}
              >
                Event
              </button>
              <button
                className="cal-form-close"
                onClick={() => setShowAddForm(false)}
              >
                <X size={12} />
              </button>
            </div>
            <input
              className="cal-form-input"
              placeholder={
                addType === "task" ? "Task title..." : "Event title..."
              }
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              onKeyDown={(e) => e.key === "Enter" && handleAddSubmit()}
              autoFocus
            />
            <div className="cal-form-row">
              <input
                className="cal-form-input cal-form-time"
                type="time"
                value={formData.time}
                onChange={(e) =>
                  setFormData({ ...formData, time: e.target.value })
                }
              />
              {addType === "task" && (
                <select
                  className="cal-form-input cal-form-select"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: e.target.value })
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              )}
              {addType === "event" && (
                <input
                  className="cal-form-input cal-form-time"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) =>
                    setFormData({ ...formData, endTime: e.target.value })
                  }
                  placeholder="End"
                />
              )}
            </div>
            <button className="cal-form-submit" onClick={handleAddSubmit}>
              Add {addType}
            </button>
          </div>
        )}

        {/* Day items */}
        <div className="cal-detail-list">
          {selectedItems.events.length > 0 && (
            <div className="cal-detail-section">
              <div className="cal-detail-section-title">Events</div>
              {selectedItems.events.map((ev) => (
                <div
                  key={ev.id}
                  className="cal-item cal-item-event"
                  style={{ borderLeftColor: ev.color }}
                >
                  <div className="cal-item-info">
                    <span className="cal-item-title">{ev.title}</span>
                    {ev.startTime && (
                      <span className="cal-item-time">
                        <Clock size={10} /> {ev.startTime}
                        {ev.endTime ? ` – ${ev.endTime}` : ""}
                      </span>
                    )}
                  </div>
                  <button
                    className="cal-item-delete"
                    onClick={() => deleteEvent(ev.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedItems.tasks.length > 0 && (
            <div className="cal-detail-section">
              <div className="cal-detail-section-title">Tasks</div>
              {selectedItems.tasks.map((task) => (
                <div
                  key={task.id}
                  className={`cal-item cal-item-task ${task.status === "done" ? "cal-item-done" : ""}`}
                >
                  <button
                    className="cal-item-check"
                    onClick={() =>
                      task.status === "done"
                        ? reopenTask(task.id)
                        : completeTask(task.id)
                    }
                  >
                    {task.status === "done" ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <Circle size={16} />
                    )}
                  </button>
                  <div className="cal-item-info">
                    <span className="cal-item-title">{task.title}</span>
                    <div className="cal-item-meta">
                      {task.dueTime && (
                        <span className="cal-item-time">
                          <Clock size={10} /> {task.dueTime}
                        </span>
                      )}
                      <span
                        className="cal-item-priority"
                        style={{ color: PRIORITY_COLORS[task.priority] }}
                      >
                        {task.priority}
                      </span>
                    </div>
                  </div>
                  <button
                    className="cal-item-delete"
                    onClick={() => deleteTask(task.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedItems.tasks.length === 0 &&
            selectedItems.events.length === 0 &&
            !showAddForm && (
              <div className="cal-detail-empty">
                <CalendarDays size={28} />
                <span>Nothing scheduled</span>
                <button
                  className="cal-add-empty-btn"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus size={14} /> Add task or event
                </button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
