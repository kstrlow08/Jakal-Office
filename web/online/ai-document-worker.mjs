import {AiDocument} from './ai-document.mjs';
import {diffText} from './ai-diff.mjs';
let document;
self.onmessage=({data})=>{
  try{let result;
    if(data.type==='capture'){document=new AiDocument(data.bytes);result=document.index(data.scope,data.location,data.targetId);}
    else if(data.type==='index'){if(!document)throw Error('문서를 다시 읽어 주세요.');result=document.index(data.scope,data.location,data.targetId);}
    else if(data.type==='apply'){if(!document)throw Error('문서를 다시 읽어 주세요.');result={bytes:document.apply(data.changes)};}
    else if(data.type==='diff')result=data.items.map(item=>({id:item.id,parts:diffText(item.before,item.after)}));
    else throw Error('지원하지 않는 AI 문서 요청입니다.');
    self.postMessage({id:data.id,result},result?.bytes?[result.bytes.buffer]:[]);
  }catch(error){self.postMessage({id:data.id,error:error.message||'문서를 처리하지 못했습니다.'});}
};
