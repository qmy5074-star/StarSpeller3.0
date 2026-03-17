import React from 'react';

interface MicrophoneButtonProps {
  isListening: boolean;
  onStart: () => void;
  onStop: () => void;
  label?: string;
  size?: 'md' | 'lg';
}

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({ isListening, onStart, onStop, label, size = 'md' }) => {
  const sizeClasses = size === 'lg' ? 'w-24 h-24' : 'w-16 h-16';
  const iconSize = size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onMouseDown={onStart}
        onMouseUp={onStop}
        onMouseLeave={onStop}
        onTouchStart={onStart}
        onTouchEnd={onStop}
        className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${sizeClasses} ${
          isListening 
            ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.6)] scale-110' 
            : 'bg-blue-100 text-blue-500 hover:bg-blue-200 hover:scale-105'
        }`}
      >
        {isListening && (
          <span className="absolute inset-0 rounded-full border-4 border-red-400 animate-ping opacity-75"></span>
        )}
        <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </button>
      {label && (
        <span className={`font-bold uppercase tracking-widest text-xs ${isListening ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}>
          {isListening ? 'Listening...' : label}
        </span>
      )}
    </div>
  );
};

export default MicrophoneButton;
