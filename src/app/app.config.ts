import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes), 
    provideFirebaseApp(() => initializeApp({ 
      projectId: "test-118params", 
      appId: "1:598256623819:web:05378c08552d51e191bb4e", 
      storageBucket: "test-118params.firebasestorage.app", 
      apiKey: "AIzaSyCHfOr7dcAHTI4DSakT1Ovdcq4fRdMveXc", 
      authDomain: "test-118params.firebaseapp.com", 
      messagingSenderId: "598256623819", 
    })), 
      provideAuth(() => getAuth()), 
      provideFirestore(() => getFirestore())
  ]
};
