// Grayscale QA analyzer: highlights anchors and logs coverage
(function(){
  const ANCHORS = { TRIM:{y:40,tol:8}, SKIN:{y:158,tol:10}, HAIR:{y:96,tol:8} };
  const LUMA = (r,g,b)=>0.2126*r+0.7152*g+0.0722*b;
  const isNeutral=(r,g,b)=>{ const max=Math.max(r,g,b),min=Math.min(r,g,b); return (max-min)<=8; };

  async function generateGrayscaleQAMask(img){
    return new Promise(res=>{
      const run=()=>{
        const W=img.naturalWidth,H=img.naturalHeight;
        const c=document.createElement('canvas'), x=c.getContext('2d',{willReadFrequently:true}); c.width=W; c.height=H;
        x.drawImage(img,0,0); const d=x.getImageData(0,0,W,H), p=d.data;
        const overlay=document.createElement('canvas'), ox=overlay.getContext('2d'); overlay.width=W; overlay.height=H;
        const od=ox.createImageData(W,H), op=od.data; let ct=0,ch=0,cs=0,tot=0;
        for(let i=0;i<p.length;i+=4){
          const a=p[i+3]; if(a<10) continue; tot++;
          const r=p[i],g=p[i+1],b=p[i+2]; if(!isNeutral(r,g,b)) continue;
          const y=LUMA(r,g,b); const pt=i; let col=null;
          if (Math.abs(y-ANCHORS.TRIM.y)<=ANCHORS.TRIM.tol){ col=[0,220,255,220]; ct++; }
          else if (Math.abs(y-ANCHORS.HAIR.y)<=ANCHORS.HAIR.tol){ col=[255,0,180,220]; ch++; }
          else if (Math.abs(y-ANCHORS.SKIN.y)<=ANCHORS.SKIN.tol){ col=[255,220,0,220]; cs++; }
          if (col){ op[pt]=col[0]; op[pt+1]=col[1]; op[pt+2]=col[2]; op[pt+3]=col[3]; }
        }
        ox.putImageData(od,0,0);
        const pct = v=> (tot? ((v/tot)*100).toFixed(2):'0.00')+'%';
        console.table({ Trim_pixels: ct, Hair_pixels: ch, Skin_pixels: cs, Total_considered: tot,
                        Trim_pct: pct(ct), Hair_pct: pct(ch), Skin_pct: pct(cs) });
        res({ canvas: overlay, stats:{trim:ct,hair:ch,skin:cs,total:tot} });
      };
      if(img.complete && img.naturalWidth) run(); else img.addEventListener('load', run, {once:true});
    });
  }

  window.generateGrayscaleQAMask = generateGrayscaleQAMask;
})();