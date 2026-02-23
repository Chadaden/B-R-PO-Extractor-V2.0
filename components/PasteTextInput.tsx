
import React, { useState } from 'react';
import { ClipboardPasteIcon } from './Icons';

interface PasteTextInputProps {
  onExtract: (text: string) => void;
  isLoading: boolean;
}

const PasteTextInput: React.FC<PasteTextInputProps> = ({ onExtract, isLoading }) => {
  const [text, setText] = useState('');
  const canExtract = text.length >= 80 && !isLoading;

  const handleExtractClick = () => {
    if (canExtract) {
      onExtract(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleExtractClick();
    }
  };

  return (
    <div className="w-full text-center border-2 border-dashed rounded-lg p-8 border-slate-300 bg-slate-50">
      <div className="flex flex-col items-center">
        <ClipboardPasteIcon className="h-12 w-12 text-slate-400 mb-4" />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="w-full h-48 p-3 text-sm text-slate-700 bg-white border border-slate-300 rounded-md focus:ring-amber-500 focus:border-amber-500 transition-colors"
          placeholder={`Paste purchase order text here…
Tip: From email/Word/Excel press Ctrl+A then Ctrl+C, then paste here.`}
        />
        <button
          onClick={handleExtractClick}
          disabled={!canExtract}
          className="mt-4 px-6 py-2 bg-amber-600 text-white font-semibold rounded-lg shadow-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all"
        >
          {isLoading ? 'Processing...' : 'Extract from Text'}
        </button>
        {!isLoading && text.length > 0 && text.length < 80 && (
          <p className="text-xs text-slate-500 mt-2">
            Please paste at least 80 characters of text to enable extraction.
          </p>
        )}
      </div>
    </div>
  );
};

export default PasteTextInput;
