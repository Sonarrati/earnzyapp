// Firebase Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyDVl5XOC_TSRQrJ6JS40abEiy9WdUPnyMM",
  authDomain: "earnzy-apps.firebaseapp.com",
  projectId: "earnzy-apps",
  storageBucket: "earnzy-apps.firebasestorage.app",
  messagingSenderId: "937142085027",
  appId: "1:937142085027:web:ec2b42b9d078e8cc166616",
  measurementId: "G-DGJ4D6QB74"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

export { app, auth, db, functions };
