// Palette-based recolor: 6 grayscale trim bands + 6 near-black (hair) + 6 near-white (skin)
(function(){
  const SLOT_HUES = { blue: 240, green: 120, yellow: 60, red: 0 };
  // New anchor rules: neutral gray only at three levels (tolerance in luma space)
  const ANCHORS = {
    TRIM: { y: 40, tol: 8 },   // low gray ~ #282828–#383838
    SKIN: { y: 158, tol: 10 }, // mid gray ~ #9E9E9E–#A8A8A8
    HAIR: { y: 96, tol: 8 }    // dark gray ~ #585858–#686868
  };
  // New band rules (Gauntlet Legends grayscale spec)
  const RANGES = {
    HAIR:  { min: 80,  max: 120 },
    SKIN:  { min: 130, max: 170 },
    ARMOR: { min: 30,  max: 70  },
    TRIM:  { min: 190, max: 230 }
  };
  const DEFAULT_PALETTES = {
    Warrior: { skinH: 28, skinS: 0.45, skinL: 0.72, unique1: '#9aa3ad', unique2: '#6b3f1f' },
    Archer:  { skinH: 30, skinS: 0.55, skinL: 0.60, unique1: '#8b5a2b', unique2: '#2e8b57' },
    Wizard:  { skinH: 25, skinS: 0.25, skinL: 0.82, unique1: '#c9a227', unique2: '#1f2a44' },
    Valkyrie:{ skinH: 22, skinS: 0.35, skinL: 0.85, unique1: '#b7c2cc', unique2: '#7a1322' },
    Unknown: { skinH: 25, skinS: 0.35, skinL: 0.80, unique1: '#888888', unique2: '#555555' }
  };

  function hexToRgb(hex){ const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return m?{r:parseInt(m[1],16),g:parseInt(m[2],16),b:parseInt(m[3],16)}:{r:128,g:128,b:128}; }
  function hslToRgb(h,s,l){ const c=(1-Math.abs(2*l-1))*s, hp=h/60, x=c*(1-Math.abs((hp%2)-1)); let r1=0,g1=0,b1=0;
    if(hp>=0&&hp<1){r1=c;g1=x;} else if(hp<2){r1=x;g1=c;} else if(hp<3){g1=c;b1=x;} else if(hp<4){g1=x;b1=c;} else if(hp<5){r1=x;b1=c;} else {r1=c;b1=x;}
    const m=l-c/2; return {r:Math.round((r1+m)*255), g:Math.round((g1+m)*255), b:Math.round((b1+m)*255)}; }
  function clamp01(v){ return Math.max(0, Math.min(1, v)); }

  function inRange(v, rng){ return v >= rng.min && v <= rng.max; }

  function slotShadeColor(hue, t){ // t = normalized 0..1 within TRIM band for shading
    const s = 0.75;
    const l = 0.35 + t * 0.45; // preserve band-internal gradient
    return hslToRgb(hue, s, clamp01(l));
  }

  function skinColor(palette, y){ // y in 0..255
    const {skinH: h, skinS: s, skinL: baseL}=palette;
    const t = (y - RANGES.SKIN.min) / (RANGES.SKIN.max - RANGES.SKIN.min);
    const shade = (t - 0.5) * 0.20; // subtle +/- lightness around base
    return hslToRgb(h, s, clamp01(baseL + shade));
  }

  function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = d / (1 - Math.abs(2 * l - 1));
      if (l < 0.5) {
        h = (max - g) / d + (max - b) / d * 6;
      } else {
        h = (max - g) / d + (max - b) / d * 6;
      }
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }

    return { h: h, s: s, l: l };
  }

  function paletteFor(character){
    const name = character?.name || 'Unknown';
    return DEFAULT_PALETTES[name] || DEFAULT_PALETTES.Unknown;
  }

  function isNeutralGray(r,g,b){ 
    const {s}=rgbToHsl(r,g,b); 
    return s <= 0.08;
  }

  function getLuma(r,g,b){ return Math.round(0.2126*r + 0.7152*g + 0.0722*b); }

  function hairColorRgb(img, slotHue){
    // Prefer per-slot hair hex set by UI; fallback to slot hue
    let hex = null;
    try{
      const slot = img.closest('.character-slot');
      if (slot){
        const idx = parseInt(slot.dataset.player,10)-1;
        hex = (window.playerSlots && window.playerSlots[idx] && window.playerSlots[idx].hairColor) || null;
      }
    }catch(e){}
    if (hex){
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (m) return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
    }
    return hslToRgb(slotHue, 0.8, 0.25);
  }

  async function paletteRecolor(img, character, slotColorName, returnBlob=true){
    return new Promise(resolve=>{
      const run=()=>{
        try{
          const c=document.createElement('canvas'), x=c.getContext('2d',{willReadFrequently:true});
          c.width=img.naturalWidth; c.height=img.naturalHeight;
          x.drawImage(img,0,0);
          const d=x.getImageData(0,0,c.width,c.height), p=d.data;
          const hue=SLOT_HUES[slotColorName] ?? 240;
          const lerp=(a,b,t)=>Math.round(a+(b-a)*t);
          // Edge decontamination to prevent halos/splotching on transparency
          for(let i=0;i<p.length;i+=4){
            const a=p[i+3]; if(a>0 && a<40){ const y=getLuma(p[i],p[i+1],p[i+2]); p[i]=y; p[i+1]=y; p[i+2]=y; }
          }
          for(let i=0;i<p.length;i+=4){
            const a=p[i+3]; if(a<5) continue;
            const r=p[i], g=p[i+1], b=p[i+2];
            if (!isNeutralGray(r,g,b)) continue; // only neutral grays are recolored
            const y=getLuma(r,g,b);
            const dyTrim=Math.abs(y-ANCHORS.TRIM.y), dySkin=Math.abs(y-ANCHORS.SKIN.y), dyHair=Math.abs(y-ANCHORS.HAIR.y);
            if (dyTrim<=ANCHORS.TRIM.tol){ const t=1-(dyTrim/ANCHORS.TRIM.tol); const col=slotShadeColor(hue,t); p[i]=col.r;p[i+1]=col.g;p[i+2]=col.b; continue; }
            if (dySkin<=ANCHORS.SKIN.tol){ const col=skinColor(paletteFor(character), y); p[i]=col.r;p[i+1]=col.g;p[i+2]=col.b; continue; }
            if (dyHair<=ANCHORS.HAIR.tol){ const tgt=hairColorRgb(img,hue); const tt=(y- (ANCHORS.HAIR.y-ANCHORS.HAIR.tol))/(ANCHORS.HAIR.tol*2); const l=0.18+0.30*tt; const hh=rgbToHsl(tgt.r,tgt.g,tgt.b).h; const col=hslToRgb(hh,0.88,clamp01(l)); p[i]=col.r;p[i+1]=col.g;p[i+2]=col.b; continue; }
            // Any other neutral gray stays untouched to preserve artist intent
          }
          x.putImageData(d,0,0);
          c.toBlob(blob=>{
            if(!blob){ resolve(returnBlob?null:undefined); return; }
            const url=URL.createObjectURL(blob);
            if(returnBlob){ resolve(url); }
            else { if(img.dataset.blobUrl) URL.revokeObjectURL(img.dataset.blobUrl); img.dataset.blobUrl=url; img.src=url; resolve(); }
          });
        }catch(e){ console.warn('[PaletteRecolor] Failed, leaving original image', e); resolve(returnBlob?null:undefined); }
      };
      if(img.complete && img.naturalWidth) run(); else img.addEventListener('load', run, {once:true});
    });
  }

  window.paletteRecolor = paletteRecolor;
})();