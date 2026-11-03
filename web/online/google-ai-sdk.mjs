// Official modular Firebase SDK. Bundled locally, loaded only by the AI panel.
export {initializeApp,getApps} from 'firebase/app';
export {getAuth,setPersistence,browserSessionPersistence,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'firebase/auth';
export {initializeAppCheck,ReCaptchaEnterpriseProvider,getToken,setTokenAutoRefreshEnabled} from 'firebase/app-check';
export {getAI,GoogleAIBackend,getGenerativeModel,Schema} from 'firebase/ai';
