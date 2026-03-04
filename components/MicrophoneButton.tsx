import React from 'react';

interface MicrophoneButtonProps {
  isListening: boolean;
  onStart: () => void;
  onStop: () => void;
  label?: string;
  size?: 'sm' | 'lg';
  disabled?: boolean;
}

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({ 
  isListening, 
  onStart,
  onStop,
  label = "hold to speak",
  size = 'lg',
  disabled = false
}) => {
  // Prevent context menu on long press (especially on mobile)
  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <button
        onMouseDown={onStart}
        onMouseUp={onStop}
        onMouseLeave={onStop} // Stop if mouse drags out
        onTouchStart={onStart}
        onTouchEnd={onStop}
        onContextMenu={handleContextMenu}
        disabled={disabled}
        className={`
          relative flex items-center justify-center rounded-full transition-all duration-200 shadow-lg select-none touch-none
          ${disabled ? 'bg-gray-300 cursor-not-allowed' : isListening ? 'bg-red-500 scale-110 active:scale-95' : 'bg-blue-500 hover:bg-blue-600 active:scale-95'}
          ${size === 'lg' ? 'w-24 h-24' : 'w-16 h-16'}
        `}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {isListening && (
          <span className="absolute w-full h-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
        )}
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width={size === 'lg' ? 40 : 24} 
          height={size === 'lg' ? 40 : 24} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="white" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>
      <p className={`text-gray-600 font-bold lowercase ${size === 'lg' ? 'text-lg' : 'text-sm'}`}>
        {isListening ? "listening..." : label}
      </p>
    </div>
  );
};

export default MicrophoneButton;
