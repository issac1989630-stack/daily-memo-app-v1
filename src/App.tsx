import React, { useState, useEffect } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Plus, Check, ShieldCheck, Lock, ChevronLeft, ChevronRight, X, Trash2, RotateCcw, ListChecks } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from './lib/supabase';

// =============== UTILS ===============
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// =============== TYPES ===============
interface Task {
  id: string;
  text: string;
  date: string; // YYYY-MM-DD
  is_completed: boolean;
  is_verified: boolean;
}

// =============== MODAL COMPONENT ===============
function PasswordModal({ 
  isOpen, 
  actionType,
  onClose, 
  onSuccess 
}: { 
  isOpen: boolean; 
  actionType: 'VERIFY' | 'UNVERIFY';
  onClose: () => void; 
  onSuccess: () => void; 
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 預設密碼：2026
    if (password === '2026') {
      onSuccess();
      onClose();
    } else {
      setError(true);
      setPassword('');
    }
  };

  const isUnverify = actionType === 'UNVERIFY';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-950/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-md bg-emerald-900 rounded-[48px] p-8 text-white flex flex-col items-center justify-center text-center relative shadow-2xl overflow-hidden"
      >
        <div className="absolute top-8 left-8">
          <div className="w-12 h-1 px-1 bg-emerald-400/30 rounded-full mb-1"></div>
          <div className="w-8 h-1 px-1 bg-emerald-400/30 rounded-full"></div>
        </div>
        
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors">
          <X className="w-6 h-6" />
        </button>
        
        <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-6 mt-4 backdrop-blur-md">
          {isUnverify ? <RotateCcw className="w-12 h-12 text-emerald-400" /> : <Lock className="w-12 h-12 text-emerald-400" />}
        </div>
        
        <h2 className="text-2xl font-black mb-2 leading-tight">
          {isUnverify ? '取消家長核可' : '家長核可模式'}
        </h2>
        <p className="text-emerald-300 text-sm font-medium mb-8">
          {isUnverify ? '請輸入密碼以取消任務核可狀態' : '請輸入密碼以驗證並鎖定任務'}
        </p>
        
        <form onSubmit={handleSubmit} className="w-full">
          <div className="mb-8">
            <input
              type="password"
              pattern="[0-9]*"
              inputMode="numeric"
              maxLength={4}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              placeholder="••••"
              className={cn(
                "w-full text-center text-4xl tracking-[0.5em] sm:tracking-[1em] p-4 rounded-3xl border-2 outline-none transition-colors font-bold",
                error 
                  ? "bg-red-500/20 border-red-500/50 text-red-100 placeholder:text-red-300/30" 
                  : "bg-white/10 border-white/20 text-white focus:border-emerald-400 focus:bg-white/20 placeholder:text-white/20"
              )}
              autoFocus
            />
            {error && <p className="text-red-300 text-sm mt-3 font-bold">密碼錯誤，請重試 (預設: 2026)</p>}
          </div>

          <button
            type="submit"
            disabled={password.length === 0}
            className={cn(
              "w-full py-4 rounded-full font-black text-lg uppercase tracking-widest disabled:opacity-50 transition-colors shadow-lg active:scale-95",
              isUnverify 
                ? "bg-red-500 text-white hover:bg-red-400 shadow-red-500/20" 
                : "bg-emerald-400 text-emerald-950 hover:bg-emerald-300 shadow-emerald-400/20"
            )}
          >
            {isUnverify ? '確認取消' : '確認核可'}
          </button>
        </form>

        <div className="mt-10 pt-10 border-t border-white/10 w-full">
          <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-black">Security Mode Active</p>
        </div>
      </motion.div>
    </div>
  );
}

// =============== MAIN APP ===============
export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const [newTaskText, setNewTaskText] = useState('');
  
  // Modal & Batch state
  const [modalAction, setModalAction] = useState<{ type: 'VERIFY' | 'UNVERIFY', ids: string[] } | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  
  // Edit state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskText, setEditTaskText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fetch from Supabase
  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching tasks from Supabase:', error);
      setStatusMessage(`讀取資料失敗：${error.message}`);
    } else if (data) {
      setTasks(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();

    // Subscribe to realtime changes
    const subscription = supabase
      .channel('public:tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        // Simple automatic refetch on any change to keep devices synced
        fetchTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const formattedDateKey = format(selectedDate, 'yyyy-MM-dd');
  const isToday = format(new Date(), 'yyyy-MM-dd') === formattedDateKey;

  // Filter tasks for the selected date
  const currentTasks = tasks.filter(t => t.date === formattedDateKey);

  const nextDay = () => setSelectedDate(prev => addDays(prev, 1));
  const prevDay = () => setSelectedDate(prev => subDays(prev, 1));
  const goToToday = () => setSelectedDate(new Date());

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;

    const newTaskTextClean = newTaskText.trim();
    setNewTaskText('');

    const { data, error } = await supabase.from('tasks').insert([{
      text: newTaskTextClean,
      date: formattedDateKey,
      is_completed: false,
      is_verified: false
    }]).select();

    if (error) {
      console.error('Error creating task:', error);
      setStatusMessage(`新增任務失敗：${error.message}`);
      setNewTaskText(newTaskTextClean); // Restore text
    } else if (data) {
      setTasks(prev => {
        // Prevent duplicate updates if realtime channel already added it
        if (prev.some(t => t.id === data[0].id)) return prev;
        return [...prev, data[0]];
      });
      setStatusMessage(null);
    }
  };

  const toggleComplete = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Optimistic UI update
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return { ...t, is_completed: !t.is_completed };
      }
      return t;
    }));

    const { error } = await supabase
      .from('tasks')
      .update({ is_completed: !task.is_completed })
      .eq('id', taskId);
      
    if (error) {
      console.error('Error updating task:', error);
      fetchTasks(); // rollback on error
    }
  };

  const handleVerifyClick = (taskId: string) => {
    setModalAction({ type: 'VERIFY', ids: [taskId] });
  };

  const handleCancelVerifyClick = (taskId: string) => {
    setModalAction({ type: 'UNVERIFY', ids: [taskId] });
  };

  const handleBatchVerifyClick = () => {
    if (batchSelectedIds.length > 0) {
      setModalAction({ type: 'VERIFY', ids: batchSelectedIds });
    }
  };

  const confirmModalAction = async () => {
    if (!modalAction) return;
    const isVerify = modalAction.type === 'VERIFY';
    const ids = modalAction.ids;

    // Optimistic UI
    setTasks(prev => prev.map(t => {
      if (ids.includes(t.id)) {
        return { ...t, is_verified: isVerify };
      }
      return t;
    }));

    setModalAction(null);
    setIsBatchMode(false);
    setBatchSelectedIds([]);

    const { error } = await supabase
      .from('tasks')
      .update({ is_verified: isVerify })
      .in('id', ids);

    if (error) {
      console.error('Error batch updating verification status:', error);
      fetchTasks(); // rollback
    }
  };

  const deleteTask = async (taskId: string) => {
    // Optimistic update
    setTasks(prev => prev.filter(t => t.id !== taskId));
    
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);
      
    if (error) {
      console.error('Error deleting task:', error);
      fetchTasks();
    }
  };

  const startEditing = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTaskText(task.text);
  };

  const saveEdit = async (taskId: string) => {
    const newText = editTaskText.trim();
    // Optimistic UI
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, text: newText } : t));
    setEditingTaskId(null);

    const { error } = await supabase
      .from('tasks')
      .update({ text: newText })
      .eq('id', taskId);

    if (error) {
      console.error('Error updating task text:', error);
      fetchTasks();
    }
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
    setEditTaskText('');
  };

  return (
    <div className="min-h-[100dvh] bg-[#F0FDF4] text-slate-800 font-sans sm:p-8 flex justify-center overflow-x-hidden relative">
      <div className="w-full max-w-5xl flex flex-col gap-6 sm:gap-8 h-full min-h-[90vh] z-10 relative">

        {/* Decorative Background Text */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-5 sm:opacity-[0.03] z-0 hidden lg:block">
          <p className="text-[200px] font-black text-emerald-900 origin-center whitespace-nowrap rotate-12">PLANNER</p>
        </div>

        {/* Header Section */}
        <header className="flex flex-col sm:flex-row justify-between sm:items-end gap-6 relative z-10 px-4 sm:px-0 pt-6 sm:pt-0">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-emerald-900 mb-1">張薪濠每日備忘錄</h1>
            <p className="text-emerald-600 font-medium tracking-wide uppercase text-[10px] sm:text-sm">Hao-Xin Chang's Daily Memo</p>
          </div>
          <div className="bg-white rounded-[32px] px-6 py-3 shadow-sm border border-emerald-100 flex items-center justify-between sm:justify-start gap-4">
            <button onClick={prevDay} className="p-2 -ml-2 hover:bg-emerald-50 rounded-full transition-colors text-emerald-600 hover:text-emerald-800">
              <ChevronLeft className="w-6 h-6 stroke-[3]" />
            </button>
            
            <div className="flex items-center gap-4">
              <span className="text-3xl font-bold text-emerald-600 tracking-tight">{format(selectedDate, 'MM/dd')}</span>
              <div className="h-8 w-px bg-emerald-100 hidden sm:block"></div>
              <div className="text-right flex flex-col justify-center">
                <p className="text-xs font-bold text-slate-400 leading-none mb-1">{format(selectedDate, 'EEEE', { locale: zhTW })}</p>
                <div className="flex justify-end items-center gap-2">
                  {!isToday && (
                    <button onClick={goToToday} className="text-[10px] bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 px-2 py-0.5 rounded-full font-bold transition-colors">
                      回今日
                    </button>
                  )}
                  <p className="text-[11px] sm:text-sm font-semibold text-slate-600 uppercase">
                    {format(selectedDate, 'MMM yyyy')}
                  </p>
                </div>
              </div>
            </div>

            <button onClick={nextDay} className="p-2 -mr-2 hover:bg-emerald-50 rounded-full transition-colors text-emerald-600 hover:text-emerald-800">
              <ChevronRight className="w-6 h-6 stroke-[3]" />
            </button>
          </div>
        </header>

        {/* Task List Section */}
        <div className="flex-1 overflow-y-auto pb-40 lg:pr-4 relative z-10 px-4 sm:px-0">
          
          {currentTasks.length > 0 && (
            <div className="flex justify-between items-center mb-4 px-2">
               <h2 className="text-slate-500 font-bold text-sm tracking-widest uppercase flex items-center gap-2">
                事項 <span className="bg-white px-2 py-0.5 rounded-full shadow-sm text-emerald-700">{currentTasks.length}</span>
               </h2>
               {!isBatchMode ? (
                 <button 
                   onClick={() => { setIsBatchMode(true); setBatchSelectedIds([]); }}
                   className="text-xs font-bold text-emerald-600 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
                 >
                   <ListChecks className="w-4 h-4" /> 批次核可
                 </button>
               ) : (
                 <button 
                   onClick={() => { setIsBatchMode(false); setBatchSelectedIds([]); }}
                   className="text-xs font-bold text-slate-500 bg-slate-200 hover:bg-slate-300 px-3 py-1.5 rounded-full transition-colors"
                 >
                   取消批次
                 </button>
               )}
            </div>
          )}

          {currentTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 mt-10 rounded-[40px] border-4 border-dashed border-emerald-200/50 bg-emerald-50/50">
              <div className="w-24 h-24 rounded-full bg-emerald-100/50 flex items-center justify-center mb-4">
                <ShieldCheck className="w-10 h-10 text-emerald-300" />
              </div>
              <p className="font-black text-xl text-emerald-800">今日挑戰清單為空</p>
              <p className="text-sm font-bold text-emerald-600/70 uppercase tracking-widest mt-2">Add a new challenge below</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {currentTasks.map(task => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                    layout
                    onClick={() => {
                      if (isBatchMode && !task.is_verified) {
                        setBatchSelectedIds(prev => 
                          prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
                        );
                      }
                    }}
                    className={cn(
                      "bg-white rounded-[32px] p-5 sm:p-6 flex items-center shadow-sm border-l-8 transition-all duration-300",
                      task.is_verified ? "border-emerald-400" : task.is_completed ? "border-sky-400" : "border-orange-400",
                      isBatchMode && !task.is_verified && "cursor-pointer hover:bg-emerald-50/50",
                      isBatchMode && batchSelectedIds.includes(task.id) && "ring-2 ring-emerald-400 bg-emerald-50"
                    )}
                  >
                    {/* Left: Student interaction toggle */}
                    {isBatchMode && !task.is_verified ? (
                      <div className={cn("w-10 h-10 rounded-xl border-2 flex items-center justify-center mr-4 flex-shrink-0 transition-colors duration-300", 
                        batchSelectedIds.includes(task.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"
                      )}>
                        {batchSelectedIds.includes(task.id) && <Check className="w-6 h-6" strokeWidth={3} />}
                      </div>
                    ) : (
                      <div
                        onClick={(e) => {
                          if (!isBatchMode) {
                            e.stopPropagation();
                            toggleComplete(task.id);
                          }
                        }}
                        className={cn(
                          "w-10 h-10 rounded-full border-2 flex items-center justify-center mr-4 flex-shrink-0 transition-colors duration-300",
                          task.is_completed
                            ? "border-emerald-400 bg-emerald-50 cursor-default"
                            : "border-slate-200 hover:border-sky-400 cursor-pointer"
                        )}
                      >
                        {task.is_completed && <Check className="w-5 h-5 text-emerald-500" strokeWidth={3} />}
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0 mr-4">
                      {editingTaskId === task.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editTaskText}
                            onChange={(e) => setEditTaskText(e.target.value)}
                            className="flex-1 bg-white border-2 border-emerald-300 rounded-lg p-2 text-slate-800 text-lg font-bold outline-none"
                          />
                          <button onClick={() => saveEdit(task.id)} className="text-emerald-600 font-bold text-xs p-2 hover:bg-emerald-100 rounded-lg">保存</button>
                          <button onClick={cancelEdit} className="text-slate-400 font-bold text-xs p-2 hover:bg-slate-100 rounded-lg">取消</button>
                        </div>
                      ) : (
                        <>
                          <h3 onClick={() => startEditing(task)} className={cn(
                            "text-lg font-bold truncate transition-all duration-300 cursor-pointer hover:text-emerald-700",
                            task.is_completed ? "text-slate-400 line-through decoration-emerald-200 decoration-2" : "text-slate-800"
                          )}>
                            {task.text}
                          </h3>
                          <p className={cn(
                            "text-[10px] sm:text-xs font-bold uppercase tracking-widest mt-1",
                            task.is_verified ? "text-emerald-500" : task.is_completed ? "text-sky-500" : "text-slate-400"
                          )}>
                            {task.is_verified && task.is_completed ? "已核可 • 已完成" : 
                            task.is_verified ? "已核可 • 未完成" : 
                            task.is_completed ? "已完成 • 待核可" : "未完成"} 
                          </p>
                        </>
                      )}
                    </div>

                    {/* Right: Actions */}
                    {!isBatchMode && (
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 z-10">
                        {task.is_verified ? (
                          <div className="flex items-center gap-1">
                            <div className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-full font-bold text-[10px] sm:text-xs bg-emerald-100 text-emerald-700 whitespace-nowrap">
                              <ShieldCheck className="w-3 h-3 sm:w-4 sm:h-4" />
                              已核可
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCancelVerifyClick(task.id); }}
                              className="p-1.5 sm:p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-full transition-colors"
                              title="取消核可"
                            >
                              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleVerifyClick(task.id); }}
                            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full font-bold text-[10px] sm:text-xs transition-all cursor-pointer whitespace-nowrap border-2 border-dashed border-slate-200 text-slate-400 hover:border-emerald-400 hover:text-emerald-600 active:scale-95 bg-transparent"
                          >
                            家長/老師簽名
                          </button>
                        )}
  
                        {/* Delete button: Available for all non-verified tasks */}
                        {!task.is_verified && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                            className="p-1.5 sm:p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            title="刪除任務"
                          >
                            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Input Form / Batch Action Section */}
        {statusMessage && (
          <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-4 text-center z-50 font-bold">
            {statusMessage}
            <button onClick={() => setStatusMessage(null)} className="ml-4 underline">關閉</button>
          </div>
        )}
        {!isBatchMode ? (
          <div className="absolute sm:fixed bottom-6 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-4xl z-20">
            <form onSubmit={handleAddTask} className="flex gap-3 sm:gap-4 bg-white p-3 sm:p-4 rounded-[40px] shadow-2xl shadow-emerald-900/10 border border-emerald-100 items-center">
              <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-md shadow-emerald-200 flex-shrink-0 pointer-events-none">
                <Plus className="w-6 h-6 stroke-[3]" />
              </div>
              <input
                type="text"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                placeholder="新增你的下一個挑戰..."
                className="flex-1 bg-transparent border-none outline-none text-base sm:text-lg font-medium text-slate-600 italic px-2 placeholder:text-slate-300 focus:not-italic"
              />
              <button
                type="submit"
                disabled={!newTaskText.trim()}
                className="bg-emerald-50 hover:bg-emerald-500 hover:text-white transition-all text-emerald-600 px-5 sm:px-8 py-3 rounded-full font-black text-xs sm:text-sm uppercase tracking-widest disabled:opacity-50 disabled:hover:bg-emerald-50 disabled:hover:text-emerald-600 active:scale-95 whitespace-nowrap"
              >
                儲存事項
              </button>
            </form>
          </div>
        ) : (
          <motion.div 
             initial={{ y: 100, opacity: 0 }} 
             animate={{ y: 0, opacity: 1 }}
             className="absolute sm:fixed bottom-6 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-4xl z-30 bg-emerald-900 rounded-[40px] p-4 flex justify-between items-center shadow-2xl"
           >
              <span className="text-emerald-100 font-bold ml-4">已選擇 <span className="text-white text-xl mx-1">{batchSelectedIds.length}</span> 項任務</span>
              <button 
                disabled={batchSelectedIds.length === 0}
                onClick={handleBatchVerifyClick}
                className="bg-emerald-400 text-emerald-950 px-6 sm:px-8 py-3 rounded-full font-black disabled:opacity-50 transition-colors active:scale-95 shadow-lg flex items-center gap-2"
              >
                <ShieldCheck className="w-5 h-5" /> 一鍵核可
              </button>
           </motion.div>
        )}
      </div>

      {/* Verification Modal */}
      <AnimatePresence>
        {modalAction && (
          <PasswordModal
            isOpen={modalAction !== null}
            actionType={modalAction.type}
            onClose={() => setModalAction(null)}
            onSuccess={confirmModalAction}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
