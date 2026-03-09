import React from 'react';

function LevelPreviewModal({ isOpen, level, onClose }) {
  if (!isOpen || !level) return null;

  return (
    <div className="level-preview-overlay" role="presentation" onClick={onClose}>
      <div
        className="level-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="level-preview-close" onClick={onClose} aria-label="Fechar preview">
          ×
        </button>
        <img src={level.avatar} alt={`Avatar ${level.label}`} className="level-preview-avatar" />
        <h4 id="level-preview-title">{level.label}</h4>
        <p>{level.description}</p>
        <span className="level-preview-objective">Objetivo: {level.objective}</span>
      </div>
    </div>
  );
}

export default LevelPreviewModal;
