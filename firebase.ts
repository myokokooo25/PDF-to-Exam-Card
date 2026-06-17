import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBIHOPE-bmMyyB95r8KR4LRX8mfNqflwOs",
  authDomain: "gen-lang-client-0272929059.firebaseapp.com",
  projectId: "gen-lang-client-0272929059",
  storageBucket: "gen-lang-client-0272929059.firebasestorage.app",
  messagingSenderId: "329126699255",
  appId: "1:329126699255:web:16ccea025c791c501e33f2"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app, "ai-studio-ad940081-e2f1-4222-9aab-910b941d9f21");
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, db, auth, googleProvider, signInWithPopup, signOut };
