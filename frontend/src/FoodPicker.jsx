import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * FoodPicker
 * - Abre como modal fullscreen (portal no body) para não quebrar em telas grandes
 * - Mantém padrão "catálogo": busca + lista + seleção + porções/gramas
 * - Se não tiver treino/erro: mostra mensagem clara
 */

const FOOD_CATALOG = [
  // fallback mínimo (o resto vem da API)
  { id: "fallback-1", name: "Arroz branco cozido", calories: 130, protein: 2, portion: "1 xícara (150 g)", serving_unit: "xícara", serving_qty: 1, serving_g: 150 },
  { id: "fallback-2", name: "Feijão carioca cozido", calories: 90, protein: 6, portion: "1 concha (100 g)", serving_unit: "concha", serving_qty: 1, serving_g: 100 },
  { id: "fallback-3", name: "Frango grelhado", calories: 150, protein: 30, portion: "100 g", serving_unit: "g", serving_qty: 100, serving_g: 100 },
];

export default function FoodPicker({
  open,
  onClose,
  onSelectFood, // (food, { mode, grams, portions }) => void
}) {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState(FOOD_CATALOG);
  const [selectedFood, setSelectedFood] = useState(null);

  const [mode, setMode] = useState("porcoes"); // "porcoes" | "gramas"
  const [portions, setPortions] = useState(1);
  const [grams, setGrams] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const inputRef = useRef(null);

  const apiBaseUrl = useMemo(() => {
    // prioridade: APP_CONFIG -> VITE_API_URL -> /api (proxy)
    return (
      window?.APP_CONFIG?.apiBaseUrl ||
      import.meta?.env?.VITE_API_URL ||
      "/api"
    );
  }, []);

  const fallbackFoods = useMemo(() => FOOD_CATALOG, []);

  useEffect(() => {
    if (!open) return;
    // reset leve ao abrir
    setErrorMessage("");
    setIsLoading(false);
    setSelectedFood(null);
    setMode("porcoes");
    setPortions(1);
    setGrams("");
    setFoods(fallbackFoods);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, fallbackFoods]);

  useEffect(() => {
    if (!open) return;

    const q = (query || "").trim();

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const url = `${apiBaseUrl.replace(/\/$/, "")}/foods/search?q=${encodeURIComponent(q)}`;
        const resp = await fetch(url, { signal: controller.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();

        const mapped = Array.isArray(data)
          ? data.map((item, idx) => ({
              id: item?.id ?? `food-${idx}`,
              name: item?.name || "Alimento",
              calories: Number(item?.calories ?? item?.kcal ?? 0),
              protein: Number(item?.protein ?? item?.protein_g ?? 0),
              fat: Number(item?.fat ?? item?.fat_g ?? 0),

              // novos metadados (porção)
              serving_qty: item?.serving_qty ?? 1,
              serving_unit: item?.serving_unit ?? "g",
              serving_g: item?.serving_g ?? 100,
              portion: item?.portion || (item?.serving_g ? `${item.serving_g} g` : "100 g"),
            }))
          : [];

        setFoods(mapped.length ? mapped : []);
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error("Erro ao buscar alimentos:", err);
        setFoods([]);
        setErrorMessage("Não foi possível buscar alimentos agora. Tente novamente.");
      } finally {
        setIsLoading(false);
      }
    }, 250); // debounce menor pra ficar responsivo

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [open, query, apiBaseUrl, fallbackFoods]);

  if (!open) return null;

  const close = () => {
    onClose?.();
  };

  const confirmAdd = () => {
    if (!selectedFood) return;

    const isPortions = mode === "porcoes";
    const portionQty = Math.max(1, Number(portions || 1));
    const gramsValue = Math.max(1, Number(grams || 0));

    // Regra:
    // - Porções: calcula gramas = serving_g * porções (se tiver serving_g)
    // - Gramas: usa gramas direto
    const computedGrams =
      isPortions
        ? Math.round((Number(selectedFood.serving_g || 100) * portionQty) * 100) / 100
        : gramsValue;

    onSelectFood?.(selectedFood, {
      mode,
      portions: isPortions ? portionQty : null,
      grams: computedGrams,
    });

    // mantém aberto? normalmente fecha
    close();
  };

  const overlay = (
    <div className="food-picker-overlay" onMouseDown={close}>
      <div className="food-picker-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="food-picker-header">
          <div>
            <div className="food-picker-title">Catálogo rápido</div>
            <div className="food-picker-subtitle">Escolha um alimento</div>
          </div>
          <button className="btn btn-secondary" onClick={close}>
            Fechar
          </button>
        </div>

        <div className="food-picker-search">
          <label className="label">Buscar</label>
          <input
            ref={inputRef}
            className="input"
            placeholder="Digite para filtrar (ex: pão, arroz, tapioca...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="food-picker-hint">
            {query.trim().length < 2 ? "Digite pelo menos 2 letras." : isLoading ? "Buscando..." : ""}
          </div>
          {errorMessage ? <div className="food-picker-error">{errorMessage}</div> : null}
        </div>

        <div className="food-picker-body">
          <div className="food-picker-list">
            {foods.length === 0 && query.trim().length >= 2 && !isLoading ? (
              <div className="food-picker-empty">Nada encontrado.</div>
            ) : null}

            <div className="food-picker-grid">
              {foods.map((f) => {
                const active = selectedFood?.id === f.id;
                return (
                  <button
                    key={f.id}
                    className={`food-card ${active ? "active" : ""}`}
                    onClick={() => setSelectedFood(f)}
                    type="button"
                  >
                    <div className="food-card-name">{f.name}</div>
                    <div className="food-card-meta">
                      <span>{Number(f.calories || 0)} kcal</span>
                      <span>{Number(f.protein || 0)} g proteína</span>
                    </div>
                    <div className="food-card-portion">{f.portion || "100 g"}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="food-picker-right">
            <div className="food-picker-panel">
              <div className="food-picker-panel-title">Quantidade</div>

              <div className="toggle-row">
                <button
                  type="button"
                  className={`toggle ${mode === "porcoes" ? "active" : ""}`}
                  onClick={() => setMode("porcoes")}
                >
                  Porções
                </button>
                <button
                  type="button"
                  className={`toggle ${mode === "gramas" ? "active" : ""}`}
                  onClick={() => setMode("gramas")}
                >
                  Gramas
                </button>
              </div>

              {mode === "porcoes" ? (
                <>
                  <label className="label">Quantidade (porções)</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    value={portions}
                    onChange={(e) => setPortions(e.target.value)}
                  />
                  <div className="food-picker-small">
                    Porção padrão:{" "}
                    <strong>{selectedFood?.portion || "100 g"}</strong>
                  </div>
                </>
              ) : (
                <>
                  <label className="label">Quantidade (gramas)</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                    placeholder="Ex: 120"
                  />
                </>
              )}

              <div className="food-picker-selected">
                {selectedFood ? (
                  <>
                    <div><strong>Selecionado:</strong> {selectedFood.name}</div>
                    <div className="food-picker-small">
                      {selectedFood.calories} kcal • {selectedFood.protein} g proteína
                    </div>
                  </>
                ) : (
                  <div className="food-picker-empty">Selecione um alimento.</div>
                )}
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmAdd}
                disabled={!selectedFood}
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ✅ PORTAL: garante que o modal fique bonito e correto em telas grandes
  return createPortal(overlay, document.body);
}
