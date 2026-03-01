import React, { useEffect, useMemo, useState } from 'react';
import { FOOD_CATALOG } from './foodCatalog';
import { DEFAULT_FOOD_ICON, FOOD_ICONS } from './foodIcons';

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

  const fallbackFoods = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return FOOD_CATALOG;
    return FOOD_CATALOG.filter((food) =>
      food.nome.toLowerCase().includes(term)
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;

    const term = query.trim();
    if (!term) {
      setFoods(FOOD_CATALOG);
      setIsLoading(false);
      setErrorMessage('');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const baseUrl = (window.APP_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
        const response = await fetch(
          `${baseUrl}/api/foods/search?q=${encodeURIComponent(term)}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error('Falha ao buscar alimentos.');
        }

        const data = await response.json();
        const mapped = Array.isArray(data)
          ? data.map((item, index) => ({
              id: `api-${index}-${item?.name || 'alimento'}`,
              nome: item?.name || 'Alimento',
              descricaoPorcao: item?.portion || '100 g',
              kcalPorPorcao: item?.calories ?? 0,
              proteina: item?.protein ?? 0
            }))
          : [];

        setFoods(mapped);
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
        console.error('Erro ao buscar alimentos:', error);
        setErrorMessage('Não foi possível buscar alimentos no momento.');
        setFoods(fallbackFoods);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fallbackFoods, open, query]);

  if (!open) return null;

  const handleClose = () => {
    setSelectedFood(null);
    setQuery('');
    setGrams('');
    setFoods(FOOD_CATALOG);
    setIsLoading(false);
    setErrorMessage('');
    if (onClose) {
      onClose();
    }
  };

  const handlePick = (food) => {
    setSelectedFood(food);
    setGrams(String(parseBaseGrams(food.descricaoPorcao)));
  };

  const baseGrams = selectedFood
    ? parseBaseGrams(selectedFood.descricaoPorcao)
    : 100;
  const gramsNumber = Number(grams);
  const gramsValue =
    Number.isFinite(gramsNumber) && gramsNumber > 0 ? gramsNumber : baseGrams;

  const kcalCalc = selectedFood
    ? round0((selectedFood.kcalPorPorcao / baseGrams) * gramsValue)
    : 0;
  const protCalc = selectedFood
    ? round1(((selectedFood.proteina ?? 0) / baseGrams) * gramsValue)
    : 0;

  const handleConfirm = () => {
    if (!selectedFood || !onSelectFood) return;
    onSelectFood({
      nome: selectedFood.nome,
      quantidadeTexto: `${gramsValue} g`,
      kcal: kcalCalc,
      proteina: protCalc
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
                  Nenhum alimento encontrado.
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
                <div className="title">{kcalCalc} kcal</div>
              </div>
              <div className="food-picker-macro-card">
                <div className="muted" style={{ fontSize: 12 }}>
                  Proteínas
                </div>
                <div className="title">{protCalc} g</div>
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
