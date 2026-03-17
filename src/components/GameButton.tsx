import React from 'react';

interface GameButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'purple' | 'red' | 'white';
  fullWidth?: boolean;
  className?: string;
  disabled?: boolean;
}

export const GameButton: React.FC<GameButtonProps> = ({ 
  onClick, 
  children, 
  color = 'blue', 
  fullWidth = false, 
  className = '', 
  disabled = false 
}) => {
  const colors = {
    blue: 'bg-blue-500 hover:bg-blue-600 border-blue-700 text-white',
    green: 'bg-green-500 hover:bg-green-600 border-green-700 text-white',
    yellow: 'bg-yellow-400 hover:bg-yellow-500 border-yellow-600 text-yellow-900',
    purple: 'bg-purple-500 hover:bg-purple-600 border-purple-700 text-white',
    red: 'bg-red-500 hover:bg-red-600 border-red-700 text-white',
    white: 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'
  };
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${colors[color]}
        border-b-4 active:border-b-0 active:translate-y-1 transition-all rounded-2xl font-black shadow-lg
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}
        px-6 py-3
        ${className}
      `}
    >
      {children}
    </button>
  );
};
