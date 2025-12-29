import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyArODEmlcHBB65Y7NyhJhfIgaTUhBU3QGA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "eva-calculator.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "eva-calculator",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "eva-calculator.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "728744522680",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:728744522680:web:392ce719cfe20a0b54154d",
  measurementId: "G-04BLXV9F3J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

export default app;

