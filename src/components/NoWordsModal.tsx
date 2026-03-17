import React, { useState } from 'react';
import { GameButton } from './GameButton';

interface NoWordsModalProps {
  onClose: () => void;
  onInputWord: () => void;
  onRandomChallenge: () => void;
}

export const NoWordsModal: React.FC<NoWordsModalProps> = ({ onClose, onInputWord, onRandomChallenge }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full text-center">
        <h2 className="text-2xl font-black text-gray-800 mb-4">No new words today</h2>
        <p className="text-gray-600 mb-8">Input a word to practice or try a random challenge!</p>
        <div className="flex flex-col gap-3">
          <GameButton onClick={onInputWord} color="green" fullWidth>
            Input Word
          </GameButton>
          <GameButton onClick={onRandomChallenge} color="purple" fullWidth>
            Random Challenge
          </GameButton>
          <button onClick={onClose} className="text-gray-400 font-bold mt-4 hover:text-gray-600">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
