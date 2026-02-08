import React, { useEffect, useState } from 'react';

const MobileActionButtons = ({ buttons = [] }) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const updateMatch = () => setIsMobile(mediaQuery.matches);
    updateMatch();
    mediaQuery.addEventListener('change', updateMatch);
    return () => mediaQuery.removeEventListener('change', updateMatch);
  }, []);

  if (!isMobile || buttons.length === 0) {
    return null;
  }

  return (
    <div className="fab-stack" aria-label="Ações rápidas">
      {buttons.map((button) => (
        <button
          key={button.label}
          type="button"
          className="fab-button"
          onClick={button.onClick}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
};

export default MobileActionButtons;
