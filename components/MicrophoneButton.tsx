import React from 'react';

interface MicrophoneButtonProps {
  isListening: boolean;
  onStart: () => void;
  onStop: () => void;
  label?: string;
  size?: 'md' | 'lg';
}

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({ isListening, onStart, onStop, label, size = 'md' }) => {
  const sizeClasses = size === 'lg' ? 'w-28 h-28' : 'w-20 h-20';
  const iconSize = size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';

  const handleStart = () => {
    if (navigator.vibrate) navigator.vibrate(50);
    onStart();
  };

  const handleStop = () => {
    if (isListening && navigator.vibrate) navigator.vibrate(30);
    onStop();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-20 scale-150"></span>
            <span className="absolute inset-0 rounded-full bg-red-500 animate-pulse opacity-30 scale-125"></span>
          </>
        )}
        <button
          onMouseDown={handleStart}
          onMouseUp={handleStop}
          onMouseLeave={handleStop}
          onTouchStart={(e) => { e.preventDefault(); handleStart(); }}
          onTouchEnd={(e) => { e.preventDefault(); handleStop(); }}
          className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-300 shadow-lg ${sizeClasses} ${
            isListening 
              ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.8)] scale-110' 
              : 'bg-white text-blue-500 hover:bg-blue-50 hover:scale-105 border-4 border-blue-100'
          }`}
        >
          <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>
      </div>
      {label && (
        <div className="flex flex-col items-center">
          <span className={`font-black uppercase tracking-widest text-sm ${isListening ? 'text-red-500 animate-pulse' : 'text-blue-400'}`}>
            {isListening ? 'Listening...' : label}
          </span>
          {isListening && (
            <span className="text-[10px] text-red-400 font-bold mt-1">Release to finish</span>
          )}
        </div>
      )}
    </div>
  );
};

export default MicrophoneButton;
