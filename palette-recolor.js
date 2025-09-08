// Palette-based recolor: 6 grayscale trim bands + 6 near-black (hair) + 6 near-white (skin)
(function(){
  const SLOT_HUES = { blue: 240, green: 120, yellow: 60, red: 0 };
  const TRIM_LEVELS = [48, 72, 96, 120, 144, 168]; // exact 6 mid-gray trim values
  const HAIR_MAX = 40;   // 6 closest to black roughly within 0–40
  const SKIN_MIN = 215;  // 6 closest to white roughly within 215–255
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

  // Map to nearest of the 6 trim levels
  function trimBandForLuma(y){
    let idx=0, min=1e9;
    for(let i=0;i<TRIM_LEVELS.length;i++){ const d=Math.abs(y-TRIM_LEVELS[i]); if(d<min){min=d; idx=i;} }
    return idx; // 0..5
  }

  function slotShadeColor(hue, band){ // band: 0..5
    const sArr=[0.70,0.72,0.74,0.76,0.78,0.80], lArr=[0.26,0.34,0.44,0.56,0.68,0.78];
    return hslToRgb(hue, sArr[band], lArr[band]);
  }

  function skinColor(palette, y){ // y in 0..255
    const {skinH: h, skinS: s, skinL: baseL}=palette;
    const shade = (y - SKIN_MIN) / (255 - SKIN_MIN) * 0.15 - 0.05; // keep subtle shading
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

  function getLuma(r,g,b){ return Math.round(0.2126*r + 0.7152*g + 0.0722*b); }

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
          for(let i=0;i<p.length;i+=4){
            const a=p[i+3]; if(a<5) continue;
            const r=p[i], g=p[i+1], b=p[i+2]; const y=getLuma(r,g,b);
            const hsl=rgbToHsl(r,g,b);
            // classify by luma first; require low saturation to be considered grayscale areas
            if (hsl.s <= 0.18) {
              if (y <= HAIR_MAX) { /* hair: do nothing here; hair tint pass will recolor */ continue; }
              if (y >= SKIN_MIN) { const col=skinColor(paletteFor(character), y); p[i]=col.r; p[i+1]=col.g; p[i+2]=col.b; continue; }
              // trim mid-grays
              const band = trimBandForLuma(y); const tgt=slotShadeColor(hue, band);
              p[i]=tgt.r; p[i+1]=tgt.g; p[i+2]=tgt.b; continue;
            }
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