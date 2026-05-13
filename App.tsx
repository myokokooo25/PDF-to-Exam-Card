
import React, { useState, useRef, useEffect } from 'react';
import { processPageImages, processGeneralTranslation, extractVocabulary } from './geminiService';
import { StudyCardData, AppStatus, HistorySession, AppMode, TranslationItem, VocabItem } from './types';

// PDF.js worker setup
// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [data, setData] = useState<StudyCardData[]>([]);
  const [translationData, setTranslationData] = useState<TranslationItem[]>([]);
  const [vocabData, setVocabData] = useState<VocabItem[]>([]);
  const [appMode, setAppMode] = useState<AppMode>(AppMode.STUDY_CARDS);
  const [translationText, setTranslationText] = useState("");
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showFurigana, setShowFurigana] = useState(true);
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isExtractingVocab, setIsExtractingVocab] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingTransIndex, setEditingTransIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'vocab'>('preview');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const translationFileInputRef = useRef<HTMLInputElement>(null);

  // Load history from local storage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('examCardHistory');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setHistory(parsed);
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') setIsDarkMode(true);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const saveToHistory = (fileName: string, cards: StudyCardData[], mode: AppMode = AppMode.STUDY_CARDS, transData?: TranslationItem[], vocab?: VocabItem[]) => {
    const newSession: HistorySession = {
      id: Date.now().toString(),
      fileName: fileName,
      timestamp: Date.now(),
      data: cards,
      mode: mode,
      translationData: transData,
      vocabData: vocab || []
    };
    
    const updatedHistory = [newSession, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('examCardHistory', JSON.stringify(updatedHistory));
    setActiveSessionId(newSession.id);
  };

  const loadSession = (session: HistorySession) => {
    const mode = session.mode || AppMode.STUDY_CARDS;
    setAppMode(mode);
    setVocabData(session.vocabData || []);
    if (mode === AppMode.TRANSLATION) {
      setTranslationData(session.translationData || []);
      setData([]);
    } else {
      setData(session.data || []);
      setTranslationData([]);
    }
    setActiveSessionId(session.id);
    setStatus(AppStatus.SUCCESS);
    setActiveTab('preview');
    setUserAnswers({});
    setEditingCardId(null);
    setEditingTransIndex(null);
    if (window.innerWidth < 768) setIsSidebarOpen(false); // Close sidebar on mobile after selection
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updatedHistory = history.filter(h => h.id !== id);
    setHistory(updatedHistory);
    localStorage.setItem('examCardHistory', JSON.stringify(updatedHistory));
    
    if (activeSessionId === id) {
      setData([]);
      setTranslationData([]);
      setVocabData([]);
      setStatus(AppStatus.IDLE);
      setActiveSessionId(null);
    }
  };

  const convertPdfToImages = async (file: File): Promise<string[]> => {
    const arrayBuffer = await file.arrayBuffer();
    // @ts-ignore
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      setProgress(`Page ${i} of ${pdf.numPages} - Reading PDF...`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 3.0 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;
      images.push(canvas.toDataURL('image/jpeg', 0.9));
    }
    return images;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      setVocabData([]);
      setStatus(AppStatus.LOADING_PDF);
      setAppMode(AppMode.STUDY_CARDS);
      
      const images = await convertPdfToImages(file);
      
      setStatus(AppStatus.PROCESSING_AI);
      setProgress("AI is analyzing Japanese text & Furigana...");
      
      const result = await processPageImages(images);
      
      setData(result);
      saveToHistory(file.name, result, AppMode.STUDY_CARDS);
      setStatus(AppStatus.SUCCESS);
      setActiveTab('preview');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during processing.");
      setStatus(AppStatus.ERROR);
    }
  };

  const handleTranslationSubmit = async () => {
    if (!translationText.trim()) return;
    
    try {
      setError(null);
      setVocabData([]);
      setStatus(AppStatus.PROCESSING_AI);
      setProgress("Translating text...");
      
      let textToTranslate = translationText;
      if (textToTranslate.length > 15000) {
        textToTranslate = textToTranslate.substring(0, 15000);
      }
      
      const result = await processGeneralTranslation({ text: textToTranslate });
      
      setTranslationData(result);
      saveToHistory("Text Translation", [], AppMode.TRANSLATION, result);
      setStatus(AppStatus.SUCCESS);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during translation.");
      setStatus(AppStatus.ERROR);
    }
  };

  const handleTranslationFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      setVocabData([]);
      setStatus(AppStatus.LOADING_PDF);
      
      const images = await convertPdfToImages(file);
      
      setStatus(AppStatus.PROCESSING_AI);
      setProgress("Translating PDF...");
      
      const result = await processGeneralTranslation({ images });
      
      setTranslationData(result);
      saveToHistory(file.name, [], AppMode.TRANSLATION, result);
      setStatus(AppStatus.SUCCESS);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during translation.");
      setStatus(AppStatus.ERROR);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportWord = () => {
    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>Study Cards</title>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.5; }
          .card { border: 1px solid #ddd; padding: 20px; margin-bottom: 20px; border-radius: 8px; page-break-inside: avoid; }
          .id-badge { background-color: #e0e7ff; color: #4338ca; padding: 4px 8px; font-weight: bold; border-radius: 4px; display: inline-block; margin-bottom: 10px; font-size: 10pt; }
          .jp-text { font-size: 14pt; margin-bottom: 5px; color: #000; font-family: 'MS Gothic', 'Yu Gothic', sans-serif; }
          .my-text { color: #4b5563; margin-bottom: 15px; font-size: 11pt; }
          .option { margin-bottom: 10px; padding: 10px; border: 1px solid #eee; border-radius: 4px; }
          .correct { background-color: #ecfdf5; border: 2px solid #10b981; }
          .explanation { background-color: #fffbeb; padding: 15px; margin-top: 15px; border-radius: 4px; border: 1px solid #fcd34d; }
          ruby { ruby-align: center; }
          rt { font-size: 0.6em; }
        </style>
      </head>
      <body>
        <h1 style="text-align: center; color: #333;">Architect Exam Study Cards</h1>
    `;

    const bodyContent = data.map(item => `
      <div class="card">
        <div class="id-badge">${item.id}</div>
        <div class="jp-text"><strong>JP:</strong><br/>${item.questionJP}</div>
        <div class="my-text"><strong>MY:</strong><br/>${item.questionMY}</div>
        <div>
          ${item.options.map(opt => `
            <div class="option ${opt.id === item.correctOptionId ? 'correct' : ''}">
              <div style="font-size: 12pt; margin-bottom: 4px;"><strong>${opt.id}.</strong> ${opt.textJP}</div>
              <div style="color: #666; font-size: 10pt;">${opt.textMY}</div>
            </div>
          `).join('')}
        </div>
        <div class="explanation">
          <h3 style="margin-top: 0; color: #92400e;">${item.explanation.titleMY}</h3>
          <p><i>${item.explanation.reasonMY}</i></p>
          <p><strong>💡 Tip:</strong> ${item.explanation.memoryTipMY}</p>
        </div>
      </div><br/>
    `).join('');

    const html = header + bodyContent + "</body></html>";
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Exam-Cards-${new Date().toISOString().slice(0,10)}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStatus(AppStatus.IDLE);
    setData([]);
    setTranslationData([]);
    setVocabData([]);
    setTranslationText("");
    setError(null);
    setActiveSessionId(null);
    setActiveTab('preview');
    setUserAnswers({});
    setEditingCardId(null);
    setEditingTransIndex(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (translationFileInputRef.current) translationFileInputRef.current.value = "";
  };

  const handleExtractVocab = async () => {
    try {
      setIsExtractingVocab(true);
      let textToAnalyze = "";
      if (appMode === AppMode.STUDY_CARDS) {
        textToAnalyze = data.map(d => d.questionJP + " " + d.options.map(o => o.textJP).join(" ")).join("\n");
      } else {
        textToAnalyze = translationData.map(d => d.japanese).join("\n");
      }
      
      // Strip <rt> tags and their contents, then strip remaining HTML tags
      textToAnalyze = textToAnalyze.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]*>?/gm, '');
      
      if (!textToAnalyze.trim()) return;
      
      // Truncate to avoid token limits, 10000 chars is plenty for 10-15 vocab words
      if (textToAnalyze.length > 10000) {
        textToAnalyze = textToAnalyze.substring(0, 10000);
      }
      
      const vocab = await extractVocabulary(textToAnalyze);
      setVocabData(vocab);
      
      // Update history
      const updatedHistory = history.map(h => h.id === activeSessionId ? { ...h, vocabData: vocab } : h);
      setHistory(updatedHistory);
      localStorage.setItem('examCardHistory', JSON.stringify(updatedHistory));
      setActiveTab('vocab');
    } catch (err: any) {
      console.error(err);
      alert("Failed to extract vocabulary: " + err.message);
    } finally {
      setIsExtractingVocab(false);
    }
  };

  const startEditingCard = (card: StudyCardData) => {
    setEditingCardId(card.id);
    setEditForm(JSON.parse(JSON.stringify(card)));
  };

  const saveCardEdit = () => {
    const updatedData = data.map(c => c.id === editingCardId ? editForm : c);
    setData(updatedData);
    setEditingCardId(null);
    const updatedHistory = history.map(h => h.id === activeSessionId ? { ...h, data: updatedData } : h);
    setHistory(updatedHistory);
    localStorage.setItem('examCardHistory', JSON.stringify(updatedHistory));
  };

  const startEditingTrans = (index: number, item: TranslationItem) => {
    setEditingTransIndex(index);
    setEditForm({ ...item });
  };

  const saveTransEdit = () => {
    const updatedData = [...translationData];
    if (editingTransIndex !== null) {
      updatedData[editingTransIndex] = editForm;
    }
    setTranslationData(updatedData);
    setEditingTransIndex(null);
    const updatedHistory = history.map(h => h.id === activeSessionId ? { ...h, translationData: updatedData } : h);
    setHistory(updatedHistory);
    localStorage.setItem('examCardHistory', JSON.stringify(updatedHistory));
  };

  const playAudio = (e: React.MouseEvent, htmlContent: string) => {
    e.stopPropagation();
    if (!window.speechSynthesis) return alert("Text-to-speech not supported in this browser.");
    window.speechSynthesis.cancel();
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const rts = tempDiv.querySelectorAll('rt');
    rts.forEach(rt => rt.remove());
    const text = tempDiv.innerText;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] dark:bg-gray-900 overflow-hidden" id="app-container">
      {/* Sidebar - History */}
      <aside 
        id="sidebar"
        className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 transition-all duration-300 ease-in-out flex flex-col z-20 absolute md:relative h-full overflow-hidden
          ${isSidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full md:w-0 md:-translate-x-0'}
        `}
      >
        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800 min-w-[20rem]">
          <h2 className="font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            History
          </h2>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-gray-600 p-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 min-w-[20rem]">
          {history.length === 0 ? (
            <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
              <p>No saved files yet.</p>
            </div>
          ) : (
            history.map((session) => (
              <div 
                key={session.id}
                onClick={() => loadSession(session)}
                className={`p-3 rounded-xl cursor-pointer group transition-all border border-transparent hover:border-indigo-100 dark:hover:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30
                  ${activeSessionId === session.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 shadow-sm' : 'bg-white dark:bg-gray-800'}
                `}
              >
                <div className="flex justify-between items-start">
                  <h3 className={`font-medium text-sm truncate pr-2 ${activeSessionId === session.id ? 'text-indigo-900 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    {session.fileName}
                  </h3>
                  <button 
                    onClick={(e) => deleteSession(e, session.id)}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(session.timestamp).toLocaleDateString()} • {session.mode === AppMode.TRANSLATION ? `${session.translationData?.length || 0} segments` : `${session.data.length} cards`}
                </p>
              </div>
            ))
          )}
        </div>
        
        <div className="p-4 border-t border-gray-100 bg-gray-50 min-w-[20rem] space-y-2">
          <button 
            onClick={() => { setAppMode(AppMode.STUDY_CARDS); fileInputRef.current?.click(); }}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            New Study Cards PDF
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="application/pdf" className="hidden" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative w-full">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-16 flex-shrink-0 flex items-center justify-between px-4 no-print z-10 gap-2">
          <div className="flex items-center gap-4 overflow-hidden">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="text-gray-500 hover:text-indigo-600 p-3 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
              aria-label="Toggle Sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="hidden md:flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
              <button 
                onClick={() => { setAppMode(AppMode.STUDY_CARDS); if(status !== AppStatus.PROCESSING_AI) setStatus(AppStatus.IDLE); }} 
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${appMode === AppMode.STUDY_CARDS ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                Study Cards
              </button>
              <button 
                onClick={() => { setAppMode(AppMode.TRANSLATION); if(status !== AppStatus.PROCESSING_AI) setStatus(AppStatus.IDLE); }} 
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${appMode === AppMode.TRANSLATION ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                General Translation
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              title="Toggle Dark Mode"
            >
              {isDarkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
            {status === AppStatus.SUCCESS && (
              <>
                 {appMode === AppMode.STUDY_CARDS && (
                   <button 
                    onClick={() => { setIsQuizMode(!isQuizMode); setUserAnswers({}); }}
                    className={`px-3 py-2 rounded-lg text-sm font-bold transition-all border ${isQuizMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="hidden sm:inline">Quiz Mode</span>
                    </span>
                  </button>
                 )}

                 <button 
                  onClick={() => setShowFurigana(!showFurigana)}
                  className={`px-3 py-2 rounded-lg text-sm font-bold transition-all border ${showFurigana ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  <span className="flex items-center gap-1">
                    <span className="text-xs">あ/ア</span>
                    <span className="hidden sm:inline">{showFurigana ? 'ON' : 'OFF'}</span>
                  </span>
                </button>

                <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block"></div>

                {appMode === AppMode.STUDY_CARDS && (
                  <button onClick={handleExportWord} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    <span className="hidden lg:inline">Word</span>
                  </button>
                )}
                <button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  <span className="hidden lg:inline">PDF</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div 
          id="printable-content" 
          className={`flex-1 overflow-y-auto bg-slate-50 dark:bg-gray-900 p-4 md:p-8 custom-scrollbar ${showFurigana ? '' : 'hide-furigana'}`}
        >
          <div className="max-w-4xl mx-auto">
            {/* Mobile Tab Selector */}
            <div className="md:hidden flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mb-4">
              <button 
                onClick={() => { setAppMode(AppMode.STUDY_CARDS); if(status !== AppStatus.PROCESSING_AI) setStatus(AppStatus.IDLE); }} 
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${appMode === AppMode.STUDY_CARDS ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                Cards
              </button>
              <button 
                onClick={() => { setAppMode(AppMode.TRANSLATION); if(status !== AppStatus.PROCESSING_AI) setStatus(AppStatus.IDLE); }} 
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${appMode === AppMode.TRANSLATION ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                Translate
              </button>
            </div>

            {status === AppStatus.IDLE && appMode === AppMode.STUDY_CARDS && (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-500 dark:text-gray-400">
                <div className="w-24 h-24 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mb-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <svg className="w-10 h-10 text-indigo-300 dark:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                </div>
                <h2 className="text-lg font-medium text-gray-700 dark:text-gray-300">Ready to Study</h2>
                <p className="max-w-xs mx-auto mt-2 text-sm">Upload a PDF from the sidebar or select a previous session to start.</p>
                <button onClick={() => fileInputRef.current?.click()} className="mt-6 md:hidden text-indigo-600 dark:text-indigo-400 font-bold text-sm">Upload PDF</button>
              </div>
            )}

            {appMode === AppMode.TRANSLATION && (
              <div className="mb-8">
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-8">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Translate Japanese Text</h2>
                  <textarea 
                    value={translationText}
                    onChange={(e) => setTranslationText(e.target.value)}
                    placeholder="Paste Japanese text here..."
                    className="w-full h-32 p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                  />
                  <div className="flex flex-wrap gap-3">
                    <button 
                      onClick={handleTranslationSubmit} 
                      disabled={!translationText.trim() || status === AppStatus.PROCESSING_AI} 
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      Translate Text
                    </button>
                    <div className="relative">
                      <input type="file" ref={translationFileInputRef} onChange={handleTranslationFileUpload} accept="application/pdf" className="hidden" />
                      <button 
                        onClick={() => translationFileInputRef.current?.click()} 
                        disabled={status === AppStatus.PROCESSING_AI} 
                        className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        Upload PDF
                      </button>
                    </div>
                  </div>
                </div>

                {status === AppStatus.SUCCESS && translationData.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex justify-end mb-4">
                      {vocabData.length === 0 ? (
                        <button 
                          onClick={handleExtractVocab}
                          disabled={isExtractingVocab}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {isExtractingVocab ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Extracting...</>
                          ) : (
                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> Extract Vocab</>
                          )}
                        </button>
                      ) : (
                        <button 
                          onClick={() => setActiveTab('vocab')}
                          className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          View Vocabulary ({vocabData.length})
                        </button>
                      )}
                    </div>
                    
                    {activeTab === 'vocab' && vocabData.length > 0 ? (
                      <div className="animate-in fade-in duration-300">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Key Vocabulary</h3>
                          <button onClick={() => setActiveTab('preview')} className="text-sm text-indigo-600 hover:text-indigo-800">Back to Translation</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {vocabData.map((vocab, idx) => (
                            <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
                              <div>
                                <div className="text-xl font-bold text-gray-900 dark:text-gray-100 font-jp mb-1">{vocab.word}</div>
                                <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">{vocab.reading}</div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">{vocab.meaning}</div>
                              </div>
                              <button onClick={(e) => playAudio(e, vocab.word)} className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      translationData.map((item, index) => (
                        <div key={index} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                          {editingTransIndex === index ? (
                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Japanese (with Furigana)</label>
                                <textarea value={editForm.japanese} onChange={(e) => setEditForm({...editForm, japanese: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md font-jp" rows={3} />
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Burmese</label>
                                <textarea value={editForm.burmese} onChange={(e) => setEditForm({...editForm, burmese: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md" rows={3} />
                              </div>
                              <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setEditingTransIndex(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">Cancel</button>
                                <button onClick={saveTransEdit} className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-md">Save Changes</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-4 mb-4">
                                <div className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100 leading-[2.5] font-jp" dangerouslySetInnerHTML={{ __html: item.japanese }} />
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button onClick={() => startEditingTrans(index, item)} className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition-colors" title="Edit">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </button>
                                  <button onClick={(e) => playAudio(e, item.japanese)} className="p-2 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition-colors" title="Listen">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                  </button>
                                </div>
                              </div>
                              <div className="text-base text-gray-600 dark:text-gray-300 font-medium leading-relaxed bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-100 dark:border-gray-600">
                                {item.burmese}
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {(status === AppStatus.LOADING_PDF || status === AppStatus.PROCESSING_AI) && (
              <div className="flex flex-col items-center justify-center h-[60vh]">
                <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
                <h3 className="text-lg font-bold text-gray-800">Processing...</h3>
                <p className="text-gray-500 text-sm mt-1">{progress}</p>
              </div>
            )}

            {status === AppStatus.ERROR && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-8 text-center max-w-md mx-auto mt-10">
                <div className="text-red-500 mb-4 flex justify-center"><svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>
                <h3 className="text-lg font-bold text-red-800 mb-2">Something went wrong</h3>
                <p className="text-red-600 text-sm mb-6">{error}</p>
                <button onClick={reset} className="bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg font-medium hover:bg-red-50 transition-colors">Try Again</button>
              </div>
            )}

            {status === AppStatus.SUCCESS && appMode === AppMode.STUDY_CARDS && (
              <div className="space-y-6 pb-20">
                <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 no-print">
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === 'preview' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'}`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setActiveTab('vocab')}
                    className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === 'vocab' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'}`}
                  >
                    Vocabulary
                  </button>
                  <button
                    onClick={() => setActiveTab('code')}
                    className={`py-3 px-6 font-medium text-sm border-b-2 transition-colors ${activeTab === 'code' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'}`}
                  >
                    Code
                  </button>
                </div>

                {activeTab === 'preview' && (
                  <div className="space-y-6">
                    {data.map((item) => (
                      <div key={item.id} className="study-card bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 md:p-8 break-inside-avoid">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
                          <div className="flex items-center gap-3">
                            <span className="bg-indigo-600 text-white text-xs font-bold px-2.5 py-1 rounded">Q {item.id}</span>
                            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Architect Exam</span>
                          </div>
                          <button onClick={() => startEditingCard(item)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            Edit
                          </button>
                        </div>

                        {editingCardId === item.id ? (
                          <div className="space-y-4 mb-8">
                            <div>
                              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Question (Japanese with Furigana)</label>
                              <textarea value={editForm.questionJP} onChange={(e) => setEditForm({...editForm, questionJP: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md font-jp" rows={3} />
                            </div>
                            <div>
                              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Question (Burmese)</label>
                              <textarea value={editForm.questionMY} onChange={(e) => setEditForm({...editForm, questionMY: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md" rows={2} />
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                              <button onClick={() => setEditingCardId(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">Cancel</button>
                              <button onClick={saveCardEdit} className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-md">Save Changes</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Question */}
                            <div className="mb-8">
                               <div className="flex items-start justify-between gap-4 mb-4">
                                 <div className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 leading-[2.5] font-jp" dangerouslySetInnerHTML={{ __html: item.questionJP }} />
                                 <button onClick={(e) => playAudio(e, item.questionJP)} className="p-2 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition-colors flex-shrink-0" title="Listen">
                                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                 </button>
                               </div>
                               <div className="text-base text-gray-600 dark:text-gray-300 font-medium leading-relaxed bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-100 dark:border-gray-600">
                                 {item.questionMY}
                               </div>
                            </div>
                          </>
                        )}

                        {/* Options */}
                        <div className="grid gap-3 mb-8">
                          {item.options.map((opt) => {
                            const isSelected = userAnswers[item.id] === opt.id;
                            const isCorrectOption = opt.id === item.correctOptionId;
                            const hasAnswered = userAnswers[item.id] !== undefined;
                            
                            let optionClass = 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer';
                            let badgeClass = 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
                            
                            if (!isQuizMode) {
                              if (isCorrectOption) {
                                optionClass = 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
                                badgeClass = 'bg-emerald-600 dark:bg-emerald-500 text-white';
                              } else {
                                optionClass = 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700';
                              }
                            } else {
                              if (hasAnswered) {
                                optionClass = 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 opacity-60 cursor-default';
                                if (isCorrectOption) {
                                  optionClass = 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 opacity-100';
                                  badgeClass = 'bg-emerald-600 dark:bg-emerald-500 text-white';
                                } else if (isSelected && !isCorrectOption) {
                                  optionClass = 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 opacity-100';
                                  badgeClass = 'bg-red-600 dark:bg-red-500 text-white';
                                }
                              }
                            }

                            return (
                              <div 
                                key={opt.id} 
                                onClick={() => {
                                  if (isQuizMode && !hasAnswered) {
                                    setUserAnswers(prev => ({ ...prev, [item.id]: opt.id }));
                                  }
                                }}
                                className={`p-4 rounded-lg border flex items-start gap-4 transition-all ${optionClass}`}
                              >
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1 ${badgeClass}`}>
                                  {opt.id}
                                </div>
                                <div className="flex-1">
                                  <div className="text-lg font-bold text-gray-800 dark:text-gray-200 leading-[2.2] font-jp" dangerouslySetInnerHTML={{ __html: opt.textJP }} />
                                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{opt.textMY}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Explanation */}
                        {(!isQuizMode || userAnswers[item.id] !== undefined) && (
                          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl p-5 relative overflow-hidden animate-in fade-in slide-in-from-top-2">
                            <div className="absolute top-0 left-0 w-1 h-full bg-amber-400 dark:bg-amber-500"></div>
                            <h4 className="text-amber-800 dark:text-amber-400 font-bold text-sm mb-2 flex items-center gap-2">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                              {item.explanation.titleMY}
                            </h4>
                            <p className="text-gray-700 dark:text-gray-300 text-sm mb-3 italic">"{item.explanation.reasonMY}"</p>
                            <div className="text-xs bg-white/60 dark:bg-gray-800/60 p-2 rounded text-amber-900 dark:text-amber-200 font-semibold border border-amber-100 dark:border-amber-800 inline-block">
                              💡 Tip: {item.explanation.memoryTipMY}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'code' && (
                  <div className="animate-in fade-in duration-300">
                    <div className="flex justify-between items-center bg-gray-900 text-white p-4 rounded-t-xl overflow-hidden">
                      <h3 className="font-semibold">Generated Code (TypeScript)</h3>
                      <button 
                        onClick={() => {
                          const code = `import { StudyCardData } from '../types';\n\nexport const chapterData: StudyCardData[] = ${JSON.stringify(data, null, 2)};`;
                          navigator.clipboard.writeText(code);
                          alert("Code copied to clipboard!");
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Copy Code
                      </button>
                    </div>
                    <div className="bg-gray-800 p-6 rounded-b-xl overflow-x-auto max-h-[600px]">
                      <pre className="text-indigo-300 text-sm leading-relaxed font-mono">
                        {`import { StudyCardData } from '../types';\n\nexport const chapterData: StudyCardData[] = `}
                        {JSON.stringify(data, null, 2)}
                        {`;`}
                      </pre>
                    </div>
                  </div>
                )}

                {activeTab === 'vocab' && (
                  <div className="animate-in fade-in duration-300">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Key Vocabulary</h3>
                      {vocabData.length === 0 && (
                        <button 
                          onClick={handleExtractVocab}
                          disabled={isExtractingVocab}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {isExtractingVocab ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Extracting...</>
                          ) : (
                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> Extract Vocab</>
                          )}
                        </button>
                      )}
                    </div>
                    
                    {vocabData.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {vocabData.map((vocab, idx) => (
                          <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
                            <div>
                              <div className="text-xl font-bold text-gray-900 dark:text-gray-100 font-jp mb-1">{vocab.word}</div>
                              <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">{vocab.reading}</div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">{vocab.meaning}</div>
                            </div>
                            <button onClick={(e) => playAudio(e, vocab.word)} className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full transition-colors">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      !isExtractingVocab && (
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-dashed">
                          <p>No vocabulary extracted yet. Click the button above to analyze the text.</p>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
