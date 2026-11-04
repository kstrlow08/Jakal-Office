import {createRemoteJWKSet,jwtVerify} from 'jose';
const authKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),{timeoutDuration:5000});
const appKeys=createRemoteJWKSet(new URL('https://firebaseappcheck.googleapis.com/v1/jwks'),{timeoutDuration:5000,cacheMaxAge:6*60*60*1000});
export function createVerifier({authKey=authKeys,appKey=appKeys}={}){
  return async(request,env)=>{
    const auth=request.headers.get('Authorization')||'',app=request.headers.get('X-Firebase-AppCheck')||'';
    if(!/^Bearer [\w.-]{20,8192}$/.test(auth)||!app||app.length>8192)throw Error('unauthorized');
    const [identity,attestation]=await Promise.all([
      jwtVerify(auth.slice(7),authKey,{algorithms:['RS256'],issuer:`https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,audience:env.FIREBASE_PROJECT_ID,requiredClaims:['exp','iat','auth_time','sub']}),
      jwtVerify(app,appKey,{algorithms:['RS256'],typ:'JWT',issuer:`https://firebaseappcheck.googleapis.com/${env.FIREBASE_PROJECT_NUMBER}`,audience:`projects/${env.FIREBASE_PROJECT_NUMBER}`,requiredClaims:['exp','iat','sub']})
    ]);
    const p=identity.payload,now=Math.floor(Date.now()/1000);
    if(typeof p.sub!=='string'||!p.sub||p.sub.length>128||p.iat>now||!Number.isFinite(p.auth_time)||p.auth_time<0||p.auth_time>now||p.firebase?.sign_in_provider!=='google.com'||p.email_verified!==true||attestation.protectedHeader.typ!=='JWT'||attestation.payload.sub!==env.FIREBASE_APP_ID)throw Error('unauthorized');
    return p.sub;
  };
}
export const verifyRequest=createVerifier();
