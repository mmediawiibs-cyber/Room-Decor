import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { 
  MousePointer2, PenTool, StickyNote, Plus, RotateCw, Copy, Trash2, 
  SplitSquareHorizontal, SplitSquareVertical, Undo, Redo, Download, 
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, Highlighter, 
  Settings2, BoxSelect
} from 'lucide-react';

declare const __firebase_config: string | undefined;
declare const __app_id: string | undefined;
declare const __initial_auth_token: string | undefined;

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : { 
      // FALLBACK UNTUK LOCAL DEV DI VSCODE - Ganti dengan config Anda!
      apiKey: "AIzaSyDCS7BUdvaE7BtKJBmD8zZKnMGehfhKUtA",
  authDomain: "room-decor-f20d4.firebaseapp.com",
  projectId: "room-decor-f20d4",
  storageBucket: "room-decor-f20d4.firebasestorage.app",
  messagingSenderId: "472236933583",
  appId: "1:472236933583:web:cea60394372c8113dad2ba",
  measurementId: "G-S2YF7PXJX5"

    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id.replace(/[\/\.]/g, '_') : 'room-decorator-app';

// =========================================================================
// 2. TYPES & INTERFACES
interface Room {
  id: string; x: number; y: number; w: number; h: number;
  floorPattern: string; floorColor: string; tileSize: number;
}

interface Entity {
  id: string; type: EntityType; x: number; y: number; w: number; h: number;
  rotation?: number; color?: string; subType?: string;
  potShape?: string; wallSide?: 'top' | 'bottom' | 'left' | 'right';
  count?: number; swingDir?: 'in' | 'out';
  startX?: number; startY?: number; endX?: number; endY?: number;
  text?: string; visible?: boolean;
  fontFamily?: string; fontSize?: number; align?: 'left' | 'center' | 'right';
  bold?: boolean; italic?: boolean; underline?: boolean; highlight?: boolean;
  bgColor?: string; textColor?: string;
}

interface DragData {
  id: string; isRoom: boolean; offsetX: number; offsetY: number;
  draggingEnd?: boolean; boundEnts?: {id: string, dx: number, dy: number, dxEnd: number, dyEnd: number}[];
}

const COLORS = [
  '#94a3b8', '#475569', '#1e293b', '#fef08a', '#eab308', '#ca8a04', 
  '#fed7aa', '#f97316', '#c2410c', '#fbcfe8', '#ec4899', '#be185d', 
  '#bfdbfe', '#3b82f6', '#1d4ed8', '#a7f3d0', '#10b981', '#047857', 
  '#a5f3fc', '#06b6d4', '#0e7490', '#fca5a5', '#ef4444', '#b91c1c', 
  '#d97706', '#b45309', '#78350f'
];

const uuid = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [user, setUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [mode, setMode] = useState<'select' | 'opening' | 'leader' | 'note'>('select');
  
  const [rooms, setRooms] = useState<Room[]>([{ id: 'room-1', x: 1000, y: 700, w: 800, h: 600, floorPattern: 'putih', floorColor: '#ffffff', tileSize: 40 }]);
  const [entities, setEntities] = useState<Entity[]>([]);
  
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const dragDataRef = useRef<DragData | null>(null);
  const leaderDrawDataRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  
  const historyRef = useRef<{ rooms: Room[], entities: Entity[] }[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const [currentMaterial, setCurrentMaterial] = useState(COLORS[0]);
  const [objForm, setObjForm] = useState({ type: 'Kursi Kerja', w: 60, h: 60, potShape: 'Bulat' });
  const [openingForm, setOpeningForm] = useState({ type: 'Pintu', count: 1, dir: 'in', w: 80 });
  const [colSize, setColSize] = useState(30);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.warn("Auth warning:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const path = typeof __app_id !== 'undefined' 
      ? `artifacts/${appId}/public/data/workspaces/team_layout_utama` 
      : 'workspaces/team_layout_utama';
    const docRef = doc(db, path);
    
    const unsub = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (!dragDataRef.current && !leaderDrawDataRef.current) {
          setRooms(data.rooms || []);
          setEntities(data.entities || []);
        }
      }
    }, (err) => console.warn("Sync Error (If permissions fail, ensure rules are set in Firebase):", err));
    
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    document.head.appendChild(script);
  }, []);

  const saveState = useCallback((newRooms: Room[], newEnts: Entity[]) => {
    let hist = historyRef.current;
    let idx = historyIndexRef.current;
    if (idx < hist.length - 1) { hist = hist.slice(0, idx + 1); }
    hist.push({ rooms: JSON.parse(JSON.stringify(newRooms)), entities: JSON.parse(JSON.stringify(newEnts)) });
    historyRef.current = hist;
    historyIndexRef.current = hist.length - 1;

    setRooms(newRooms); setEntities(newEnts);

    if (user && !isSyncing) {
      setIsSyncing(true);
      const path = typeof __app_id !== 'undefined' 
        ? `artifacts/${appId}/public/data/workspaces/team_layout_utama` 
        : 'workspaces/team_layout_utama';
      const docRef = doc(db, path);
      
      setDoc(docRef, { rooms: newRooms, entities: newEnts })
        .catch(e => console.warn("Cannot save to Firebase:", e))
        .finally(() => setIsSyncing(false));
    }
  }, [user, isSyncing]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    for(let i=0; i<canvas.width; i+=100) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,canvas.height); ctx.stroke(); }
    for(let i=0; i<canvas.height; i+=100) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(canvas.width,i); ctx.stroke(); }

    const wallThickness = 15;

    rooms.forEach(r => {
      ctx.save();
      ctx.fillStyle = r.floorColor || '#ffffff';
      ctx.fillRect(r.x, r.y, r.w, r.h);

      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      if (r.floorPattern === 'ubin' && r.tileSize > 5) {
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1;
        for(let ix = r.x; ix <= r.x + r.w; ix += r.tileSize) { ctx.beginPath(); ctx.moveTo(ix, r.y); ctx.lineTo(ix, r.y + r.h); ctx.stroke(); }
        for(let iy = r.y; iy <= r.y + r.h; iy += r.tileSize) { ctx.beginPath(); ctx.moveTo(r.x, iy); ctx.lineTo(r.x + r.w, iy); ctx.stroke(); }
      } else if (r.floorPattern === 'semen') {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        for(let i=0; i<30; i++) { ctx.beginPath(); ctx.arc(r.x + Math.random()*r.w, r.y + Math.random()*r.h, 20 + Math.random()*50, 0, Math.PI*2); ctx.fill(); }
      } else if (r.floorPattern === 'pasir') {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for(let i=0; i<(r.w*r.h)/300; i++) { ctx.fillRect(r.x + Math.random()*r.w, r.y + Math.random()*r.h, 2, 2); }
      }
      ctx.restore();

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(r.x - wallThickness/2, r.y - wallThickness/2, r.w + wallThickness, wallThickness);
      ctx.fillRect(r.x - wallThickness/2, r.y + r.h - wallThickness/2, r.w + wallThickness, wallThickness);
      ctx.fillRect(r.x - wallThickness/2, r.y - wallThickness/2, wallThickness, r.h + wallThickness);
      ctx.fillRect(r.x + r.w - wallThickness/2, r.y - wallThickness/2, wallThickness, r.h + wallThickness);

      if (selectedRoomId === r.id) {
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3; ctx.strokeRect(r.x - wallThickness/2 - 2, r.y - wallThickness/2 - 2, r.w + wallThickness + 4, r.h + wallThickness + 4);
        ctx.fillStyle = '#3b82f6'; ctx.font = '12px Inter'; ctx.textAlign = 'left'; ctx.fillText(`${r.w} x ${r.h} px`, r.x, r.y - 15);
      }
      ctx.restore();
    });

    const openings = entities.filter(e => e.type === 'opening');
    const columns = entities.filter(e => e.type === 'column');
    const furnitures = entities.filter(e => e.type === 'furniture');
    const leaders = entities.filter(e => e.type === 'leader');
    const notes = entities.filter(e => e.type === 'note');
    const carpets = furnitures.filter(e => e.subType === 'Karpet');
    const others = furnitures.filter(e => e.subType !== 'Karpet');
    
    carpets.forEach(c => drawFurniture(ctx, c));
    openings.forEach(op => drawOpening(ctx, op, wallThickness));
    others.forEach(furn => drawFurniture(ctx, furn));
    columns.forEach(col => drawColumn(ctx, col));
    leaders.forEach(l => drawLeader(ctx, l));
    notes.forEach(n => drawNote(ctx, n));

    if (leaderDrawDataRef.current) drawLeader(ctx, leaderDrawDataRef.current, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, entities, selectedEntityId, selectedRoomId]);

  useEffect(() => { draw(); }, [draw]);

  const drawOpening = (ctx: CanvasRenderingContext2D, op: Entity, t: number) => {
    ctx.save(); ctx.translate(op.x, op.y);
    let rot = 0;
    if(op.wallSide === 'top') rot = 0; else if(op.wallSide === 'right') rot = 90; else if(op.wallSide === 'bottom') rot = 180; else if(op.wallSide === 'left') rot = 270;
    ctx.rotate(rot * Math.PI / 180);
    
    ctx.clearRect(-op.w/2, -t/2, op.w, t);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-op.w/2, -t/2, op.w, t);
    
    const isSel = selectedEntityId === op.id;
    ctx.strokeStyle = isSel ? '#3b82f6' : '#94a3b8'; ctx.lineWidth = isSel ? 3 : 2;
    
    if (op.subType === 'Jendela') {
      ctx.strokeRect(-op.w/2, -t/4, op.w, t/2);
      if (op.count && op.count > 1) { 
        const step = op.w / op.count; 
        for(let i=1; i<op.count; i++) { ctx.beginPath(); ctx.moveTo(-op.w/2 + step*i, -t/4); ctx.lineTo(-op.w/2 + step*i, t/4); ctx.stroke(); } 
      }
    } else {
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(-op.w/2, -t/2, op.w, t);
      const count = op.count || 1;
      const leafW = op.w / count;
      const dirY = (op.swingDir === 'out') ? -1 : 1;
      
      for(let i=0; i<count; i++) {
        const isRightHinge = count === 2 ? (i === 1) : (i % 2 !== 0);
        const hingeX = -op.w/2 + (i * leafW) + (isRightHinge ? leafW : 0);
        
        ctx.beginPath();
        ctx.moveTo(hingeX, t/2 * dirY);
        ctx.lineTo(hingeX, (t/2 + leafW) * dirY);
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 3; ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(hingeX, t/2 * dirY, leafW, isRightHinge ? Math.PI/2 : 0, isRightHinge ? Math.PI : Math.PI/2, dirY < 0 ? !isRightHinge : isRightHinge);
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if(isSel) { ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'; ctx.lineWidth = 1; ctx.strokeRect(-op.w/2 - 2, -op.h/2 - 2, op.w + 4, op.h + 4); }
    ctx.restore();
  };

  const drawColumn = (ctx: CanvasRenderingContext2D, col: Entity) => {
    ctx.save(); ctx.translate(col.x, col.y);
    ctx.fillStyle = '#1e293b'; ctx.fillRect(-col.w/2, -col.h/2, col.w, col.h);
    if(selectedEntityId === col.id) { ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.strokeRect(-col.w/2 - 2, -col.h/2 - 2, col.w + 4, col.h + 4); }
    ctx.restore();
  };

  const drawFurniture = (ctx: CanvasRenderingContext2D, ent: Entity) => {
    ctx.save(); ctx.translate(ent.x, ent.y); ctx.rotate((ent.rotation || 0) * Math.PI / 180);
    const c = ent.color || '#94a3b8';
    
    ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
    if(ent.subType === 'Karpet') { ctx.shadowBlur = 2; ctx.shadowOffsetY = 1; }
    
    ctx.fillStyle = c; ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.5;

    if (ent.subType === 'Meja' || ent.subType === 'Meja Tamu' || ent.subType === 'Custom') {
      ctx.beginPath(); ctx.rect(-ent.w/2, -ent.h/2, ent.w, ent.h); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-ent.w/2 + 2, -ent.h/2 + 2); ctx.lineTo(ent.w/2 - 2, -ent.h/2 + 2); ctx.stroke();
    } else if (ent.subType === 'Kulkas') {
      ctx.beginPath(); ctx.rect(-ent.w/2, -ent.h/2, ent.w, ent.h); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(-ent.w/2 + 2, ent.h/2 - 10, ent.w - 4, 8);
      ctx.beginPath(); ctx.moveTo(-ent.w/2, ent.h/2 - 12); ctx.lineTo(ent.w/2, ent.h/2 - 12); ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#64748b'; ctx.fillRect(ent.w/2 - 15, ent.h/2 - 20, 8, 4);
    } else if (ent.subType === 'Karpet') {
      ctx.beginPath(); ctx.rect(-ent.w/2, -ent.h/2, ent.w, ent.h); ctx.fill(); 
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.strokeRect(-ent.w/2 + 5, -ent.h/2 + 5, ent.w - 10, ent.h - 10); ctx.setLineDash([]);
    } else if (ent.subType === 'Kursi Kerja') {
      ctx.beginPath(); ctx.arc(0, 0, ent.w/2 - 8, 0, Math.PI*2); ctx.fillStyle = c; ctx.fill(); ctx.stroke(); 
      ctx.fillStyle = '#1e293b';
      ctx.beginPath(); ctx.arc(0, -ent.h/2 + 5, ent.w/2 - 5, Math.PI + Math.PI/4, 2*Math.PI - Math.PI/4); ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = '#334155'; ctx.fillRect(-ent.w/2 + 2, -ent.h/6, 6, ent.h/3); ctx.fillRect(ent.w/2 - 8, -ent.h/6, 6, ent.h/3);
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2;
      for(let i=0; i<5; i++) {
        ctx.beginPath(); ctx.moveTo(0,0); 
        ctx.lineTo(Math.cos(i * Math.PI * 2 / 5 - Math.PI/2) * (ent.w/2), Math.sin(i * Math.PI * 2 / 5 - Math.PI/2) * (ent.h/2));
        ctx.stroke();
        ctx.beginPath(); ctx.arc(Math.cos(i * Math.PI * 2 / 5 - Math.PI/2) * (ent.w/2), Math.sin(i * Math.PI * 2 / 5 - Math.PI/2) * (ent.h/2), 2, 0, Math.PI*2); ctx.fillStyle = '#0f172a'; ctx.fill();
      }
    } else if (ent.subType === 'Sofa') {
      const isSingle = Math.abs(ent.w - ent.h) < 20;
      drawRoundRect(ctx, -ent.w/2 + 10, -ent.h/2 + 10, ent.w - 20, ent.h - 20, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c;
      drawRoundRect(ctx, -ent.w/2, -ent.h/2, ent.w, 15, 5); ctx.fill(); ctx.stroke();
      drawRoundRect(ctx, -ent.w/2, -ent.h/2, 15, ent.h, 5); ctx.fill(); ctx.stroke();
      drawRoundRect(ctx, ent.w/2 - 15, -ent.h/2, 15, ent.h, 5); ctx.fill(); ctx.stroke();
      if(!isSingle) { 
        const seats = Math.floor(ent.w / 60) || 2;
        const seatW = (ent.w - 20) / seats;
        for(let i=1; i<seats; i++) {
          ctx.beginPath(); ctx.moveTo(-ent.w/2 + 10 + (seatW*i), -ent.h/2 + 15); ctx.lineTo(-ent.w/2 + 10 + (seatW*i), ent.h/2 - 10); ctx.stroke(); 
        }
      }
    } else if (ent.subType === 'Proyektor') {
      drawRoundRect(ctx, -ent.w/2, -ent.h/2, ent.w, ent.h, 4); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, ent.h/2, ent.w/5, Math.PI, 0, true); ctx.fillStyle = '#e2e8f0'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, ent.h/2, ent.w/8, Math.PI, 0, true); ctx.fillStyle = '#0f172a'; ctx.fill();
      ctx.fillStyle = '#64748b'; ctx.fillRect(-ent.w/2 + 5, -ent.h/2 + 5, 10, 5);
    } else if (ent.subType === 'AC Indoor') {
      drawRoundRect(ctx, -ent.w/2, -ent.h/2, ent.w, ent.h, 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-ent.w/2 + 5, ent.h/2 - 4); ctx.lineTo(ent.w/2 - 5, ent.h/2 - 4); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-ent.w/2 + 5, ent.h/2 - 8); ctx.lineTo(ent.w/2 - 5, ent.h/2 - 8); ctx.stroke();
      ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(ent.w/2 - 10, -ent.h/2 + 8, 1.5, 0, Math.PI*2); ctx.fill();
    } else if (ent.subType === 'Tanaman') {
      if(ent.potShape === 'Kotak') { 
        drawRoundRect(ctx, -15, -15, 30, 30, 4); ctx.fill(); ctx.stroke(); 
        ctx.fillStyle = '#452c06'; drawRoundRect(ctx, -12, -12, 24, 24, 2); ctx.fill();
      }
      else if (ent.potShape === 'Segi-6') {
        ctx.beginPath(); for(let i=0; i<6; i++) { ctx.lineTo(16 * Math.cos(i*Math.PI/3), 16 * Math.sin(i*Math.PI/3)); } ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#452c06'; ctx.beginPath(); for(let i=0; i<6; i++) { ctx.lineTo(12 * Math.cos(i*Math.PI/3), 12 * Math.sin(i*Math.PI/3)); } ctx.closePath(); ctx.fill();
      } else { 
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill(); ctx.stroke(); 
        ctx.fillStyle = '#452c06'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2); ctx.fill();
      }
      ctx.fillStyle = '#22c55e'; ctx.strokeStyle = '#14532d'; ctx.lineWidth = 1;
      const leafCount = ent.potShape === 'Kotak' ? 4 : (ent.potShape === 'Segi-6' ? 7 : 5);
      const leafShape = ent.potShape === 'Kotak' ? 8 : (ent.potShape === 'Segi-6' ? 3 : 10); 
      for(let i=0; i<leafCount; i++) {
        ctx.save();
        ctx.rotate(i * (Math.PI*2/leafCount) + (Math.random() * 0.2)); 
        ctx.beginPath(); 
        ctx.ellipse(12, 0, 14, leafShape, 0, 0, Math.PI*2); 
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(22, 0); ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.stroke();
        ctx.restore();
      }
    }

    ctx.shadowColor = 'transparent';
    if (selectedEntityId === ent.id) {
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.setLineDash([5,5]);
      ctx.strokeRect(-ent.w/2 - 5, -ent.h/2 - 5, ent.w + 10, ent.h + 10); ctx.setLineDash([]);
    }
    ctx.restore();
  };

  const drawLeader = (ctx: CanvasRenderingContext2D, l: any, isDrawing=false) => {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(l.startX || l.x, l.startY || l.y); ctx.lineTo(l.currentX || l.endX, l.currentY || l.endY);
    ctx.strokeStyle = (selectedEntityId === l.id) ? '#3b82f6' : '#ef4444'; ctx.lineWidth = 2; ctx.stroke();
    
    ctx.beginPath(); ctx.arc(l.startX || l.x, l.startY || l.y, 4, 0, Math.PI*2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    
    if(!isDrawing && l.visible !== false) {
      ctx.font = '12px Inter'; const tw = ctx.measureText(l.text || 'Label').width;
      const lx = l.endX; const ly = l.endY;
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(lx - tw/2 - 4, ly - 10, tw + 8, 20);
      ctx.strokeStyle = ctx.strokeStyle; ctx.lineWidth = 1; ctx.strokeRect(lx - tw/2 - 4, ly - 10, tw + 8, 20);
      ctx.fillStyle = '#0f172a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l.text || 'Label', lx, ly);
    }
    ctx.restore();
  };

  const drawNote = (ctx: CanvasRenderingContext2D, note: Entity) => {
    ctx.save(); ctx.translate(note.x, note.y); ctx.rotate((note.rotation || 0) * Math.PI / 180);
    
    ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    ctx.fillStyle = note.bgColor || '#fef08a'; ctx.fillRect(-note.w/2, -note.h/2, note.w, note.h);
    
    ctx.shadowColor = 'transparent'; ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.beginPath(); ctx.moveTo(note.w/2 - 15, -note.h/2); ctx.lineTo(note.w/2, -note.h/2 + 15); ctx.lineTo(note.w/2, -note.h/2); ctx.fill();

    if (selectedEntityId === note.id) {
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.setLineDash([5,5]);
      ctx.strokeRect(-note.w/2 - 2, -note.h/2 - 2, note.w + 4, note.h + 4); ctx.setLineDash([]);
    }

    const fStyle = note.italic ? 'italic ' : ''; const fWeight = note.bold ? 'bold ' : ''; const fSize = note.fontSize || 14;
    ctx.font = `${fStyle}${fWeight}${fSize}px "${note.fontFamily || 'Inter'}"`; ctx.textBaseline = 'top';

    const lines = (note.text || '').split('\n'); const lineHeight = fSize * 1.3; let startY = -note.h/2 + 20;
    const paddingX = 10; const maxWidth = note.w - (paddingX * 2);

    lines.forEach(rawLine => {
      const words = rawLine.split(' '); let line = '';
      for(let n=0; n<words.length; n++) {
        const testLine = line + words[n] + ' '; const metrics = ctx.measureText(testLine);
        if(metrics.width > maxWidth && n > 0) {
          renderTextLine(ctx, line, startY, note, paddingX, fSize);
          line = words[n] + ' '; startY += lineHeight;
        } else { line = testLine; }
      }
      renderTextLine(ctx, line, startY, note, paddingX, fSize);
      startY += lineHeight;
    });
    ctx.restore();
  };

  const renderTextLine = (ctx: CanvasRenderingContext2D, text: string, y: number, note: Entity, paddingX: number, fSize: number) => {
    const cleanText = text.trim(); if(!cleanText) return;
    const metrics = ctx.measureText(cleanText); let x = -note.w/2 + paddingX;
    if (note.align === 'center') { x = -metrics.width / 2; } else if (note.align === 'right') { x = note.w/2 - paddingX - metrics.width; }
    if (note.highlight) { ctx.fillStyle = 'rgba(253, 224, 71, 0.7)'; ctx.fillRect(x - 2, y - 2, metrics.width + 4, fSize + 4); }
    ctx.fillStyle = note.textColor || '#0f172a'; ctx.fillText(cleanText, x, y);
    if (note.underline) { ctx.fillRect(x, y + fSize + 1, metrics.width, Math.max(1, fSize/10)); }
  };

  const drawRoundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  };

  const addRoom = () => {
    const lastRoom = rooms[rooms.length - 1];
    let nx = 1000, ny = 700, nw = 800, nh = 600;
    if(lastRoom) { nx = lastRoom.x + lastRoom.w + 40; ny = lastRoom.y; nw = lastRoom.w; nh = lastRoom.h; }
    saveState([...rooms, { id: uuid(), x: nx, y: ny, w: nw, h: nh, floorPattern: 'putih', floorColor: '#ffffff', tileSize: 40 }], entities);
  };

  const actionRoom = (action: string) => {
    if(!selectedRoomId) return;
    const rIndex = rooms.findIndex(r => r.id === selectedRoomId);
    if(rIndex === -1) return;
    const r = rooms[rIndex];
    const getBoundEnts = () => entities.filter(e => e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h);
    const boundEnts = getBoundEnts();
    
    let newRooms = [...rooms];
    let newEnts = [...entities];

    if(action === 'delete') {
      newRooms.splice(rIndex, 1);
      newEnts = newEnts.filter(e => !boundEnts.includes(e));
      setSelectedRoomId(null);
    } else if (action === 'duplicate') {
      const newId = uuid();
      const offsetX = r.w + 40;
      newRooms.push({ ...r, id: newId, x: r.x + offsetX });
      boundEnts.forEach(e => {
        const newE = {...e, id: uuid(), x: e.x + offsetX};
        if(e.type === 'leader') { newE.endX = (e.endX || 0) + offsetX; }
        newEnts.push(newE);
      });
      setSelectedRoomId(newId);
    } else if (action === 'splitH' || action === 'splitV') {
      const r1 = {...r}; const r2 = {...r, id: uuid()};
      if(action === 'splitH') { r1.h = r.h / 2; r2.y = r.y + r1.h; r2.h = r.h / 2; } 
      else { r1.w = r.w / 2; r2.x = r.x + r1.w; r2.w = r.w / 2; }
      newRooms[rIndex] = r1; newRooms.push(r2);
    } else if (action === 'rotate') {
      const cx = r.x + r.w/2; const cy = r.y + r.h/2;
      const oldW = r.w; r.w = r.h; r.h = oldW;
      r.x = cx - r.w/2; r.y = cy - r.h/2;
      newEnts = newEnts.map(e => {
        if(boundEnts.includes(e)) {
          const dx = e.x - cx; const dy = e.y - cy;
          const updated = { ...e, x: cx - dy, y: cy + dx, rotation: (e.rotation || 0) + 90 };
          if(e.type === 'furniture' || e.type === 'opening') {
            if(e.subType !== 'Tanaman' && e.subType !== 'Kursi Kerja') { const tmp = updated.w; updated.w = updated.h; updated.h = tmp; }
          }
          if(e.type === 'leader') {
            const ldx = (e.endX || 0) - cx; const ldy = (e.endY || 0) - cy;
            updated.endX = cx - ldy; updated.endY = cy + ldx;
          }
          return updated;
        }
        return e;
      });
      newRooms[rIndex] = r;
    }
    saveState(newRooms, newEnts);
  };

  const addFurniture = () => {
    let tx = 1400, ty = 1000;
    if(rooms.length > 0) { tx = rooms[0].x + rooms[0].w/2; ty = rooms[0].y + rooms[0].h/2; }
    const furn: Entity = { 
      id: uuid(), type: 'furniture', subType: objForm.type, x: tx, y: ty, 
      w: objForm.w, h: objForm.h, color: currentMaterial, rotation: 0, 
      potShape: objForm.type === 'Tanaman' ? objForm.potShape : undefined 
    };
    saveState(rooms, [...entities, furn]);
    setSelectedEntityId(furn.id);
  };

  const addColumn = () => {
    let tx = 1400, ty = 1000;
    if(rooms.length > 0) { tx = rooms[0].x + rooms[0].w/2; ty = rooms[0].y + rooms[0].h/2; }
    const col: Entity = { id: uuid(), type: 'column', x: tx, y: ty, w: colSize, h: colSize };
    saveState(rooms, [...entities, col]);
    setSelectedEntityId(col.id);
  };

  const deleteSelected = useCallback(() => {
    if (selectedEntityId) { saveState(rooms, entities.filter(e => e.id !== selectedEntityId)); setSelectedEntityId(null); }
    if (selectedRoomId) { actionRoom('delete'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntityId, selectedRoomId, rooms, entities, saveState]);

  const duplicateSelected = useCallback(() => {
    if (selectedEntityId) {
      const ent = entities.find(e => e.id === selectedEntityId);
      if (ent) {
        const newEnt = { ...ent, id: uuid(), x: ent.x + 30, y: ent.y + 30 };
        if(ent.type === 'leader') { newEnt.endX = (newEnt.endX || 0) + 30; newEnt.endY = (newEnt.endY || 0) + 30; }
        saveState(rooms, [...entities, newEnt]); setSelectedEntityId(newEnt.id);
      }
    }
    if (selectedRoomId) { actionRoom('duplicate'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntityId, selectedRoomId, rooms, entities, saveState]);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const s = historyRef.current[historyIndexRef.current];
      setRooms(s.rooms); setEntities(s.entities); setSelectedEntityId(null); setSelectedRoomId(null);
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const s = historyRef.current[historyIndexRef.current];
      setRooms(s.rooms); setEntities(s.entities); setSelectedEntityId(null); setSelectedRoomId(null);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); } 
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); } 
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); } 
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); duplicateSelected(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelected, duplicateSelected, undo, redo]);

  const getMousePos = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const pointInRect = (px: number, py: number, rx: number, ry: number, rw: number, rh: number, rotation = 0) => {
    if (rotation === 0) return px >= rx - rw/2 && px <= rx + rw/2 && py >= ry - rh/2 && py <= ry + rh/2;
    const rad = -rotation * Math.PI / 180;
    const tx = Math.cos(rad) * (px - rx) - Math.sin(rad) * (py - ry) + rx;
    const ty = Math.sin(rad) * (px - rx) + Math.cos(rad) * (py - ry) + ry;
    return tx >= rx - rw/2 && tx <= rx + rw/2 && ty >= ry - rh/2 && ty <= ry + rh/2;
  };

  const getWallSnap = (mx: number, my: number) => {
    const t = 15;
    for(const r of rooms) {
      const walls = [
        { x: r.x + r.w/2, y: r.y, w: r.w, h: t, side: 'top', rx:r.x, ry:r.y },
        { x: r.x + r.w/2, y: r.y + r.h, w: r.w, h: t, side: 'bottom', rx:r.x, ry:r.y },
        { x: r.x, y: r.y + r.h/2, w: t, h: r.h, side: 'left', rx:r.x, ry:r.y },
        { x: r.x + r.w, y: r.y + r.h/2, w: t, h: r.h, side: 'right', rx:r.x, ry:r.y }
      ];
      for (const w of walls) {
        if (Math.abs(mx - w.x) < (w.side==='top'||w.side==='bottom'?w.w/2:20) && 
            Math.abs(my - w.y) < (w.side==='left'||w.side==='right'?w.h/2:20)) {
          return { x: w.side==='left'||w.side==='right'?w.x:mx, y: w.side==='top'||w.side==='bottom'?w.y:my, side: w.side as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getMousePos(e);
    
    if (mode === 'select') {
      let clickedEnt = null;
      for (let i = entities.length - 1; i >= 0; i--) {
        const ent = entities[i];
        if (ent.type === 'leader') {
          if (Math.hypot(pos.x - (ent.endX||0), pos.y - (ent.endY||0)) < 20 || Math.hypot(pos.x - ent.x, pos.y - ent.y) < 20) { clickedEnt = ent; break; }
        } else if (pointInRect(pos.x, pos.y, ent.x, ent.y, ent.w, ent.h, ent.rotation)) { clickedEnt = ent; break; }
      }

      if (clickedEnt) {
        setSelectedEntityId(clickedEnt.id); setSelectedRoomId(null);
        dragDataRef.current = { id: clickedEnt.id, isRoom: false, offsetX: pos.x - clickedEnt.x, offsetY: pos.y - clickedEnt.y };
        if (clickedEnt.type === 'leader') {
          const distStart = Math.hypot(pos.x - clickedEnt.x, pos.y - clickedEnt.y);
          const distEnd = Math.hypot(pos.x - (clickedEnt.endX||0), pos.y - (clickedEnt.endY||0));
          dragDataRef.current.draggingEnd = distEnd < distStart;
          if(dragDataRef.current.draggingEnd) { dragDataRef.current.offsetX = pos.x - (clickedEnt.endX||0); dragDataRef.current.offsetY = pos.y - (clickedEnt.endY||0); }
        }
      } else {
        let clickedRoom = null;
        for (let i = rooms.length - 1; i >= 0; i--) {
          const r = rooms[i];
          if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) { clickedRoom = r; break; }
        }
        if(clickedRoom) {
          setSelectedRoomId(clickedRoom.id); setSelectedEntityId(null);
          const boundEnts = entities.filter(e => e.x >= clickedRoom.x && e.x <= clickedRoom.x + clickedRoom.w && e.y >= clickedRoom.y && e.y <= clickedRoom.y + clickedRoom.h)
                            .map(e => ({ id: e.id, dx: e.x - clickedRoom.x, dy: e.y - clickedRoom.y, dxEnd: e.endX?e.endX-clickedRoom.x:0, dyEnd: e.endY?e.endY-clickedRoom.y:0 }));
          dragDataRef.current = { id: clickedRoom.id, isRoom: true, offsetX: pos.x - clickedRoom.x, offsetY: pos.y - clickedRoom.y, boundEnts: boundEnts };
        } else { setSelectedEntityId(null); setSelectedRoomId(null); }
      }
    } 
    else if (mode === 'opening') {
      const snap = getWallSnap(pos.x, pos.y);
      if (snap) {
        const newEnt: Entity = { 
          id: uuid(), type: 'opening', x: snap.x, y: snap.y, wallSide: snap.side,
          subType: openingForm.type, count: openingForm.count, swingDir: openingForm.dir as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          w: openingForm.w, h: 15 
        };
        saveState(rooms, [...entities, newEnt]); setMode('select'); setSelectedEntityId(newEnt.id);
      }
    }
    else if (mode === 'leader') {
      leaderDrawDataRef.current = { id: uuid(), type: 'leader', startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y, text: 'Label' };
    }
    else if (mode === 'note') {
      const note: Entity = {
        id: uuid(), type: 'note', x: pos.x, y: pos.y, w: 150, h: 120, text: 'Catatan Baru',
        fontFamily: 'Inter', fontSize: 14, align: 'left', bold: false, italic: false, underline: false, highlight: false,
        bgColor: '#fef08a', textColor: '#0f172a', rotation: 0
      };
      saveState(rooms, [...entities, note]); setMode('select'); setSelectedEntityId(note.id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getMousePos(e);
    if (dragDataRef.current) {
      const dd = dragDataRef.current;
      if (dd.isRoom) {
        const r = rooms.find(rm => rm.id === dd.id);
        if (r) {
          let newX = pos.x - dd.offsetX; let newY = pos.y - dd.offsetY;
          
          const SNAP = 15;
          for (const o of rooms) {
            if (o.id === r.id) continue;
            if (Math.abs(newX - (o.x + o.w)) < SNAP) newX = o.x + o.w; 
            if (Math.abs((newX + r.w) - o.x) < SNAP) newX = o.x - r.w; 
            if (Math.abs(newX - o.x) < SNAP) newX = o.x; 
            if (Math.abs((newX + r.w) - (o.x + o.w)) < SNAP) newX = o.x + o.w - r.w; 
            
            if (Math.abs(newY - (o.y + o.h)) < SNAP) newY = o.y + o.h; 
            if (Math.abs((newY + r.h) - o.y) < SNAP) newY = o.y - r.h; 
            if (Math.abs(newY - o.y) < SNAP) newY = o.y; 
            if (Math.abs((newY + r.h) - (o.y + o.h)) < SNAP) newY = o.y + o.h - r.h; 
          }

          const newRooms = rooms.map(rm => rm.id === r.id ? { ...rm, x: newX, y: newY } : rm);
          const newEnts = entities.map(ent => {
            const be = dd.boundEnts?.find(b => b.id === ent.id);
            if(be) {
              return { ...ent, x: newX + be.dx, y: newY + be.dy, endX: ent.type==='leader' ? newX + be.dxEnd : ent.endX, endY: ent.type==='leader' ? newY + be.dyEnd : ent.endY };
            }
            return ent;
          });
          setRooms(newRooms); setEntities(newEnts);
        }
      } else {
        const newEnts = entities.map(ent => {
          if (ent.id === dd.id) {
            if (ent.type === 'opening') {
              const snap = getWallSnap(pos.x, pos.y);
              if (snap) return { ...ent, x: snap.x, y: snap.y, wallSide: snap.side as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
            } else if (ent.type === 'leader') {
              if (dd.draggingEnd) return { ...ent, endX: pos.x - dd.offsetX, endY: pos.y - dd.offsetY };
              return { ...ent, x: pos.x - dd.offsetX, y: pos.y - dd.offsetY };
            } else {
              return { ...ent, x: pos.x - dd.offsetX, y: pos.y - dd.offsetY };
            }
          }
          return ent;
        });
        setEntities(newEnts);
      }
    }
    if (leaderDrawDataRef.current) {
      leaderDrawDataRef.current.currentX = pos.x; leaderDrawDataRef.current.currentY = pos.y;
      draw();
    }
  };

  const handleMouseUp = () => {
    if (dragDataRef.current) {
      saveState(rooms, entities);
      dragDataRef.current = null;
    }
    if (leaderDrawDataRef.current) {
      const dd = leaderDrawDataRef.current;
      const dx = Math.abs(dd.startX - dd.currentX);
      const dy = Math.abs(dd.startY - dd.currentY);
      if (dx > 10 || dy > 10) {
        const newLeader: Entity = {
          id: dd.id, type: 'leader', x: dd.startX, y: dd.startY, endX: dd.currentX, endY: dd.currentY, text: dd.text, visible: true, w:0, h:0
        };
        saveState(rooms, [...entities, newLeader]);
        setSelectedEntityId(newLeader.id);
      }
      leaderDrawDataRef.current = null;
      setMode('select');
    }
  };

  const updateSelectedEntity = (updates: Partial<Entity>) => {
    if(!selectedEntityId) return;
    let updatedEnt: Entity | null = null;
    const newEnts = entities.map(e => {
      if(e.id === selectedEntityId) { updatedEnt = { ...e, ...updates }; return updatedEnt; }
      return e;
    });
    
    if (updatedEnt && (updatedEnt as Entity).type === 'note' && canvasRef.current) {
       const ctx = canvasRef.current.getContext('2d');
       if (ctx) {
         const ent = updatedEnt as Entity;
         ctx.font = `${ent.fontSize}px ${ent.fontFamily}`;
         const rawLines = (ent.text || '').split('\n');
         let totalLines = 0;
         const maxWidth = ent.w - 20;
         rawLines.forEach(line => {
             let currentLine = '';
             line.split(' ').forEach(word => {
                 if(ctx.measureText(currentLine + word + ' ').width > maxWidth && currentLine !== '') { totalLines++; currentLine = word + ' '; } 
                 else { currentLine += word + ' '; }
             });
             totalLines++;
         });
         ent.h = Math.max(120, (totalLines * ((ent.fontSize || 14) * 1.3)) + 40);
       }
    }
    saveState(rooms, newEnts);
  };

  const updateSelectedRoom = (updates: Partial<Room>) => {
    if(!selectedRoomId) return;
    saveState(rooms.map(r => r.id === selectedRoomId ? { ...r, ...updates } : r), entities);
  };

  const printPDF = () => {
    const opt = { margin: 10, filename: 'Denah_Ruangan.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 1 }, jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' } };
    const wrapper = document.getElementById('canvasWrapper');
    if ((window as any).html2pdf && wrapper) (window as any).html2pdf().set(opt).from(wrapper).save(); // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  const activeEnt = entities.find(e => e.id === selectedEntityId);
  const activeRoom = rooms.find(r => r.id === selectedRoomId);

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      
      {/* PANEL KIRI: TOOLS */}
      <div className="w-80 h-full flex flex-col bg-white border-r border-slate-200 shadow-sm z-10 overflow-y-auto">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><BoxSelect size={20} /></div>
          <h1 className="text-base font-bold text-slate-800">Room Decorator</h1>
        </div>

        <div className="p-4 flex-1 space-y-6">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Peralatan</div>
            <div className="flex gap-2">
              <button className={`flex-1 p-2 flex justify-center items-center rounded-lg border transition-all ${mode === 'select' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`} onClick={() => setMode('select')} title="Pilih / Geser">
                <MousePointer2 size={18} />
              </button>
              <button className={`flex-1 p-2 flex justify-center items-center rounded-lg border transition-all ${mode === 'leader' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`} onClick={() => setMode('leader')} title="Anotasi">
                <PenTool size={18} />
              </button>
              <button className={`flex-1 p-2 flex justify-center items-center rounded-lg border transition-all ${mode === 'note' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`} onClick={() => setMode('note')} title="Catatan">
                <StickyNote size={18} />
              </button>
            </div>
          </div>

          <hr className="border-slate-100"/>

          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Material Aktif</div>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <div key={c} onClick={() => setCurrentMaterial(c)} className={`w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110 border-2 ${currentMaterial === c ? 'border-slate-800' : 'border-transparent'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <hr className="border-slate-100"/>

          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Furnitur</div>
            <div className="flex flex-col gap-2">
              <select className="p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white" value={objForm.type} onChange={(e) => {
                const type = e.target.value;
                const sizes: Record<string, number[]> = { 'Kursi Kerja': [60,60], 'Sofa': [160,80], 'Meja': [120,60], 'Kulkas': [70,70], 'Tanaman': [50,50], 'Karpet': [200,300], 'Proyektor': [30,20], 'Meja Tamu': [90,50], 'AC Indoor': [80,25], 'Custom': [100,100] };
                setObjForm({...objForm, type, w: sizes[type][0], h: sizes[type][1]});
              }}>
                <option value="Kursi Kerja">Kursi Kerja</option><option value="Sofa">Sofa</option><option value="Meja">Meja</option><option value="Kulkas">Kulkas</option><option value="Tanaman">Tanaman</option><option value="Karpet">Karpet</option><option value="Proyektor">Proyektor</option><option value="Meja Tamu">Meja Tamu</option><option value="AC Indoor">AC Indoor</option><option value="Custom">Custom</option>
              </select>
              
              {objForm.type === 'Tanaman' && (
                <select className="p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white" value={objForm.potShape} onChange={e => setObjForm({...objForm, potShape: e.target.value})}>
                  <option value="Bulat">Pot Bulat (Daun Lebar)</option><option value="Kotak">Pot Kotak (Monstera)</option><option value="Segi-6">Pot Segi-6 (Snake Plant)</option>
                </select>
              )}
              
              <div className="flex gap-2 items-center">
                <input type="number" className="w-16 p-2 text-sm border border-slate-200 rounded-lg outline-none text-center" value={objForm.w} onChange={e=>setObjForm({...objForm, w: parseInt(e.target.value)||60})} placeholder="L" />
                <span className="text-slate-400 text-xs">X</span>
                <input type="number" className="w-16 p-2 text-sm border border-slate-200 rounded-lg outline-none text-center" value={objForm.h} onChange={e=>setObjForm({...objForm, h: parseInt(e.target.value)||60})} placeholder="T" />
                <button onClick={addFurniture} className="flex-1 p-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 flex justify-center items-center gap-1 shadow-sm"><Plus size={16}/> Buat</button>
              </div>
            </div>
          </div>

          <hr className="border-slate-100"/>

          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Arsitektur (Snap)</div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <select className="flex-1 p-2 text-sm border border-slate-200 rounded-lg outline-none bg-white" value={openingForm.type} onChange={e=>setOpeningForm({...openingForm, type: e.target.value})}>
                  <option value="Pintu">Pintu</option><option value="Jendela">Jendela</option>
                </select>
                <select className="w-20 p-2 text-sm border border-slate-200 rounded-lg outline-none bg-white" value={openingForm.count} onChange={e=>setOpeningForm({...openingForm, count: parseInt(e.target.value)})}>
                  <option value={1}>1 Daun</option><option value={2}>2 Daun</option><option value={3}>3 Daun</option>
                </select>
              </div>
              {openingForm.type === 'Pintu' && (
                <select className="p-2 text-sm border border-slate-200 rounded-lg outline-none bg-white" value={openingForm.dir} onChange={e=>setOpeningForm({...openingForm, dir: e.target.value})}>
                  <option value="in">Buka Dalam</option><option value="out">Buka Luar</option>
                </select>
              )}
              <div className="flex gap-2 items-center">
                <input type="number" className="w-16 p-2 text-sm border border-slate-200 rounded-lg outline-none" value={openingForm.w} onChange={e=>setOpeningForm({...openingForm, w: parseInt(e.target.value)||80})} placeholder="px" />
                <button onClick={() => setMode('opening')} className={`flex-1 p-2 font-medium rounded-lg flex justify-center items-center gap-1 transition-colors shadow-sm ${mode === 'opening' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}><Plus size={16}/> {mode === 'opening' ? 'Pasang...' : 'Pasang'}</button>
              </div>
            </div>
            
            <div className="mt-4 flex gap-2 items-center">
              <span className="text-sm font-medium w-16">Kolom</span>
              <input type="number" className="w-16 p-2 text-sm border border-slate-200 rounded-lg outline-none text-center" value={colSize} onChange={e=>setColSize(parseInt(e.target.value)||30)} placeholder="px" />
              <button onClick={addColumn} className="flex-1 p-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 flex justify-center items-center gap-1 shadow-sm"><Plus size={16}/> Buat</button>
            </div>
          </div>
        </div>
      </div>

      {/* TENGAH: KANVAS */}
      <div className="flex-1 flex flex-col relative bg-slate-200">
        <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <button onClick={addRoom} className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100" title="Tambah Ruangan"><Plus size={18}/></button>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button onClick={() => actionRoom('rotate')} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Putar Ruangan"><RotateCw size={18}/></button>
            <button onClick={() => actionRoom('duplicate')} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Duplikat"><Copy size={18}/></button>
            <button onClick={() => actionRoom('splitV')} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Split Vertical"><SplitSquareVertical size={18}/></button>
            <button onClick={() => actionRoom('splitH')} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Split Horizontal"><SplitSquareHorizontal size={18}/></button>
            <button onClick={() => actionRoom('delete')} className="p-2 rounded-lg text-red-500 hover:bg-red-50" title="Hapus"><Trash2 size={18}/></button>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button onClick={undo} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Undo"><Undo size={18}/></button>
            <button onClick={redo} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" title="Redo"><Redo size={18}/></button>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
            <div className={`w-2 h-2 rounded-full ${user ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
            Team Workspace
          </div>
        </div>
        
        <div id="canvasWrapper" className="flex-1 overflow-auto bg-[#e2e8f0] relative" style={{ cursor: mode === 'select' ? 'default' : 'crosshair' }}>
          <canvas 
            ref={canvasRef} width={3000} height={2000} 
            className="bg-white shadow-xl absolute top-10 left-10"
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp}
          />
        </div>
      </div>

      {/* PANEL KANAN: PROPERTI */}
      <div className="w-72 h-full flex flex-col bg-white border-l border-slate-200 shadow-sm z-10 overflow-y-auto">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2 font-bold text-slate-700 text-sm"><Settings2 size={18}/> Properti</div>
          <button onClick={printPDF} className="p-1.5 text-xs font-bold bg-slate-800 text-white rounded flex items-center gap-1 hover:bg-slate-700"><Download size={14}/> PDF</button>
        </div>
        
        <div className="p-4 flex-1">
          {!activeEnt && !activeRoom && (
             <div className="text-center text-slate-400 text-sm mt-10 p-4 border-2 border-dashed border-slate-200 rounded-xl">
               Pilih ruangan atau objek untuk diedit.
             </div>
          )}

          {activeEnt && (
            <div className="space-y-6">
              <div className="flex gap-2">
                <button onClick={() => updateSelectedEntity({ rotation: (activeEnt.rotation || 0) - 45 })} className="flex-1 p-2 rounded bg-slate-100 hover:bg-slate-200 flex justify-center"><RotateCw size={16} className="-scale-x-100" /></button>
                <button onClick={() => updateSelectedEntity({ rotation: (activeEnt.rotation || 0) + 45 })} className="flex-1 p-2 rounded bg-slate-100 hover:bg-slate-200 flex justify-center"><RotateCw size={16} /></button>
                <button onClick={duplicateSelected} className="flex-1 p-2 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 flex justify-center"><Copy size={16} /></button>
                <button onClick={deleteSelected} className="flex-1 p-2 rounded bg-red-50 text-red-600 hover:bg-red-100 flex justify-center"><Trash2 size={16} /></button>
              </div>

              {activeEnt.type === 'furniture' && (
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Warna Objek</div>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map(c => (
                      <div key={c} onClick={() => updateSelectedEntity({ color: c })} className={`w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110 border-2 ${activeEnt.color === c ? 'border-slate-800' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              )}

              {activeEnt.type === 'leader' && (
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Teks Anotasi</div>
                  <input type="text" className="w-full p-2 border rounded text-sm outline-none focus:border-blue-500" value={activeEnt.text || ''} onChange={e => updateSelectedEntity({ text: e.target.value })} />
                  <button onClick={() => updateSelectedEntity({ visible: !activeEnt.visible })} className="w-full mt-2 p-2 text-sm bg-slate-100 rounded hover:bg-slate-200">{activeEnt.visible ? 'Sembunyikan' : 'Tampilkan'} Label</button>
                </div>
              )}

              {activeEnt.type === 'note' && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Isi Catatan</div>
                  <textarea className="w-full p-2 border rounded text-sm outline-none focus:border-blue-500 min-h-[100px]" value={activeEnt.text || ''} onChange={e => updateSelectedEntity({ text: e.target.value })} />
                  
                  <div className="flex gap-2">
                    <select className="flex-1 p-1.5 border rounded text-sm" value={activeEnt.fontFamily || 'Inter'} onChange={e => updateSelectedEntity({ fontFamily: e.target.value })}>
                      <option value="Inter">Inter</option><option value="Arial">Arial</option><option value="Courier New">Courier</option><option value="Comic Sans MS">Comic Sans</option>
                    </select>
                    <input type="number" className="w-16 p-1.5 border rounded text-sm" value={activeEnt.fontSize || 14} onChange={e => updateSelectedEntity({ fontSize: parseInt(e.target.value) })} />
                  </div>
                  
                  <div className="flex gap-2 bg-slate-50 p-1 rounded border">
                    <button onClick={() => updateSelectedEntity({ align: 'left' })} className={`flex-1 p-1.5 rounded flex justify-center ${activeEnt.align === 'left' ? 'bg-white shadow-sm' : 'text-slate-400'}`}><AlignLeft size={16}/></button>
                    <button onClick={() => updateSelectedEntity({ align: 'center' })} className={`flex-1 p-1.5 rounded flex justify-center ${activeEnt.align === 'center' ? 'bg-white shadow-sm' : 'text-slate-400'}`}><AlignCenter size={16}/></button>
                    <button onClick={() => updateSelectedEntity({ align: 'right' })} className={`flex-1 p-1.5 rounded flex justify-center ${activeEnt.align === 'right' ? 'bg-white shadow-sm' : 'text-slate-400'}`}><AlignRight size={16}/></button>
                  </div>
                  
                  <div className="flex gap-2 bg-slate-50 p-1 rounded border">
                    <button onClick={() => updateSelectedEntity({ bold: !activeEnt.bold })} className={`flex-1 p-1.5 rounded flex justify-center ${activeEnt.bold ? 'bg-white shadow-sm font-bold text-black' : 'text-slate-400'}`}><Bold size={16}/></button>
                    <button onClick={() => updateSelectedEntity({ italic: !activeEnt.italic })} className={`flex-1 p-1.5 rounded flex justify-center ${activeEnt.italic ? 'bg-white shadow-sm italic text-black' : 'text-slate-400'}`}><Italic size={16}/></button>
                    <button onClick={() => updateSelectedEntity({ underline: !activeEnt.underline })} className={`flex-1 p-1.5 rounded flex justify-center ${activeEnt.underline ? 'bg-white shadow-sm underline text-black' : 'text-slate-400'}`}><Underline size={16}/></button>
                    <button onClick={() => updateSelectedEntity({ highlight: !activeEnt.highlight })} className={`flex-1 p-1.5 rounded flex justify-center ${activeEnt.highlight ? 'bg-yellow-200 shadow-sm text-yellow-800' : 'text-slate-400'}`}><Highlighter size={16}/></button>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-xs font-medium">Warna Kertas</span>
                    <input type="color" value={activeEnt.bgColor || '#fef08a'} onChange={e => updateSelectedEntity({ bgColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium">Warna Teks</span>
                    <input type="color" value={activeEnt.textColor || '#0f172a'} onChange={e => updateSelectedEntity({ textColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeRoom && !activeEnt && (
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ukuran Ruangan</div>
              <div className="flex gap-2 items-center">
                <input type="number" className="flex-1 p-2 border rounded text-sm outline-none" value={activeRoom.w} onChange={e => updateSelectedRoom({ w: parseInt(e.target.value) || activeRoom.w })} placeholder="Lebar" />
                <span className="text-slate-400">X</span>
                <input type="number" className="flex-1 p-2 border rounded text-sm outline-none" value={activeRoom.h} onChange={e => updateSelectedRoom({ h: parseInt(e.target.value) || activeRoom.h })} placeholder="Tinggi" />
              </div>
              
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-6 mb-2">Desain Lantai</div>
              <select className="w-full p-2 border rounded text-sm outline-none bg-white" value={activeRoom.floorPattern} onChange={e => updateSelectedRoom({ floorPattern: e.target.value })}>
                <option value="putih">Putih Polos</option><option value="semen">Semen (Abu)</option><option value="tanah">Tanah (Coklat)</option><option value="pasir">Pasir (Bertekstur)</option><option value="ubin">Ubin / Keramik</option>
              </select>
              
              <div className="flex justify-between items-center mt-3">
                <span className="text-sm">Warna Dasar</span>
                <input type="color" value={activeRoom.floorColor || '#ffffff'} onChange={e => updateSelectedRoom({ floorColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
              </div>
              
              {activeRoom.floorPattern === 'ubin' && (
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm">Ukuran Ubin</span>
                  <input type="number" className="w-20 p-1.5 border rounded text-sm outline-none" value={activeRoom.tileSize} onChange={e => updateSelectedRoom({ tileSize: parseInt(e.target.value) })} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}