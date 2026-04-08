import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Key, Save, AlertCircle } from 'lucide-react';
import { keyManager } from '../services/gemini';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [keys, setKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState('');

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('probook_ai_keys');
      setKeys(saved ? JSON.parse(saved) : []);
    }
  }, [isOpen]);

  const addKey = () => {
    if (newKey.trim() && !keys.includes(newKey.trim())) {
      const updatedKeys = [...keys, newKey.trim()];
      setKeys(updatedKeys);
      setNewKey('');
    }
  };

  const removeKey = (index: number) => {
    const updatedKeys = keys.filter((_, i) => i !== index);
    setKeys(updatedKeys);
  };

  const handleSave = () => {
    localStorage.setItem('probook_ai_keys', JSON.stringify(keys));
    keyManager.reloadKeys();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-brand-100 flex items-center justify-between bg-brand-50/50">
          <div className="flex items-center gap-3">
            <div className="bg-brand-800 p-2 rounded-lg text-white">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-brand-900 text-lg">AI Key Settings</h2>
              <p className="text-xs text-brand-600">Add multiple keys for rotation</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-brand-400 hover:text-brand-600 hover:bg-brand-100 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Tip:</strong> Har key ki apni limit hoti hai. 10+ keys add karne se aap bina ruke badi ebooks bana sakte hain. Ye keys aapke browser me hi safe rahengi.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-brand-700 uppercase tracking-wider">Add New Key</label>
            <div className="flex gap-2">
              <input 
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Paste Gemini API Key..."
                className="flex-1 p-3 bg-brand-50 border border-brand-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
              <button 
                onClick={addKey}
                className="p-3 bg-brand-800 text-white rounded-xl hover:bg-brand-900 transition-all font-bold"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-brand-700 uppercase tracking-wider">Active Keys ({keys.length})</label>
              <span className="text-[10px] text-brand-500 font-medium">Auto-rotated on errors</span>
            </div>
            
            <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {keys.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-brand-100 rounded-xl">
                  <p className="text-sm text-brand-400">Abhi koi keys add nahi ki gayi hain.</p>
                </div>
              ) : (
                keys.map((key, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white border border-brand-100 rounded-xl shadow-sm group hover:border-brand-300 transition-all">
                    <div className="flex items-center gap-3 overflow-hidden">
                       <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></div>
                       <code className="text-xs text-brand-700 font-mono truncate max-w-[200px]">
                         {key.substring(0, 8)}••••••••{key.substring(key.length - 4)}
                       </code>
                    </div>
                    <button 
                      onClick={() => removeKey(idx)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-brand-50/50 border-t border-brand-100 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-brand-600 hover:bg-brand-100 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-3 bg-brand-800 text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-200 hover:bg-brand-900 transition-all flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};
