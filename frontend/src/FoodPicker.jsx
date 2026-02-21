import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function FoodPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState("serving"); // 'serving' | 'grams'
  const [grams, setGrams] = useState(100);
  const [servings, setServings] = useState(1);
  const [selected, setSelected] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    // Foco no input quando abrir
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/foods/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      } catch (e) {
        // Se abortar, ignora silencioso
        if (String(e?.name) !== "AbortError") {
          console.error("FoodPicker fetch error:", e);
        }
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query]);

  const preview = useMemo(() => {
    if (!selected) return null;

    const baseCalories = Number(selected.calories) || 0;
    const baseProtein = Number(selected.protein) || 0;

    // Se o modo for por gramas, calcula proporcional a 100g
    if (mode === "grams") {
      const g = Math.max(1, Number(grams) || 100);
      const factor = g / 100;
      return {
        calories: Math.round(baseCalories * factor),
        protein: Math.round(baseProtein * factor),
        portionLabel: `${g} g`,
      };
    }

    // modo por porções (unidade/fatia/etc)
    const s = Math.max(1, Number(servings) || 1);
    return {
      calories: Math.round(baseCalories * s),
      protein: Math.round(baseProtein * s),
      portionLabel: `${s}x ${selected.portion || "porção"}`,
    };
  }, [selected, mode, grams, servings]);

  const handleAdd = () => {
    if (!selected || !preview) return;

    onSelect?.({
      name: selected.name,
      calories: preview.calories,
      protein: preview.protein,
      portion: preview.portionLabel,
      source: selected.source || "taco",
    });

    onClose?.();
  };

  const content = (
    <div
      className="food-picker-overlay"
      role="dialog"
      aria-modal="true"
      // fecha só se clicar no FUNDO, não em qualquer coisa dentro
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="food-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="food-picker-header">
          <div>
            <div className="food-picker-title">Catálogo rápido</div>
            <div className="food-picker-subtitle">Escolha um alimento</div>
          </div>
          <button className="ghost" onClick={onClose}>Fechar</button>
        </div>

        <div className="food-picker-search">
          <div className="label">Buscar</div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite para filtrar"
          />
          <div className="food-picker-hint">
            {isLoading ? "Buscando..." : "Digite pelo menos 2 letras"}
          </div>
        </div>

        <div className="food-picker-grid">
          {items.map((it) => (
            <button
              key={it.id}
              className={`food-picker-item ${selected?.id === it.id ? "active" : ""}`}
              onClick={() => {
                setSelected(it);
                // se tiver unidade/fatia, começa em porções
                if (it.serving_qty && it.serving_unit) setMode("serving");
                else setMode("grams");
              }}
              type="button"
            >
              <div className="food-picker-item-name">{it.name}</div>
              <div className="food-picker-item-meta">
                {it.portion || "100 g"} • {Number(it.calories) || 0} kcal
              </div>
            </button>
          ))}
          {!isLoading && items.length === 0 && query.trim().length >= 2 && (
            <div className="food-picker-empty">Nada encontrado.</div>
          )}
        </div>

        <div className="food-picker-footer">
          <div className="food-picker-mode">
            <button
              className={`chip ${mode === "serving" ? "active" : ""}`}
              onClick={() => setMode("serving")}
              disabled={!selected?.serving_qty || !selected?.serving_unit}
              type="button"
              title={!selected?.serving_qty ? "Este alimento não tem porção padrão" : ""}
            >
              Porções
            </button>
            <button
              className={`chip ${mode === "grams" ? "active" : ""}`}
              onClick={() => setMode("grams")}
              type="button"
            >
              Gramas
            </button>
          </div>

          <div className="food-picker-controls">
            {mode === "grams" ? (
              <>
                <div className="label">Quantidade (g)</div>
                <input
                  type="number"
                  min="1"
                  value={grams}
                  onChange={(e) => setGrams(e.target.value)}
                />
              </>
            ) : (
              <>
                <div className="label">Quantidade (porções)</div>
                <input
                  type="number"
                  min="1"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                />
              </>
            )}
          </div>

          <div className="food-picker-preview">
            {selected && preview ? (
              <>
                <div className="preview-title">{selected.name}</div>
                <div className="preview-meta">
                  {preview.portionLabel} • {preview.calories} kcal • {preview.protein} g prot.
                </div>
              </>
            ) : (
              <div className="preview-empty">Selecione um alimento.</div>
            )}
          </div>

          <button className="primary" onClick={handleAdd} disabled={!selected}>
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );

  // PORTAL: garante que aparece no desktop por cima de qualquer overlay
  return createPortal(content, document.body);
}
