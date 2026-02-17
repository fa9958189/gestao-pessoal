import React, { useEffect, useMemo, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

const STATUS_COLORS = {
  active: '#22c55e',
  completed: '#3b82f6',
  archived: '#9ca3af',
};

const getMonthRange = (baseDate) => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
};

const AgendaCalendar = ({ supabase, userId }) => {
  const [activeStartDate, setActiveStartDate] = useState(new Date());
  const [eventsByDate, setEventsByDate] = useState({});

  useEffect(() => {
    const loadMonthEvents = async () => {
      if (!supabase || !userId) {
        setEventsByDate({});
        return;
      }

      const { from, to } = getMonthRange(activeStartDate);
      const { data, error } = await supabase
        .from('events')
        .select('date, status')
        .eq('user_id', userId)
        .gte('date', from)
        .lte('date', to);

      if (error) {
        console.warn('Erro ao carregar eventos do calendário da agenda', error);
        setEventsByDate({});
        return;
      }

      const grouped = (data || []).reduce((acc, event) => {
        const dateKey = event.date;
        const status = event.status || 'active';
        if (!acc[dateKey]) {
          acc[dateKey] = new Set();
        }
        acc[dateKey].add(status);
        return acc;
      }, {});

      setEventsByDate(grouped);
    };

    loadMonthEvents();
  }, [activeStartDate, supabase, userId]);

  const tileContent = ({ date, view }) => {
    if (view !== 'month') return null;

    const dateKey = date.toISOString().slice(0, 10);
    const statuses = eventsByDate[dateKey];

    if (!statuses || statuses.size === 0) return null;

    return (
      <div className="agenda-calendar-dots" aria-hidden="true">
        {Array.from(statuses).map((status) => (
          <span
            key={`${dateKey}-${status}`}
            className="agenda-calendar-dot"
            style={{ backgroundColor: STATUS_COLORS[status] || STATUS_COLORS.active }}
            title={status}
          />
        ))}
      </div>
    );
  };

  const monthLabel = useMemo(
    () => activeStartDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    [activeStartDate]
  );

  return (
    <div style={{ marginTop: 12 }}>
      <p className="muted" style={{ marginBottom: 8, textTransform: 'capitalize' }}>
        {monthLabel}
      </p>
      <Calendar
        value={new Date()}
        activeStartDate={activeStartDate}
        onActiveStartDateChange={({ activeStartDate: nextDate }) => {
          if (nextDate) setActiveStartDate(nextDate);
        }}
        tileContent={tileContent}
      />
    </div>
  );
};

export default AgendaCalendar;
