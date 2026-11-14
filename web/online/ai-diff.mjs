/** Character diff with a bounded matrix; very large rewrites remain one hunk. */
export function diffText(before, after) {
  const a=Array.from(before),b=Array.from(after);let p=0,s=0;
  while(p<a.length&&p<b.length&&a[p]===b[p])p++;
  while(s<a.length-p&&s<b.length-p&&a[a.length-1-s]===b[b.length-1-s])s++;
  const x=a.slice(p,a.length-s),y=b.slice(p,b.length-s),ops=[];
  const push=(kind,text)=>{if(!text)return;const last=ops.at(-1);if(last?.kind===kind)last.text+=text;else ops.push({kind,text});};
  push('equal',a.slice(0,p).join(''));
  if(x.length*y.length>1_000_000){push('delete',x.join(''));push('insert',y.join(''));}
  else {
    const w=y.length+1,d=new Uint16Array((x.length+1)*w);
    for(let i=x.length-1;i>=0;i--)for(let j=y.length-1;j>=0;j--)d[i*w+j]=x[i]===y[j]?d[(i+1)*w+j+1]+1:Math.max(d[(i+1)*w+j],d[i*w+j+1]);
    let i=0,j=0;while(i<x.length||j<y.length){if(i<x.length&&j<y.length&&x[i]===y[j]){push('equal',x[i++]);j++;}else if(j<y.length&&(i===x.length||d[i*w+j+1]>d[(i+1)*w+j]))push('insert',y[j++]);else push('delete',x[i++]);}
  }
  push('equal',s?a.slice(a.length-s).join(''):'');
  const parts=[];for(const op of ops){if(op.kind==='equal')parts.push({equal:op.text});else{let h=parts.at(-1);if(!h||h.equal!==undefined){h={before:'',after:'',accepted:true};parts.push(h);}h[op.kind==='delete'?'before':'after']+=op.text;}}
  // Tiny coincidental matches inside a Korean word make noisy fragments.
  for(let i=1;i<parts.length-1;i++)if(parts[i].equal!==undefined&&Array.from(parts[i].equal).length<=2&&parts[i-1].equal===undefined&&parts[i+1].equal===undefined){
    parts[i-1].before+=parts[i].equal+parts[i+1].before;parts[i-1].after+=parts[i].equal+parts[i+1].after;parts.splice(i,2);i--;
  }
  return parts;
}
export const acceptedText=parts=>parts.map(p=>p.equal??(p.accepted?p.after:p.before)).join('');
