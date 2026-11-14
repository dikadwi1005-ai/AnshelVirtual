const width=480, height=270, horizon=105;

function rect(ctx,x,y,w,h,color) {
  ctx.fillStyle=color;
  ctx.fillRect(x,y,w,h);
}

function shape(ctx,points,color) {
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fill();
}

function text(ctx,value,x,y,size,color) {
  ctx.fillStyle=color;
  ctx.font='800 '+size+'px system-ui';
  ctx.fillText(value,x,y);
}

export const isGameReaction=time=>time>=4 && time%8>=4 && time%8<4.9;

export function drawLoungeGame(ctx,time,players,genre=0) {
  if (genre===1) {
    rect(ctx,0,0,width,height,'#203c34');
    for(let x=30;x<450;x+=55) rect(ctx,x,46,52,181,x%2?'#427955':'#3a704d');
    ctx.strokeStyle='#d0e4ab'; ctx.strokeRect(26,45,428,184); ctx.strokeRect(26,88,42,97); ctx.strokeRect(412,88,42,97);
    rect(ctx,239,46,2,181,'#d0e4ab');
    for(let i=0;i<8;i++) {
      const x=92+i%4*96+Math.sin(time+i*2)*21,y=86+Math.floor(i/4)*83+Math.cos(time*.9+i)*22;
      rect(ctx,x,y,13,14,i%2?'#efa872':'#83d4ef');
    }
    rect(ctx,236+Math.sin(time*1.82)*162,135+Math.cos(time*1.3)*61,8,8,'#fff4cd');
    text(ctx,'KICKOFF KAMPUNG',28,30,20,'#edf5d0');
    text(ctx,players?players+' pemain':'Demo',31,252,15,'#d4e9ca');
    return;
  }
  if (genre===2) {
    rect(ctx,0,0,width,height,'#222941');
    const palette=['#80d4c3','#e1a577','#928ed9','#e1cf8a'];
    for(let i=0;i<48;i++) {
      const x=95+i%8*36,y=46+Math.floor(i/8)*30;
      const index=(i*5+Math.floor(time+i%4))%palette.length;
      rect(ctx,x,y,29,24,palette[index]);
    }
    const active=Math.floor(time*3)%48;
    ctx.strokeStyle='#fff6ce'; ctx.lineWidth=2; ctx.strokeRect(93+active%8*36,44+Math.floor(active/8)*30,33,28);
    text(ctx,'RONA MOSAIK',28,28,20,'#f0dec9');
    text(ctx,players?players+' pemain':'Demo',32,251,15,'#dfd4ef');
    return;
  }
  rect(ctx,0,0,width,height,'#27305a');
  rect(ctx,0,76,width,34,'#483c72');
  ctx.fillStyle='#ffd083';
  ctx.beginPath();
  ctx.arc(368,83,32,0,Math.PI*2);
  ctx.fill();
  shape(ctx,[[0,114],[44,72],[72,95],[122,60],[190,112],[247,71],[301,115]],'#375679');
  shape(ctx,[[217,117],[278,86],[313,107],[349,88],[382,111],[437,64],[480,103],[480,117]],'#435a87');

  for (let y=horizon;y<height;y+=3) {
    const depth=(y-horizon)/(height-horizon);
    const road=14+depth*211;
    const bend=Math.sin(time*.56+depth*2.4)*(1-depth)*101;
    const center=width/2+bend;
    const band=Math.floor(2.8/(depth+.055)+time*6)%2;
    rect(ctx,0,y,width,3,band?'#3d6979':'#427585');
    rect(ctx,center-road-4,y,road*2+8,3,band?'#f29e86':'#f5e2ad');
    rect(ctx,center-road,y,road*2,3,band?'#243a52':'#263d56');
    if (band) rect(ctx,center-1-depth*2,y,2+depth*4,3,'#d7cdb2');
  }

  function car(x,y,scale,primary,highlight) {
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(scale,scale);
    rect(ctx,-25,9,50,10,'#152438');
    rect(ctx,-23,-4,8,22,'#132233');
    rect(ctx,15,-4,8,22,'#132233');
    shape(ctx,[[-24,10],[-22,-2],[-14,-8],[-8,-16],[9,-16],[16,-8],[23,-2],[25,10]],primary);
    shape(ctx,[[-13,-7],[-7,-13],[8,-13],[13,-7]],'#b4def3');
    rect(ctx,-18,3,10,4,highlight);
    rect(ctx,8,3,10,4,highlight);
    ctx.restore();
  }
  car(278+Math.sin(time*.77+1)*55,172+Math.sin(time*.82)*13,.78,'#f28f7b','#ffdbb6');
  car(222+Math.sin(time*.93)*57,220+Math.sin(time*2.5)*2,1.2,'#5ddfcb','#e4ffe1');
  if (players>1) car(353+Math.sin(time*.67)*34,206,.92,'#9c94f3','#f4defe');

  rect(ctx,0,0,width,46,'#14223c');
  text(ctx,'ANSHEL CIRCUIT',16,28,23,'#eff3ef');
  text(ctx,players?players+' PEMAIN':'MODE DEMO',350,27,15,'#83e7d6');
  if (players && isGameReaction(time)) {
    rect(ctx,178,60,124,26,'#14223c');
    text(ctx,'CHECKPOINT',190,78,16,'#ffda91');
  }
}
