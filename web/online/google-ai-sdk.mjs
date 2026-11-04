// Official modular Firebase SDK. Bundled locally, loaded only by the AI panel.
export {initializeApp,getApps} from 'firebase/app';
export {getAuth,setPersistence,browserSessionPersistence,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,signOut,onAuthStateChanged} from 'firebase/auth';
export {initializeAppCheck,ReCaptchaEnterpriseProvider,getToken,setTokenAutoRefreshEnabled} from 'firebase/app-check';
// Generation is handled by the authenticated Cloudflare Worker, not Firebase AI Logic.
