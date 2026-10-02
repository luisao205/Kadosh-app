import React from 'react';

const InternalScreenCanva = ({ state, label = 'Presentación Canva' }) => {
  if (!state?.active || !state?.embedUrl) return null;

  return (
    <div className="fixed inset-0 z-[85] h-[100dvh] w-screen overflow-hidden bg-black">
      <iframe
        key={state.embedUrl}
        src={state.embedUrl}
        title={state.title || label}
        className="h-full w-full border-0 bg-black"
        allow="fullscreen"
        allowFullScreen
        loading="eager"
      />
    </div>
  );
};

export default InternalScreenCanva;
