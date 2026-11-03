import {DOMParser,XMLSerializer,Node,Element} from '@xmldom/xmldom';
class StrictXmlParser extends DOMParser {
  constructor(){super({onError(level,message){if(level!=='warning')throw new Error('Invalid export XML: '+message);}});}
}
/** XML DOM only; no HTML, scripts or document/network APIs are installed. */
export function installWorkerXml(){
  if(!Object.getOwnPropertyDescriptor(Element.prototype,'children'))Object.defineProperty(Element.prototype,'children',{get(){return Array.from(this.childNodes).filter((node:any)=>node.nodeType===1);}});
  if(!Object.getOwnPropertyDescriptor(Node.prototype,'parentElement'))Object.defineProperty(Node.prototype,'parentElement',{get(){return this.parentNode?.nodeType===1?this.parentNode:null;}});
  if(!(Element.prototype as any).remove)(Element.prototype as any).remove=function(){this.parentNode?.removeChild(this);};
  Object.assign(globalThis,{DOMParser:StrictXmlParser,XMLSerializer});
}
