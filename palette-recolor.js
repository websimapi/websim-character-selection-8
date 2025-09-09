// Palette-based recolor: 3 specific neutral gray bands for Trim, Skin, Hair
(function(){
  const SLOT_HUES = { blue: 240, green: 120, yellow: 60, red: 0 };

  // Strict anchor points matching the art generation spec.
  // Using exact RGB values is more robust than luma for neutral grays.
  const ANCHORS = {
    TRIM: { r: 48,  g: 48,  b: 48,  range: 8 },  // #303030, range #282828–#383838
    SKIN: { r: 164, g: 164, b: 164, range: 6 },  // #A4A4A4, range #9E9E9E–#AEAEAE
    HAIR: { r: 96,  g: 96,  b: 96,  range: 8 }   // #606060, range #585858–#686868
  };
  
  const DEFAULT_PALETTES = {
    Warrior: { skinH: 28, skinS: 0.45, skinL: 0.72 },
    Archer:  { skinH: 30, skinS: 0.55, skinL: 0.60 },
    Wizard:  { skinH: 25, skinS: 0.25, skinL: 0.82 },
    Valkyrie:{ skinH: 22, skinS: 0.35, skinL: 0.85 },
    Unknown: { skinH: 25, skinS: 0.35, skinL: 0.80 }
  };

  function hslToRgb(h,s,l){ const c=(1-Math.abs(2*l-1))*s, hp=h/60, x=c*(1-Math.abs((hp%2)-1)); let r1=0,g1=0,b1=0;
    if(hp>=0&&hp<1){r1=c;g1=x;} else if(hp<2){r1=x;g1=c;} else if(hp<3){g1=c;b1=x;} else if(hp<4){g1=x;b1=c;} else if(hp<5){r1=x;b1=c;} else {r1=c;b1=x;}
    const m=l-c/2; return {r:Math.round((r1+m)*255), g:Math.round((g1+m)*255), b:Math.round((b1+m)*255)}; }
  function clamp01(v){ return Math.max(0, Math.min(1, v)); }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } 
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch(max){
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h * 360, s: s, l: l };
  }

  function slotShadeColor(hue, t){ // t = normalized 0..1 based on original gray lightness
    const s = 0.75 + t * 0.1; // More saturated in highlights
    const l = 0.25 + t * 0.4; // Darkest: 0.25, Brightest: 0.65
    return hslToRgb(hue, clamp01(s), clamp01(l));
  }

  function skinColor(palette, grayValue){
    const {skinH: h, skinS: s, skinL: baseL} = palette;
    const t = (grayValue - (ANCHORS.SKIN.r - ANCHORS.SKIN.range)) / (ANCHORS.SKIN.range * 2);
    const shade = (t - 0.5) * 0.25; // +/- 12.5% lightness from base
    return hslToRgb(h, s, clamp01(baseL + shade));
  }

  function hairColor(baseRgb, grayValue) {
    const { h, s: baseS } = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);
    const t = (grayValue - (ANCHORS.HAIR.r - ANCHORS.HAIR.range)) / (ANCHORS.HAIR.range * 2);
    const s = Math.min(1.0, baseS * 1.2 + 0.1); // Boost saturation
    const l = 0.10 + t * 0.40; // Lightness range from 10% to 50%
    return hslToRgb(h, clamp01(s), clamp01(l));
  }

  function paletteFor(character){
    const name = character?.name || 'Unknown';
    return DEFAULT_PALETTES[name] || DEFAULT_PALETTES.Unknown;
  }

  function isNeutralGray(r,g,b, tolerance = 10){
    return Math.abs(r-g) <= tolerance && Math.abs(g-b) <= tolerance && Math.abs(r-b) <= tolerance;
  }

  function hairColorRgb(img, slotHue){
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
          
          for(let i=0;i<p.length;i+=4){
            const a=p[i+3]; if(a<20) continue;
            const r=p[i], g=p[i+1], b=p[i+2];

            if (!isNeutralGray(r,g,b)) continue; // only process neutral grays

            const grayValue = Math.round((r+g+b)/3);
            const distTrim = Math.abs(grayValue - ANCHORS.TRIM.r);
            const distSkin = Math.abs(grayValue - ANCHORS.SKIN.r);
            const distHair = Math.abs(grayValue - ANCHORS.HAIR.r);
            
            if (distTrim <= ANCHORS.TRIM.range) {
                const t = (grayValue - (ANCHORS.TRIM.r - ANCHORS.TRIM.range)) / (ANCHORS.TRIM.range * 2);
                const col=slotShadeColor(hue, t);
                p[i]=col.r; p[i+1]=col.g; p[i+2]=col.b;
            } else if (distSkin <= ANCHORS.SKIN.range) {
                const col=skinColor(paletteFor(character), grayValue);
                p[i]=col.r; p[i+1]=col.g; p[i+2]=col.b;
            } else if (distHair <= ANCHORS.HAIR.range) {
                const tgt=hairColorRgb(img,hue);
                const col=hairColor(tgt, grayValue);
                p[i]=col.r; p[i+1]=col.g; p[i+2]=col.b;
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