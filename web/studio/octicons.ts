import manifest from './octicons-manifest.json' with { type: 'json' };
import { octiconsData } from './octicons-data.ts';
const templates = new WeakMap<Document, Map<string,SVGSVGElement>>();

/** Small controls use the actual 16px drawing instead of a reduced 24px icon. */
export function octiconAsset(name: string, size: 16|24): SVGSVGElement | null {
  let cache=templates.get(document);if(!cache){cache=new Map();templates.set(document,cache);}
  const cacheKey=name+':'+size,cached=cache.get(cacheKey);if(cached)return cached.cloneNode(true) as SVGSVGElement;
  const key=(manifest.aliases as Record<string,string>)[name];
  const variants=(octiconsData as Record<string,Record<string,{width:number;height:number;nodes:[string,Record<string,string>][]}>>)[key];
  const asset=variants?.[size]??variants?.[16];if(!asset)return null;
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  for(const [attribute,value] of Object.entries({viewBox:`0 0 ${asset.width} ${asset.height}`,width:String(asset.width),height:String(asset.height),fill:'currentColor',stroke:'none','aria-hidden':'true',focusable:'false',class:'jakal-ribbon-icon jakal-octicon'}))svg.setAttribute(attribute,value);
  svg.style.setProperty('--jakal-icon-width',asset.width+'px');svg.style.setProperty('--jakal-icon-height',asset.height+'px');
  svg.dataset.icon=`octicon-${key}-${asset.height}`;svg.dataset.iconProvider='octicons';svg.dataset.assetKey=name;
  for(const [tag,attributes] of asset.nodes){const node=document.createElementNS(ns,tag);for(const [attribute,value] of Object.entries(attributes))node.setAttribute(attribute,value);svg.append(node);}
  cache.set(cacheKey,svg);return svg.cloneNode(true) as SVGSVGElement;
}
