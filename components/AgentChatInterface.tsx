import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Cpu, MessageSquare } from 'lucide-react';
import { Agent } from '../types';
import { geminiService } from '../services/geminiService';

interface AgentChatInterfaceProps {
  agent: Agent;
  onClose: () => void;
}

export const AgentChatInterface: React.FC<AgentChatInterfaceProps> = ({ agent, onClose }) => {
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial greeting
  useEffect(() => {
    setMessages([{ 
        role: 'model', 
        text: `Connection established with ${agent.role.replace('_', ' ')} (ID: ${agent.id}). How may I assist?` 
    }]);
  }, [agent]);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = input;
    setInput("");
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    // Format history for API
    const historyForApi = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));

    const response = await geminiService.chatWithAgent(agent.role, historyForApi, userMsg);
    
    setMessages(prev => [...prev, { role: 'model', text: response }]);
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
  }

  return (
    <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
       <div className="w-full max-w-lg bg-slate-900/90 border border-cyan-500/30 rounded-2xl shadow-[0_0_50px_rgba(34,211,238,0.15)] overflow-hidden flex flex-col h-[600px] animate-in zoom-in-95 duration-300">
           
           {/* Header */}
           <div className="p-4 bg-slate-950/50 border-b border-cyan-500/20 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                     <Cpu size={18} className="text-cyan-400" />
                  </div>
                  <div>
                     <h3 className="text-sm font-bold text-white uppercase tracking-widest">{agent.role.replace('_', ' ')}</h3>
                     <span className="text-[10px] font-mono text-cyan-500/60 uppercase">Link ID: {agent.id}</span>
                  </div>
               </div>
               <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                  <X size={18} />
               </button>
           </div>

           {/* Chat Area */}
           <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth" ref={scrollRef}>
               {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] p-3 rounded-2xl text-xs font-mono leading-relaxed ${
                          msg.role === 'user' 
                          ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-100 rounded-tr-sm' 
                          : 'bg-slate-800/80 border border-white/10 text-slate-300 rounded-tl-sm'
                      }`}>
                          {msg.text}
                      </div>
                  </div>
               ))}
               {isTyping && (
                   <div className="flex justify-start">
                       <div className="bg-slate-800/80 border border-white/10 text-cyan-400 p-3 rounded-2xl rounded-tl-sm flex gap-1">
                           <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" />
                           <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-100" />
                           <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-200" />
                       </div>
                   </div>
               )}
           </div>

           {/* Input Area */}
           <div className="p-4 bg-slate-950/80 border-t border-white/10">
               <div className="relative flex items-center gap-2">
                   <div className="absolute left-3 text-cyan-500/50">
                       <MessageSquare size={16} />
                   </div>
                   <input 
                      type="text" 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Transmit message..."
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-12 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 focus:bg-slate-900 transition-all"
                   />
                   <button 
                      onClick={handleSend}
                      disabled={!input.trim() || isTyping}
                      className="absolute right-2 p-1.5 bg-cyan-500 text-black rounded-lg hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                   >
                       <Send size={14} />
                   </button>
               </div>
           </div>
           
           {/* Decorative Footer */}
           <div className="h-1 w-full bg-gradient-to-r from-cyan-500/0 via-cyan-500/50 to-cyan-500/0 opacity-50" />
       </div>
    </div>
  );
};
