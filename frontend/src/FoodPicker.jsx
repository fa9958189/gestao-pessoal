import React, { useEffect, useMemo, useState } from "react";

// Se o backend/DB estiver vazio, ainda dá pra usar esse fallback local
import { FOOD_CATALOG } from "./foodCatalog";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Catálogo rápido do diário alimentar.
 * - calories/protein/fat do backend = por 100g (padrão)
 * - se vier serving_g + serving_unit, habilita modo "Porções"
 */

function parseNumberBR(value) {
  if (value === null || value === undefined) return 0;
  const s = String(value).replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function pluralizePt(word, qty) {
  if (!word) return "porção";
  if (qty === 1) return word;
  if (word.endsWith("r")) return word + "es";
  if (word.endsWith("l")) return word + "is";
  return word + "s";
}

export default function FoodPicker({ isOpen, onClose, onPick }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [foods, setFoods] = useState([]);

  const [selectedFood, setSelectedFood] = useState(null);

  const [qtyMode, setQtyMode] = useState("grams"); // "grams" | "serving"
  const [grams, setGrams] = useState(100);
  const [servingCount, setServingCount] = useState(1);

  useEffect(() => {
    if (!isOpen) return;

    let alive = true;

    async function fetchFoods() {
      setLoading(true);

      try {
        const url = `${API_BASE_URL}/api/foods/search?q=${encodeURIComponent(query || "")}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const normalized = Array.isArray(json)
          ? json.map((item) => ({
              id: item.id || item.name,
              nome: item.name,
              descricaoPorcao: item.portion || "100 g",
              caloriesPer100g: parseNumberBR(item.calories),
              proteinPer100g: parseNumberBR(item.protein),
              fatPer100g: parseNumberBR(item.fat),
              serving_qty: item.serving_qty ? parseNumberBR(item.serving_qty) : null,
              serving_unit: item.serving_unit || null,
              serving_g: item.serving_g ? parseNumberBR(item.serving_g) : null,
            }))
          : [];

        if (!alive) return;
        setFoods(normalized);
      } catch (err) {
        const fallback = FOOD_CATALOG.filter((f) => {
          if (!query) return true;
          return String(f.nome || "").toLowerCase().includes(query.toLowerCase());
        }).map((f, idx) => ({
          id: `local-${idx}`,
          nome: f.nome,
          descricaoPorcao: f.porcao || "100 g",
          caloriesPer100g: parseNumberBR(f.kcalPor100g || f.kcal || 0),
          proteinPer100g: parseNumberBR(f.proteinaPor100g || f.proteina || 0),
          fatPer100g: parseNumberBR(f.gorduraPor100g || f.gordura || 0),
          serving_qty: f.serving_qty || null,
          serving_unit: f.serving_unit || null,
          serving_g: f.serving_g || null,
        }));

        if (!alive) return;
        setFoods(fallback);
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchFoods();

    return () => {
      alive = false;
    };
  }, [isOpen, query]);

  const filteredFoods = useMemo(() => {
    if (!query) return foods;
    const q = query.toLowerCase();
    return foods.filter((f) => (f.nome || "").toLowerCase().includes(q));
  }, [foods, query]);

  function openFood(food) {
    setSelectedFood(food);

    const hasServing = !!(food?.serving_g && food?.serving_unit);
    if (hasServing) {
      setQtyMode("serving");
      setServingCount(food.serving_qty || 1);
      const baseQty = food.serving_qty || 1;
      const g = (food.serving_g * (1 / baseQty));
      setGrams(Math.round(g));
    } else {
      setQtyMode("grams");
      setGrams(100);
      setServingCount(1);
    }
  }

  function computeTotals(food) {
    const caloriesPer100g = food?.caloriesPer100g || 0;
    const proteinPer100g = food?.proteinPer100g || 0;

    let g = 0;
    let qtyText = "";

    if (qtyMode === "serving" && food?.serving_g && food?.serving_unit) {
      const baseQty = food.serving_qty || 1;
      const count = parseNumberBR(servingCount) || 0;
      g = food.serving_g * (count / baseQty);
      const unitLabel = pluralizePt(food.serving_unit, count);
      qtyText = `${count} ${unitLabel} (${Math.round(g)} g)`;
    } else {
      g = parseNumberBR(grams) || 0;
      qtyText = `${g} g`;
    }

    const kcal = (caloriesPer100g * g) / 100;
    const protein = (proteinPer100g * g) / 100;

    return { grams: g, quantidadeTexto: qtyText, kcal, protein };
  }

  function confirmPick() {
    if (!selectedFood) return;

    const totals = computeTotals(selectedFood);

    onPick?.({
      nome: selectedFood.nome,
      quantidadeTexto: totals.quantidadeTexto,
      kcal: Math.round(totals.kcal),
      proteina: Number(totals.protein.toFixed(1)),
    });

    setSelectedFood(null);
    setQuery("");
    onClose?.();
  }

  if (!isOpen) return null;

  const totals = selectedFood ? computeTotals(selectedFood) : null;
  const hasServing = !!(selectedFood?.serving_g && selectedFood?.serving_unit);

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Catálogo rápido</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Escolha um alimento</div>
          </div>

          <button style={styles.closeBtn} onClick={onClose}>Fechar</button>
        </div>

        <div style={styles.searchRow}>
          <div style={styles.searchLabel}>Buscar</div>
          <input
            style={styles.searchInput}
            placeholder="Digite para filtrar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <div style={styles.loading}>Carregando alimentos...</div>
        ) : (
          <div style={styles.grid}>
            {filteredFoods.map((food) => (
              <button
                key={food.id}
                style={styles.foodCard}
                onClick={() => openFood(food)}
                title="Selecionar"
              >
                <div style={styles.foodName}>{food.nome}</div>
                <div style={styles.foodMeta}>
                  <span style={{ opacity: 0.85 }}>
                    {food.serving_unit && food.serving_g
                      ? `${food.serving_qty || 1} ${food.serving_unit} (${food.serving_g} g)`
                      : "100 g"}
                  </span>
                  <span style={{ opacity: 0.85 }}>
                    {Math.round(food.caloriesPer100g)} kcal / 100g
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {selectedFood && (
          <div style={styles.qtyBox}>
            <div style={styles.qtyTitle}>
              {selectedFood.nome}
              <span style={{ fontWeight: 500, opacity: 0.75, marginLeft: 10 }}>
                ({selectedFood.descricaoPorcao})
              </span>
            </div>

            {hasServing && (
              <div style={styles.modeRow}>
                <button
                  style={{ ...styles.modeBtn, ...(qtyMode === "serving" ? styles.modeBtnActive : {}) }}
                  onClick={() => setQtyMode("serving")}
                >
                  Porções
                </button>
                <button
                  style={{ ...styles.modeBtn, ...(qtyMode === "grams" ? styles.modeBtnActive : {}) }}
                  onClick={() => setQtyMode("grams")}
                >
                  Gramas
                </button>
              </div>
            )}

            <div style={styles.qtyRow}>
              {qtyMode === "serving" && hasServing ? (
                <>
                  <div style={styles.qtyLabel}>Quantidade</div>
                  <input
                    style={styles.qtyInput}
                    type="number"
                    min="0"
                    step="1"
                    value={servingCount}
                    onChange={(e) => setServingCount(e.target.value)}
                  />
                  <div style={styles.qtyHint}>
                    {selectedFood.serving_qty || 1} {selectedFood.serving_unit} = {selectedFood.serving_g} g
                  </div>
                </>
              ) : (
                <>
                  <div style={styles.qtyLabel}>Quantidade (g)</div>
                  <input
                    style={styles.qtyInput}
                    type="number"
                    min="0"
                    step="1"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                  />
                  <div style={styles.qtyHint}>Digite o peso em gramas</div>
                </>
              )}
            </div>

            {totals && (
              <div style={styles.previewRow}>
                <div style={styles.previewItem}>
                  <div style={styles.previewLabel}>Resumo</div>
                  <div style={styles.previewValue}>{totals.quantidadeTexto}</div>
                </div>
                <div style={styles.previewItem}>
                  <div style={styles.previewLabel}>Calorias</div>
                  <div style={styles.previewValue}>{Math.round(totals.kcal)} kcal</div>
                </div>
                <div style={styles.previewItem}>
                  <div style={styles.previewLabel}>Proteína</div>
                  <div style={styles.previewValue}>{totals.protein.toFixed(1)} g</div>
                </div>
              </div>
            )}

            <div style={styles.qtyActions}>
              <button style={styles.cancelBtn} onClick={() => setSelectedFood(null)}>
                Voltar
              </button>
              <button style={styles.confirmBtn} onClick={confirmPick}>
                Adicionar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 9999,
  },
  modal: {
    width: "min(1100px, 98vw)",
    maxHeight: "90vh",
    overflow: "auto",
    borderRadius: 16,
    background: "#0e1420",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
    padding: 18,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  closeBtn: {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "8px 12px",
    borderRadius: 10,
    cursor: "pointer",
  },
  searchRow: { marginBottom: 14 },
  searchLabel: { fontSize: 12, opacity: 0.75, marginBottom: 6, color: "white" },
  searchInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
  },
  loading: { color: "white", opacity: 0.8, padding: 18 },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 },
  foodCard: {
    textAlign: "left",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 12,
    cursor: "pointer",
    color: "white",
  },
  foodName: { fontWeight: 700, marginBottom: 6 },
  foodMeta: { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 },
  qtyBox: { marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", color: "white" },
  qtyTitle: { fontSize: 16, fontWeight: 800, marginBottom: 10 },
  modeRow: { display: "flex", gap: 10, marginBottom: 10 },
  modeBtn: {
    background: "rgba(255,255,255,0.05)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "6px 10px",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 12,
  },
  modeBtnActive: { background: "rgba(34, 197, 94, 0.18)", border: "1px solid rgba(34, 197, 94, 0.45)" },
  qtyRow: { display: "grid", gridTemplateColumns: "140px 160px 1fr", gap: 10, alignItems: "center" },
  qtyLabel: { opacity: 0.85, fontSize: 13 },
  qtyInput: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
  },
  qtyHint: { fontSize: 12, opacity: 0.7 },
  previewRow: { marginTop: 12, display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 10 },
  previewItem: {
    padding: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  previewLabel: { fontSize: 12, opacity: 0.7, marginBottom: 4 },
  previewValue: { fontWeight: 800 },
  qtyActions: { marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 },
  cancelBtn: {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 14px",
    borderRadius: 12,
    cursor: "pointer",
  },
  confirmBtn: {
    background: "rgba(34, 197, 94, 0.95)",
    color: "#06110a",
    border: "none",
    padding: "10px 14px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 900,
  },
};
