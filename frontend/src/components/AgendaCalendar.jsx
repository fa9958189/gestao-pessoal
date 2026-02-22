import React, { useEffect, useMemo, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

const AgendaCalendar = ({ supabase, userId, selectedDate, onSelectDate }) => {
  const [activeStartDate, setActiveStartDate] = useState(new Date());
  const [monthEvents, setMonthEvents] = useState({});

  useEffect(() => {
    const fetchMonthEvents = async (year, month) => {
      if (!supabase || !userId) {
        setMonthEvents({});
        return;
      }

      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const end = `${year}-${String(month).padStart(2, '0')}-31`;

      const { data, error } = await supabase
        .from('events')
        .select('date, status')
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end);

      if (error) {
        console.warn('Erro ao carregar eventos do calendário da agenda', error);
        setMonthEvents({});
        return;
      }

      if (data) {
        const grouped = {};

        data.forEach((event) => {
          if (!grouped[event.date]) {
            grouped[event.date] = {
              total: 0,
              hasPending: false,
            };
          }

          grouped[event.date].total += 1;

          if (event.status === 'pending') {
            grouped[event.date].hasPending = true;
          }
        });

        setMonthEvents(grouped);
      } else {
        setMonthEvents({});
      }
    };

    fetchMonthEvents(activeStartDate.getFullYear(), activeStartDate.getMonth() + 1);
  }, [activeStartDate, supabase, userId]);

  const tileContent = ({ date, view }) => {
    if (view !== 'month') return null;

    const formattedDate = date.toISOString().slice(0, 10);
    const dayData = monthEvents[formattedDate];

    if (!dayData) return null;

    return (
      <div className="calendar-indicator" aria-hidden="true">
        {dayData.total > 1 ? dayData.total : '•'}
      </div>
    );
  };

  const tileClassName = ({ date, view }) => {
    if (view !== 'month') return undefined;

    const formattedDate = date.toISOString().slice(0, 10);
    const dayData = monthEvents[formattedDate];

    return [
      'calendar-day',
      dayData?.hasPending ? 'has-pending' : '',
      dayData && !dayData.hasPending ? 'has-history' : '',
      selectedDate === formattedDate ? 'selected' : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  const monthLabel = useMemo(
    () => activeStartDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    [activeStartDate]
  );

  return (
    <div className="calendar-root" style={{ marginTop: 12 }}>
      <p className="muted" style={{ marginBottom: 8, textTransform: 'capitalize' }}>
        {monthLabel}
      </p>
      <Calendar
        value={selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date()}
        activeStartDate={activeStartDate}
        onActiveStartDateChange={({ activeStartDate: nextDate }) => {
          if (nextDate) setActiveStartDate(nextDate);
        }}
        onClickDay={(date) => {
          const dayDateString = date.toISOString().slice(0, 10);
          onSelectDate?.((current) => (current === dayDateString ? null : dayDateString));
        }}
        tileClassName={tileClassName}
        tileContent={tileContent}
        className="agenda-calendar"
      />
    </div>
  );
};

export default AgendaCalendar;
