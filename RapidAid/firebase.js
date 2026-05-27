const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyB7kJeDT_mkAPBE6x3aJgQCtkWnzltSguU",
  authDomain: "rapidaid-23b02.firebaseapp.com",
  projectId: "rapidaid-23b02",
  storageBucket: "rapidaid-23b02.firebasestorage.app",
  messagingSenderId: "55613436482",
  appId: "1:55613436482:web:3c30fc65e045364e4233db",
  measurementId: "G-W2B7ZNPZFL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

module.exports = { db };
