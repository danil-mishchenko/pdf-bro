import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileText, X, Scissors, Loader2 } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { parsePageRanges, processPdf, generateFileName } from '@/lib/pdf';
import { Toast, ToastType } from '@/components/Toast';

type AppState = 'EMPTY' | 'LOADED' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
type Mode = 'keep' | 'remove';

interface ToastData {
  id: string;
  type: ToastType;
  message: string;
}

const MAX_FILE_SIZE = 250 * 1024 * 1024; // 250 MB

export default function App() {
  const [state, setState] = useState<AppState>('EMPTY');
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [mode, setMode] = useState<Mode>('keep');
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [shake, setShake] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => {
      const newToasts = [...prev, { id, type, message }];
      return newToasts.slice(-2); // Keep max 2 toasts
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const resetState = () => {
    setState('EMPTY');
    setFile(null);
    setFileBuffer(null);
    setTotalPages(0);
    setMode('keep');
    setInputValue('');
    setInputError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFile = async (selectedFile: File) => {
    if (!selectedFile) return;

    // Validation 1: Type
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      addToast('error', 'Поддерживаются только PDF-файлы');
      return;
    }

    // Validation 2: Size
    if (selectedFile.size > MAX_FILE_SIZE) {
      addToast('error', 'Файл слишком большой. Максимум — 250 МБ');
      return;
    }

    try {
      const buffer = await selectedFile.arrayBuffer();
      
      // Validation 3: Load PDF
      let pdfDoc;
      try {
        pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      } catch (err) {
        throw new Error('FILE_CORRUPTED');
      }

      // Validation 4: Encrypted
      if (pdfDoc.isEncrypted) {
        throw new Error('FILE_ENCRYPTED');
      }

      // Validation 5: Empty
      const count = pdfDoc.getPageCount();
      if (count === 0) {
        throw new Error('FILE_EMPTY');
      }

      setFile(selectedFile);
      setFileBuffer(buffer);
      setTotalPages(count);
      setState('LOADED');
      
      // Auto-focus input after a short delay to allow render
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);

    } catch (err: any) {
      const msg = err.message;
      if (msg === 'FILE_CORRUPTED') addToast('error', 'Не удалось прочитать файл. Возможно, он повреждён');
      else if (msg === 'FILE_ENCRYPTED') addToast('error', 'Файл защищён паролем');
      else if (msg === 'FILE_EMPTY') addToast('error', 'Файл не содержит страниц');
      else addToast('error', 'Ошибка при загрузке файла');
      resetState();
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files.length > 1) {
      addToast('error', 'Пожалуйста, загрузите один файл');
      return;
    }
    
    handleFile(e.dataTransfer.files[0]);
  };

  const handleExecute = async () => {
    if (!fileBuffer || !file) return;

    const parseResult = parsePageRanges(inputValue, totalPages);
    
    if (!parseResult.success) {
      setInputError('Не найдено ни одной подходящей страницы');
      setShake(true);
      setTimeout(() => setShake(false), 300);
      inputRef.current?.focus();
      return;
    }

    setInputError(null);
    setState('PROCESSING');

    try {
      // Small delay to allow UI to update to PROCESSING state
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const resultBytes = await processPdf(fileBuffer, parseResult.pages!, mode, totalPages);
      
      const blob = new Blob([resultBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = generateFileName(file.name, mode);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      setState('SUCCESS');
      addToast('success', 'Файл успешно обработан и скачан');
      
      // Trigger celebration
      setShowCelebration(true);
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']
      });
      
      setTimeout(() => {
        setShowCelebration(false);
      }, 3000);
      
      // Reset to loaded after a delay to allow another operation
      setTimeout(() => {
        setState('LOADED');
        setInputValue('');
      }, 3500);

    } catch (err: any) {
      setState('ERROR');
      if (err.message === 'EMPTY_RESULT') {
        setInputError('Нельзя удалить все страницы');
        setShake(true);
        setTimeout(() => setShake(false), 300);
        inputRef.current?.focus();
        setState('LOADED');
      } else {
        addToast('error', 'Что-то пошло не так. Попробуйте ещё раз');
        setState('LOADED');
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const isExecuteDisabled = !inputValue.trim() || state === 'PROCESSING';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50 font-sans selection:bg-indigo-500/30 flex flex-col items-center justify-center p-4 md:p-8 transition-colors duration-300">
      
      <main className="w-full max-w-[520px] mx-auto relative">
        
        {/* EMPTY STATE */}
        {state === 'EMPTY' && (
          <div
            role="button"
            aria-label="Загрузить PDF"
            tabIndex={0}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? fileInputRef.current?.click() : null}
            className={cn(
              'group relative flex flex-col items-center justify-center w-full aspect-[4/3] md:aspect-video rounded-2xl border-2 border-dashed transition-all duration-200 ease-out cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
              isDragging 
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10 scale-[1.02]' 
                : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
            )}
          >
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            
            <div className="flex flex-col items-center gap-4 p-6 text-center z-10">
              <div className={cn(
                "p-4 rounded-full transition-colors duration-200",
                isDragging ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10 group-hover:text-indigo-500"
              )}>
                <UploadCloud className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-medium mb-1">Перетащите PDF сюда</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">или нажмите для выбора</p>
              </div>
            </div>
            
            <div className="absolute bottom-4 text-xs text-slate-400 dark:text-slate-500 font-medium tracking-wide">
              Макс. 250 МБ • Только .pdf
            </div>
          </div>
        )}

        {/* LOADED / PROCESSING / SUCCESS / ERROR STATE */}
        {state !== 'EMPTY' && file && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
            
            {/* File Card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700/50 flex items-center gap-4 relative overflow-hidden">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0 pr-8">
                <h3 className="font-medium text-slate-900 dark:text-slate-100 truncate" title={file.name}>
                  {file.name}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {formatSize(file.size)} • {totalPages} страниц
                </p>
              </div>
              <button
                onClick={resetState}
                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Сбросить файл"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Segmented Control */}
            <div 
              className="bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-xl flex relative"
              role="radiogroup"
              aria-label="Режим обработки"
            >
              <div 
                className="absolute inset-y-1 w-[calc(50%-4px)] bg-white dark:bg-slate-700 rounded-lg shadow-sm transition-transform duration-250 ease-in-out"
                style={{ transform: `translateX(${mode === 'keep' ? '4px' : 'calc(100% + 4px)'})` }}
              />
              <button
                role="radio"
                aria-checked={mode === 'keep'}
                onClick={() => setMode('keep')}
                className={cn(
                  "flex-1 py-2.5 text-sm font-medium rounded-lg relative z-10 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                  mode === 'keep' ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                Оставить
              </button>
              <button
                role="radio"
                aria-checked={mode === 'remove'}
                onClick={() => setMode('remove')}
                className={cn(
                  "flex-1 py-2.5 text-sm font-medium rounded-lg relative z-10 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                  mode === 'remove' ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                Удалить
              </button>
            </div>

            {/* Input Field */}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="1, 3, 5-10"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    if (inputError) setInputError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isExecuteDisabled) {
                      handleExecute();
                    }
                  }}
                  className={cn(
                    "w-full bg-white dark:bg-slate-800 border px-4 py-3.5 rounded-xl text-base outline-none transition-all duration-200 placeholder:text-slate-400 dark:placeholder:text-slate-500",
                    inputError 
                      ? "border-red-300 dark:border-red-500/50 focus:border-red-500 focus:ring-4 focus:ring-red-500/10" 
                      : "border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10",
                    shake && "animate-shake"
                  )}
                  aria-invalid={!!inputError}
                  aria-describedby={inputError ? "input-error" : "input-hint"}
                />
              </div>
              <p 
                id={inputError ? "input-error" : "input-hint"}
                className={cn(
                  "text-sm px-1 transition-colors duration-200",
                  inputError ? "text-red-500 dark:text-red-400 font-medium" : "text-slate-500 dark:text-slate-400"
                )}
                aria-live={inputError ? "assertive" : "off"}
              >
                {inputError || "Укажите страницы или диапазоны через запятую"}
              </p>
            </div>

            {/* Execute Button */}
            <div className="mt-2 md:mt-4 sticky bottom-4 z-20">
              <button
                onClick={handleExecute}
                disabled={isExecuteDisabled}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-4 rounded-xl font-medium text-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900",
                  isExecuteDisabled
                    ? "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 active:shadow-indigo-500/20"
                )}
              >
                {state === 'PROCESSING' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Обработка...</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-5 h-5" />
                    <span>Выполнить</span>
                  </>
                )}
              </button>
            </div>

          </div>
        )}
      </main>

      {/* Toasts Container */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full px-4 items-center pointer-events-none">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onClose={removeToast} />
        ))}
      </div>

      {/* Celebration Overlay */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ scale: 0, opacity: 0, rotate: -15 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0, rotate: 15 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          >
            <img 
              src="/danko-like.png" 
              alt="Успех!" 
              className="w-64 h-64 md:w-80 md:h-80 object-contain drop-shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
