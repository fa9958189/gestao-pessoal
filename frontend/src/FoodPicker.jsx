import React, { useMemo, useState } from 'react';
import { FOOD_CATALOG } from './foodCatalog';
import { DEFAULT_FOOD_ICON, FOOD_ICONS } from './foodIcons';

function FoodPicker({ open, onClose, onSelectFood }) {
  const [query, setQuery] = useState('');

  const filteredFoods = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return FOOD_CATALOG;
    return FOOD_CATALOG.filter((food) =>
      food.nome.toLowerCase().includes(term)
    );
  }, [query]);

  if (!open) return null;

  const handlePick = (food) => {
    if (!onSelectFood) return;
    onSelectFood({
      nome: food.nome,
      quantidadeTexto: food.descricaoPorcao,
      kcal: food.kcalPorPorcao,
      proteina: food.proteina ?? 0
    });
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="food-picker-overlay" onClick={onClose}>
      <div className="food-picker-card card" onClick={(e) => e.stopPropagation()}>
        <div className="food-picker-header">
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Catálogo rápido
            </div>
            <h4 className="title" style={{ margin: '4px 0 0' }}>
              Escolha um alimento
            </h4>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Fechar
          </button>
        </div>

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
          {filteredFoods.map((item) => {
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
                <div className="food-picker-meta">{item.kcalPorPorcao} kcal</div>
              </button>
            );
          })}

          {filteredFoods.length === 0 && (
            <div className="muted" style={{ fontSize: 13 }}>
              Nenhum alimento encontrado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FoodPicker;
