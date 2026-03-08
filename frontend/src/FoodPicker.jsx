import React, { useEffect, useState } from 'react';
import { FOOD_CATALOG } from './foodCatalog';
import { DEFAULT_FOOD_ICON, FOOD_ICONS } from './foodIcons';
import { supabase } from './supabaseClient';

const parseBaseGrams = (descricaoPorcao) => {
  if (!descricaoPorcao) return 100;
  const match = descricaoPorcao.match(/(\d+(?:[.,]\d+)?)\s*g/i);
  if (!match) return 100;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) ? value : 100;
};

const round1 = (n) => Math.round(n * 10) / 10;
const round0 = (n) => Math.round(n);

function FoodPicker({ open, onClose, onSelectFood }) {
  const [query, setQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [grams, setGrams] = useState('');
  const [foods, setFoods] = useState(FOOD_CATALOG);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [caloriesCalc, setCaloriesCalc] = useState(0);
  const [proteinCalc, setProteinCalc] = useState(0);

  const normalizedQuery = query.trim();

  useEffect(() => {
    if (!open) return;

    const term = normalizedQuery;
    if (!term) {
      setFoods(FOOD_CATALOG);
      setIsLoading(false);
      setErrorMessage('');
      return;
    }

    if (term.length < 2) {
      setFoods(FOOD_CATALOG);
      setIsLoading(false);
      setErrorMessage('');
      return;
    }

    let shouldCancel = false;
    const timeoutId = setTimeout(async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const { data, error } = await supabase
          .from('taco_foods')
          .select('*')
          .ilike('name', `%${term}%`)
          .limit(20);

        if (error) {
          throw error;
        }

        if (shouldCancel) {
          return;
        }

        const mapped = Array.isArray(data)
          ? data.map((item, index) => {
              const servingQty = Number(item?.serving_qty);
              const parsedQty = Number.isFinite(servingQty) ? servingQty : 1;
              const servingUnit = item?.serving_unit || 'porção';
              const servingG = Number(item?.serving_g);
              const servingGText = Number.isFinite(servingG) ? ` (${round0(servingG)} g)` : '';

              return {
                id: `taco-${item?.id || index}`,
                nome: item?.name || 'Alimento',
                descricaoPorcao: `${parsedQty} ${servingUnit}${servingGText}`,
                kcalPorPorcao: Number(item?.kcal) || 0,
                proteina: Number(item?.protein_g) || 0,
                gordura: Number(item?.fat_g) || 0,
                carboidrato: Number(item?.carbs_g) || 0,
                fibra: Number(item?.fiber_g) || 0,
                serving_g: Number.isFinite(servingG) ? servingG : 100,
                serving_qty: parsedQty,
                serving_unit: servingUnit,
              };
            })
          : [];

        setFoods(mapped);
      } catch (error) {
        if (shouldCancel) {
          return;
        }
        console.error('Erro ao buscar alimentos:', error);
        setErrorMessage('Não foi possível buscar alimentos no momento.');
        setFoods([]);
      } finally {
        if (!shouldCancel) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      shouldCancel = true;
      clearTimeout(timeoutId);
    };
  }, [normalizedQuery, open]);

  if (!open) return null;

  const handleClose = () => {
    setSelectedFood(null);
    setQuery('');
    setGrams('');
    setFoods(FOOD_CATALOG);
    setIsLoading(false);
    setErrorMessage('');
    setCaloriesCalc(0);
    setProteinCalc(0);
    if (onClose) {
      onClose();
    }
  };

  const handlePick = (food) => {
    setSelectedFood(food);
    const baseServing = food.serving_g && food.serving_g > 0
      ? food.serving_g
      : parseBaseGrams(food.descricaoPorcao);
    setGrams(String(baseServing));
  };

  const baseGrams = selectedFood
    ? (selectedFood.serving_g && selectedFood.serving_g > 0
      ? selectedFood.serving_g
      : 100)
    : 100;
  const gramsNumber = Number(grams);
  const gramsValue = Number.isFinite(gramsNumber) ? gramsNumber : 0;

  useEffect(() => {
    if (!selectedFood) return;

    const quantity = Number(grams);
    if (!quantity || quantity <= 0) {
      setCaloriesCalc(0);
      setProteinCalc(0);
      return;
    }

    const calories = (quantity / baseGrams) * (selectedFood.kcalPorPorcao || 0);
    const protein = (quantity / baseGrams) * (selectedFood.proteina || 0);

    setCaloriesCalc(Number(calories.toFixed(1)));
    setProteinCalc(Number(protein.toFixed(1)));
  }, [grams, selectedFood, baseGrams]);

  const fatCalc = selectedFood && gramsValue > 0
    ? round1(((selectedFood.gordura ?? 0) / baseGrams) * gramsValue)
    : 0;
  const carbsCalc = selectedFood && gramsValue > 0
    ? round1(((selectedFood.carboidrato ?? 0) / baseGrams) * gramsValue)
    : 0;
  const fiberCalc = selectedFood && gramsValue > 0
    ? round1(((selectedFood.fibra ?? 0) / baseGrams) * gramsValue)
    : 0;

  const handleConfirm = () => {
    if (!selectedFood || !onSelectFood) return;
    onSelectFood({
      name: selectedFood.nome,
      calories: caloriesCalc,
      protein: proteinCalc,
      fat: fatCalc,
      carbs: carbsCalc,
      fiber: fiberCalc,
      serving_g: selectedFood.serving_g,
      serving_qty: selectedFood.serving_qty,
      serving_unit: selectedFood.serving_unit,
      quantity: gramsValue,
    });
    handleClose();
  };

  return (
    <div className="food-picker-overlay" onClick={handleClose}>
      <div className="food-picker-card card" onClick={(e) => e.stopPropagation()}>
        <div className="food-picker-header">
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              {selectedFood ? 'Adicionar ao diário alimentar' : 'Catálogo rápido'}
            </div>
            <h4 className="title" style={{ margin: '4px 0 0' }}>
              {selectedFood ? 'Ajuste a quantidade' : 'Escolha um alimento'}
            </h4>
          </div>
          <button type="button" className="ghost" onClick={handleClose}>
            Fechar
          </button>
        </div>

        {!selectedFood && (
          <>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Buscar</label>
              <input
                type="text"
                placeholder="Digite para filtrar"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="food-picker-grid">
              {isLoading && (
                <div className="muted" style={{ fontSize: 13 }}>
                  Buscando alimentos...
                </div>
              )}

              {!isLoading && errorMessage && (
                <div className="muted" style={{ fontSize: 13 }}>
                  {errorMessage}
                </div>
              )}

              {!isLoading &&
                foods.map((item) => {
                const Icon = FOOD_ICONS[item.icon] || DEFAULT_FOOD_ICON;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className="food-picker-item"
                    onClick={() => handlePick(item)}
                  >
                    <div className="food-picker-icon">
                      <Icon size={26} />
                    </div>
                    <div className="food-picker-info">
                      <div className="food-picker-name">{item.nome}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {item.descricaoPorcao}
                      </div>
                    </div>
                    <div className="food-picker-meta">
                      {item.kcalPorPorcao} kcal
                    </div>
                  </button>
                );
              })}

              {!isLoading && foods.length === 0 && (
                <div className="muted" style={{ fontSize: 13 }}>
                  Nenhum alimento encontrado
                </div>
              )}
            </div>
          </>
        )}

        {selectedFood && (
          <div className="food-picker-step">
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                Alimento selecionado
              </div>
              <div className="title" style={{ marginTop: 4 }}>
                {selectedFood.nome}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Porção base: {selectedFood.descricaoPorcao}
              </div>
            </div>

            <div className="field">
              <label>Quantidade (g)</label>
              <input
                type="number"
                min={1}
                step={1}
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
              />
            </div>

            <div className="food-picker-macros">
              <div className="food-picker-macro-card">
                <div className="muted" style={{ fontSize: 12 }}>
                  Calorias
                </div>
                <div className="title">{caloriesCalc} kcal</div>
              </div>
              <div className="food-picker-macro-card">
                <div className="muted" style={{ fontSize: 12 }}>
                  Proteínas
                </div>
                <div className="title">{proteinCalc} g</div>
              </div>
            </div>

            <div className="food-picker-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setSelectedFood(null)}
              >
                Voltar
              </button>
              <button type="button" className="primary" onClick={handleConfirm}>
                Salvar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FoodPicker;
