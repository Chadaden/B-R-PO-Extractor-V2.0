import React, { useRef, useState } from 'react';
import { UploadIcon } from './Icons';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  isLoading: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onFileSelect(file);
    // Reset file input to allow re-uploading the same file
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };
  
  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  return (
    <div 
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`w-full text-center border-2 border-dashed rounded-lg p-8 transition-colors duration-200 ${dragActive ? 'border-amber-600 bg-amber-50' : 'border-slate-300 hover:border-slate-400'}`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="application/pdf"
        disabled={isLoading}
      />
      <div className="flex flex-col items-center">
        <UploadIcon className="h-12 w-12 text-slate-400 mb-4" />
        <p className="mb-2 text-slate-700">
          <span className="font-semibold">Click to upload</span> or drag and drop
        </p>
        <p className="text-sm text-slate-500">PDF only</p>
        <button
          onClick={handleButtonClick}
          disabled={isLoading}
          className="mt-4 px-6 py-2 bg-amber-600 text-white font-semibold rounded-lg shadow-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all"
        >
          {isLoading ? 'Processing...' : 'Select PDF'}
        </button>
      </div>
    </div>
  );
};

export default FileUpload;