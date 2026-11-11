import { site, withinSite } from './layout.js';

export const agentRadius = .29;
const spacing = .27;

export function segmentHits(a,b,box,pad=0) {
  let near=0, far=1;
  for (let axis=0;axis<2;axis++) {
    const start=a[axis], travel=b[axis]-start;
    const min=box[axis]-pad, max=box[axis+2]+pad;
    if (Math.abs(travel)<1e-8) {
      if (start<min || start>max) return false;
      continue;
    }
    const first=(min-start)/travel, last=(max-start)/travel;
    near=Math.max(near,Math.min(first,last));
    far=Math.min(far,Math.max(first,last));
    if (near>far) return false;
  }
  return true;
}

class Heap {
  items=[];
  push(value) {
    const items=this.items;
    let index=items.length;
    items.push(value);
    while (index>0) {
      const parent=(index-1)>>1;
      if (items[parent][1]<=value[1]) break;
      items[index]=items[parent];
      index=parent;
    }
    items[index]=value;
  }
  pop() {
    const items=this.items;
    const first=items[0], last=items.pop();
    if (!items.length) return first;
    let index=0;
    while (2*index+1<items.length) {
      let child=2*index+1;
      if (items[child+1]?.[1]<items[child][1]) child++;
      if (items[child][1]>=last[1]) break;
      items[index]=items[child];
      index=child;
    }
    items[index]=last;
    return first;
  }
}

export function navigation(obstacles) {
  const minX=-site.width/2+agentRadius, minZ=-site.depth/2+agentRadius;
  const columns=Math.floor(-2*minX/spacing)+1, rows=Math.floor(-2*minZ/spacing)+1;
  const cellCount=columns*rows;
  const blocked=new Uint8Array(cellCount);
  const cell=(x,z)=>z*columns+x;
  const position=index=>[minX+(index%columns)*spacing,minZ+Math.floor(index/columns)*spacing];
  const within=(x,z)=>x>=0 && z>=0 && x<columns && z<rows;
  const boundsCheck=point=>withinSite(point,agentRadius);
  for (let index=0;index<cellCount;index++) {
    if (!boundsCheck(position(index))) blocked[index]=1;
  }
  for (const {box} of obstacles) {
    const x0=Math.ceil((box[0]-agentRadius-minX)/spacing), x1=Math.floor((box[2]+agentRadius-minX)/spacing);
    const z0=Math.ceil((box[1]-agentRadius-minZ)/spacing), z1=Math.floor((box[3]+agentRadius-minZ)/spacing);
    for (let z=Math.max(z0,0);z<=Math.min(z1,rows-1);z++) {
      for (let x=Math.max(x0,0);x<=Math.min(x1,columns-1);x++) blocked[cell(x,z)]=1;
    }
  }
  const clear=(a,b,ignore=null,radius=agentRadius)=>boundsCheck(a) && boundsCheck(b) &&
    !obstacles.some(({box,id})=>!(ignore && id===ignore) && segmentHits(a,b,box,radius));

  function nearest(point) {
    const x0=Math.round((point[0]-minX)/spacing), z0=Math.round((point[1]-minZ)/spacing);
    let closest=-1, distance=Infinity;
    for (let z=z0-2;z<=z0+2;z++) {
      for (let x=x0-2;x<=x0+2;x++) {
        if (!within(x,z) || blocked[cell(x,z)]) continue;
        const index=cell(x,z), next=position(index);
        const delta=Math.hypot(next[0]-point[0],next[1]-point[1]);
        if (delta>=distance || !clear(point,next)) continue;
        closest=index;
        distance=delta;
      }
    }
    return closest;
  }

  function route(from,to) {
    if (clear(from,to)) return [to];
    const start=nearest(from), end=nearest(to);
    if (start<0 || end<0) return null;
    const [endX,endZ]=position(end);
    const scores=new Float64Array(cellCount).fill(Infinity);
    const parent=new Int32Array(cellCount).fill(-1);
    const visited=new Uint8Array(cellCount);
    const open=new Heap();
    open.push([start,0]);
    scores[start]=0;
    while (open.items.length) {
      const [index]=open.pop();
      if (visited[index]) continue;
      if (index===end) {
        const raw=[to];
        for (let step=end;step!==-1;step=parent[step]) raw.push(position(step));
        raw.reverse();
        const result=[];
        let last=from, next=0;
        while (next<raw.length) {
          let best=next;
          while (best+1<raw.length && clear(last,raw[best+1])) best++;
          if (!clear(last,raw[best])) return null;
          last=raw[best];
          result.push(last);
          next=best+1;
        }
        return result;
      }
      visited[index]=1;
      const x=index%columns, z=Math.floor(index/columns);
      for (let dz=-1;dz<=1;dz++) {
        for (let dx=-1;dx<=1;dx++) {
          if (!(dx||dz) || !within(x+dx,z+dz)) continue;
          const neighbor=cell(x+dx,z+dz);
          if (blocked[neighbor] || visited[neighbor]) continue;
          if (dx && dz && (blocked[cell(x+dx,z)] || blocked[cell(x,z+dz)])) continue;
          const cost=scores[index]+spacing*(dx&&dz?Math.SQRT2:1);
          if (cost>=scores[neighbor]) continue;
          const [nx,nz]=position(neighbor);
          scores[neighbor]=cost;
          parent[neighbor]=index;
          open.push([neighbor,cost+Math.hypot(endX-nx,endZ-nz)]);
        }
      }
    }
    return null;
  }

  return {clear,route};
}
