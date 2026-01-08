import React, { useEffect, useMemo, useState } from 'react';
import {
  addWaterEntry,
  deleteLatestWaterEntry,
  fetchWaterByDate,
} from '../hydrationApi';

const DAILY_GOAL_ML = 3000;

const formatLiters = (value) => {
  const liters = Number(value || 0) / 1000;
  return liters.toLocaleString('pt-BR', {
    minimumFractionDigits: liters % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
};

const getLocalDateString = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

function HydrationCard({ userId, supabase, notify, selectedDate }) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const date = useMemo(
    () => selectedDate || getLocalDateString(),
    [selectedDate],
  );

  const totalMl = useMemo(
    () => entries.reduce((sum, item) => sum + (Number(item.amountMl) || 0), 0),
    [entries],
  );

  const goalMl = DAILY_GOAL_ML;
  const progress = Math.min(100, Math.round((totalMl / goalMl) * 100));

  useEffect(() => {
    let isMounted = true;

    const loadEntries = async () => {
      if (!userId) return;
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchWaterByDate(userId, date, supabase);
        if (!isMounted) return;
        setEntries(data || []);
      } catch (err) {
        console.warn('Erro ao carregar hidratação', err);
        if (isMounted) {
          setError('Não foi possível carregar a hidratação do dia.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadEntries();

    return () => {
      isMounted = false;
    };
  }, [userId, date, supabase]);

  useEffect(() => {
    if (error) {
      console.warn(error);
    }
  }, [error]);

  const handleAdd = async (amountMl) => {
    if (!userId) return;
    try {
      setIsSaving(true);
      const created = await addWaterEntry(
        { userId, date, amountMl },
        supabase,
      );
      setEntries((prev) => [created, ...prev]);
      if (typeof notify === 'function') {
        notify('Hidratação registrada.', 'success');
      }
    } catch (err) {
      console.warn('Erro ao salvar hidratação', err);
      if (typeof notify === 'function') {
        notify('Não foi possível salvar a hidratação.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!userId) return;
    try {
      setIsSaving(true);
      const deleted = await deleteLatestWaterEntry(userId, date, supabase);
      if (deleted) {
        setEntries((prev) => prev.filter((item) => item.id !== deleted.id));
        if (typeof notify === 'function') {
          notify('Último registro removido.', 'success');
        }
      } else if (typeof notify === 'function') {
        notify('Nenhum registro para desfazer.', 'warning');
      }
    } catch (err) {
      console.warn('Erro ao desfazer hidratação', err);
      if (typeof notify === 'function') {
        notify('Não foi possível desfazer o registro.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="food-diary-summary-card hydration-card">
      <h5 className="title" style={{ margin: 0, fontSize: 14 }}>
        Hidratação
      </h5>
      <div className="muted" style={{ fontSize: 13 }}>
        Total de hoje: <strong>{formatLiters(totalMl)} L</strong>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Meta diária: {formatLiters(goalMl)} L
      </div>
      <div className="hydration-progress">
        <div className="hydration-progress-bar" style={{ width: `${progress}%` }} />
      </div>
      <div className="hydration-actions">
        <button
          type="button"
          className="primary full"
          onClick={() => handleAdd(500)}
          disabled={isSaving || isLoading}
        >
          +500 ml
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="ghost"
            onClick={() => handleAdd(250)}
            disabled={isSaving || isLoading}
          >
            +250 ml
          </button>
          <button
            type="button"
            className="ghost"
            onClick={handleUndo}
            disabled={isSaving || isLoading || entries.length === 0}
          >
            Desfazer último
          </button>
        </div>
      </div>
      {isLoading && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Carregando...
        </div>
      )}
    </div>
  );
}

export default HydrationCard;
