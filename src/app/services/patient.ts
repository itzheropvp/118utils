import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc, collectionData, query, where, orderBy } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Timestamp } from '@angular/fire/firestore';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class PatientService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  private colRef = collection(this.firestore, 'patients');

  async addVitals(patientId: string, vitals: any) {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Not authenticated');

    return addDoc(this.colRef, {
      patientId,
      vitals,
      createdAt: Timestamp.fromDate(new Date()),
      createdBy: user.uid,
    });
  }

  getMyPatients() {
    const user = this.auth.currentUser;

    if (!user) {
      const q = query(this.colRef, where('createdBy', '==', '__none__'));
      return collectionData(q, { idField: 'id' });
    }

    const q = query(
      this.colRef,
      where('createdBy', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map((docs: any[]) => docs.map(d => ({
        ...d,
        createdAt: d.createdAt?.toDate?.() ?? null
      })))
    );
  }
}
