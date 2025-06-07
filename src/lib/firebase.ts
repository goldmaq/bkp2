
console.log("Firebase.ts: Module loading. NODE_ENV:", process.env.NODE_ENV, "Window defined:", typeof window !== 'undefined');

import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const firebaseConfigValues: Partial<FirebaseConfig> = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

console.log("Firebase.ts: Raw environment variable values being read:");
console.log("DEBUG: NEXT_PUBLIC_FIREBASE_API_KEY:", process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
console.log("DEBUG: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
console.log("DEBUG: NEXT_PUBLIC_FIREBASE_PROJECT_ID:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
console.log("DEBUG: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:", process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
console.log("DEBUG: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:", process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);
console.log("DEBUG: NEXT_PUBLIC_FIREBASE_APP_ID:", process.env.NEXT_PUBLIC_FIREBASE_APP_ID);
console.log("DEBUG: firebaseConfigValues collected:", firebaseConfigValues);


const requiredKeys: Array<keyof FirebaseConfig> = [
  'apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'
];

const missingEnvVarKeys: string[] = requiredKeys.filter(key => !firebaseConfigValues[key]);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (missingEnvVarKeys.length > 0) {
  const errorMessage = `Firebase Fatal Error: Essential Firebase configuration is missing for the following keys: ${missingEnvVarKeys.join(", ")}.
Please ensure these environment variables are set and accessible to the client-side application.
- If running locally, check your .env.local file.
- If deployed, check your hosting provider's environment variable settings (e.g., apphosting.yaml and Google Cloud Secret Manager).
CHECK THE BROWSER CONSOLE LOGS ABOVE THIS ERROR for 'DEBUG: NEXT_PUBLIC_FIREBASE_...' lines to see the actual values being read.
Application may not function correctly without these Firebase credentials.`;

  console.error("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.error("!!! FIREBASE FATAL ERROR: ENVIRONMENT VARIABLES ARE MISSING !!!");
  console.error(`!!! Details: ${errorMessage}`);
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n");
} else {
  const completeConfig = firebaseConfigValues as FirebaseConfig;

  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.log("Firebase.ts: Attempting to initialize with projectId:", completeConfig.projectId);
  }
  
  if (typeof window !== 'undefined' && completeConfig.projectId !== "gold-maq-control" && process.env.NODE_ENV !== 'production') {
     console.warn("Firebase.ts: WARNING - Project ID does NOT match 'gold-maq-control'. Expected: 'gold-maq-control', Got:", completeConfig.projectId);
  }

  try {
    console.log("Firebase.ts: Checking existing Firebase apps...");
    if (!getApps().length) {
      console.log("Firebase.ts: No existing Firebase app found. Initializing new app...");
      app = initializeApp(completeConfig);
      console.log("Firebase.ts: New Firebase app initialized.");
    } else {
      console.log("Firebase.ts: Existing Firebase app found. Getting app instance...");
      app = getApp();
      console.log("Firebase.ts: Existing Firebase app instance retrieved.");
    }

    console.log("Firebase.ts: Getting Firestore instance...");
    db = getFirestore(app);
    console.log("Firebase.ts: Firestore instance retrieved.");

    console.log("Firebase.ts: Getting Storage instance...");
    storage = getStorage(app);
    console.log("Firebase.ts: Storage instance retrieved.");

    if (app) {
      console.log("Firebase.ts: Firebase initialized successfully. Project ID:", app.options.projectId);
    } else {
      console.error("Firebase.ts: CRITICAL - Firebase app object is null after initialization attempt.");
    }

  } catch (error) {
    console.error("Firebase.ts: CRITICAL ERROR DURING FIREBASE INITIALIZATION OR SERVICE RETRIEVAL:", error);
  }
}

export { db, storage, app };
