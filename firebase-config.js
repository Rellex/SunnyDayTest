/*
  ╔══════════════════════════════════════════════════════╗
  ║  ШАГИ ДЛЯ НАСТРОЙКИ FIREBASE:                       ║
  ║                                                      ║
  ║  1. Зайдите на https://console.firebase.google.com   ║
  ║  2. Создайте проект (бесплатный план Spark)          ║
  ║  3. Настройки проекта → «Мои приложения» → </> Web   ║
  ║     Скопируйте конфиг сюда ↓                         ║
  ║  4. Authentication → включите Email/Password         ║
  ║  5. Authentication → Users → добавьте admin-аккаунт  ║
  ║  6. Firestore Database → Создать БД (test mode)      ║
  ║  7. Storage → Начать (test mode)                     ║
  ╚══════════════════════════════════════════════════════╝
*/

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBUx0gbFfjzcFm-Zhhona9MLp3v4_GhmM4",
  authDomain: "solnechni-ba009.firebaseapp.com",
  projectId: "solnechni-ba009",
  storageBucket: "solnechni-ba009.firebasestorage.app",
  messagingSenderId: "999506635517",
  appId: "1:999506635517:web:c99f33c25fd49cd7472c94",
  measurementId: "G-DTJ8J4YL0F"
};

// true = Firebase активен, false = локальный сервер (data.js)
const FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey !== "REPLACE_ME";
