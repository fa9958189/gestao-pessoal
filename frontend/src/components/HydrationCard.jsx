import React, { useEffect, useMemo, useState } from 'react';
import {
  addHydrationEntry,
  fetchHydrationState,
  undoHydrationEntry,
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
  const [hydrationTotalMl, setHydrationTotalMl] = useState(0);
  const [hydrationGoalMl, setHydrationGoalMl] = useState(DAILY_GOAL_ML);
  const [hydrationLastEntryId, setHydrationLastEntryId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const date = useMemo(
    () => selectedDate || getLocalDateString(),
    [selectedDate],
  );

  const totalMl = useMemo(() => hydrationTotalMl, [hydrationTotalMl]);
  const goalMl = hydrationGoalMl || DAILY_GOAL_ML;
  const progress = Math.min(100, Math.round((totalMl / goalMl) * 100));

  useEffect(() => {
    let isMounted = true;

    const loadEntries = async () => {
      if (!userId) return;
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchHydrationState({ dayDate: date }, supabase);
        if (!isMounted) return;
        setHydrationTotalMl(Number(data?.hydrationTotalMl || 0));
        setHydrationGoalMl(Number(data?.hydrationGoalMl || DAILY_GOAL_ML));
        setHydrationLastEntryId(data?.hydrationLastEntryId ?? null);
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
      const result = await addHydrationEntry({ dayDate: date, amountMl }, supabase);
      setHydrationTotalMl(Number(result?.hydrationTotalMl || 0));
      setHydrationGoalMl(Number(result?.hydrationGoalMl || goalMl));
      setHydrationLastEntryId(result?.hydrationLastEntryId ?? null);
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
      const result = await undoHydrationEntry({ dayDate: date }, supabase);
      if (result?.ok === false && result?.reason === 'no_hydration') {
        if (typeof notify === 'function') {
          notify('Nenhum registro para desfazer.', 'warning');
        }
        setHydrationTotalMl(Number(result?.hydrationTotalMl || 0));
        setHydrationLastEntryId(result?.hydrationLastEntryId ?? null);
        return;
      }

      setHydrationTotalMl(Number(result?.hydrationTotalMl || 0));
      setHydrationLastEntryId(result?.hydrationLastEntryId ?? null);
      if (typeof notify === 'function') {
        notify('Último registro removido.', 'success');
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
            disabled={isSaving || isLoading || !hydrationLastEntryId}
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
