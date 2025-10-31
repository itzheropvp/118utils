import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../../services/patient';
import { AuthService } from '../../services/auth';
import { Chart, registerables } from 'chart.js';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

Chart.register(...registerables);

// Declare jsPDF types
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: any;
  }
}

@Component({
  selector: 'app-dashboard',
  imports: [
    DatePipe, 
    CommonModule, 
    FormsModule, 
    MatToolbarModule, 
    MatCardModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatButtonModule, 
    MatIconModule, 
    MatMenuModule, 
    MatExpansionModule, 
    MatChipsModule, 
    MatDividerModule,
    MatSelectModule,
    MatTabsModule,
    MatDialogModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  private patientService = inject(PatientService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);

  // Form fields
  patientId = '';
  pressure = '';
  hr: number | null = null;
  spo2: number | null = null;
  note = '';

  // Messages
  message = signal<string | null>(null);
  error = signal<string | null>(null);

  // Patient data
  patients: any[] = [];

  // Filters
  searchId = '';
  sortBy = 'newest';
  criticalityFilter = 'all';
  filteredPatients = signal<any[]>([]);

  // Charts
  private pressureChart: Chart | null = null;
  private hrChart: Chart | null = null;
  private spo2Chart: Chart | null = null;

  // PDF export
  isExporting = signal(false);

  constructor() {
    this.loadPatients();
  }

  ngOnInit() {
    setTimeout(() => this.initCharts(), 1000);
  }

  ngOnDestroy() {
    if (this.pressureChart) this.pressureChart.destroy();
    if (this.hrChart) this.hrChart.destroy();
    if (this.spo2Chart) this.spo2Chart.destroy();
  }

  loadPatients() {
    this.patientService.getMyPatients().subscribe(docs => {
      this.patients = docs;
      this.applyFilters();
      this.updateCharts();
    });
  }

  async save() {
    this.message.set(null);
    this.error.set(null);

    if (!this.patientId) {
      this.error.set('Inserisci un ID paziente');
      return;
    }

    try {
      await this.patientService.addVitals(this.patientId, {
        pressure: this.pressure,
        hr: this.hr,
        spo2: this.spo2,
        note: this.note,
      });
      this.message.set('Salvato ✅');
      
      this.patientId = '';
      this.pressure = '';
      this.hr = null;
      this.spo2 = null;
      this.note = '';

      this.loadPatients();
    } catch (err: any) {
      this.error.set(err.message ?? 'Errore salvataggio');
    }
  }

  // ====== FILTERS ======
  applyFilters() {
    let filtered = [...this.patients];

    if (this.searchId) {
      filtered = filtered.filter(p => 
        p.patientId?.toLowerCase().includes(this.searchId.toLowerCase())
      );
    }

    if (this.criticalityFilter !== 'all') {
      filtered = filtered.filter(p => {
        const spo2 = p.vitals?.spo2;
        if (!spo2) return false;
        
        if (this.criticalityFilter === 'critical') return spo2 < 90;
        if (this.criticalityFilter === 'warning') return spo2 >= 90 && spo2 < 95;
        if (this.criticalityFilter === 'normal') return spo2 >= 95;
        return true;
      });
    }

    filtered.sort((a, b) => {
      switch (this.sortBy) {
        case 'newest':
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case 'oldest':
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        case 'id':
          return (a.patientId || '').localeCompare(b.patientId || '');
        case 'hr':
          return (a.vitals?.hr || 0) - (b.vitals?.hr || 0);
        case 'spo2':
          return (a.vitals?.spo2 || 0) - (b.vitals?.spo2 || 0);
        default:
          return 0;
      }
    });

    this.filteredPatients.set(filtered);
  }

  resetFilters() {
    this.searchId = '';
    this.sortBy = 'newest';
    this.criticalityFilter = 'all';
    this.applyFilters();
  }

  // ====== CRITICALITY CHECKS ======
  isCritical(patient: any): boolean {
    const spo2 = patient.vitals?.spo2;
    return spo2 != null && spo2 < 90;
  }

  isWarning(patient: any): boolean {
    const spo2 = patient.vitals?.spo2;
    return spo2 != null && spo2 >= 90 && spo2 < 95;
  }

  getCriticalCount(): number {
    return this.patients.filter(p => this.isCritical(p)).length;
  }

  getWarningCount(): number {
    return this.patients.filter(p => this.isWarning(p)).length;
  }

  getNormalCount(): number {
    return this.patients.filter(p => {
      const spo2 = p.vitals?.spo2;
      return spo2 != null && spo2 >= 95;
    }).length;
  }

  // ====== CHARTS ======
  initCharts() {
    this.updateCharts();
  }

  updateCharts() {
    if (this.patients.length === 0) return;

    const recentPatients = [...this.patients]
      .filter(p => p.createdAt)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-10);

    if (recentPatients.length === 0) return;

    const labels = recentPatients.map((p, i) => 
      `${p.patientId?.substring(0, 6) || 'N/D'}`
    );

    const pressureCtx = document.getElementById('pressureChart') as HTMLCanvasElement;
    if (pressureCtx) {
      if (this.pressureChart) this.pressureChart.destroy();
      
      const pressureData = recentPatients.map(p => p.vitals?.pressure || 'N/D');
      
      this.pressureChart = new Chart(pressureCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Pressione Arteriosa',
            data: pressureData.map((p, i) => i + 1),
            backgroundColor: '#f44336',
            borderColor: '#d32f2f',
            borderWidth: 2
          }]
        },
        options: { 
          responsive: true, 
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true },
            tooltip: {
              callbacks: {
                label: (context) => `PA: ${pressureData[context.dataIndex]}`
              }
            }
          },
          scales: {
            y: { display: false }
          }
        }
      });
    }

    const hrCtx = document.getElementById('hrChart') as HTMLCanvasElement;
    if (hrCtx) {
      if (this.hrChart) this.hrChart.destroy();
      
      this.hrChart = new Chart(hrCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Frequenza Cardiaca (bpm)',
            data: recentPatients.map(p => p.vitals?.hr || 0),
            borderColor: '#ff9800',
            backgroundColor: 'rgba(255, 152, 0, 0.1)',
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointHoverRadius: 7
          }]
        },
        options: { 
          responsive: true, 
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true }
          },
          scales: { 
            y: { 
              beginAtZero: true, 
              max: 200,
              ticks: { stepSize: 20 }
            } 
          }
        }
      });
    }

    const spo2Ctx = document.getElementById('spo2Chart') as HTMLCanvasElement;
    if (spo2Ctx) {
      if (this.spo2Chart) this.spo2Chart.destroy();
      
      this.spo2Chart = new Chart(spo2Ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'SpO₂ (%)',
              data: recentPatients.map(p => p.vitals?.spo2 || 0),
              borderColor: '#2196f3',
              backgroundColor: 'rgba(33, 150, 243, 0.2)',
              tension: 0.4,
              fill: true,
              pointRadius: 6,
              pointHoverRadius: 8,
              pointBackgroundColor: recentPatients.map(p => {
                const spo2 = p.vitals?.spo2;
                if (!spo2) return '#bdbdbd';
                if (spo2 < 90) return '#f44336';
                if (spo2 < 95) return '#ff9800';
                return '#4caf50';
              })
            },
            {
              label: 'Soglia Critica (90%)',
              data: Array(labels.length).fill(90),
              borderColor: '#f44336',
              borderWidth: 2,
              borderDash: [10, 5],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: { 
          responsive: true, 
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true }
          },
          scales: { 
            y: { 
              beginAtZero: false, 
              min: 70,
              max: 100,
              ticks: { stepSize: 5 }
            } 
          }
        }
      });
    }
  }

  // ====== PDF EXPORT ======
  async exportPdf(patient: any) {
    this.isExporting.set(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Header AREU
      doc.setFillColor(220, 53, 69); // Rosso AREU
      doc.rect(0, 0, pageWidth, 25, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('118 - AREU Lombardia', pageWidth / 2, 12, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Scheda Paziente - Parametri Vitali', pageWidth / 2, 19, { align: 'center' });

      // Reset text color
      doc.setTextColor(0, 0, 0);
      
      let yPos = 35;

      // Patient Info Box
      doc.setFillColor(227, 242, 253);
      doc.roundedRect(10, yPos, pageWidth - 20, 25, 2, 2, 'F');
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Informazioni Paziente', 15, yPos + 8);
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`ID Paziente: ${patient.patientId || 'N/D'}`, 15, yPos + 16);
      
      const createdDate = patient.createdAt ? new Date(patient.createdAt).toLocaleString('it-IT') : 'N/D';
      doc.text(`Data/Ora Rilevazione: ${createdDate}`, 15, yPos + 22);
      
      yPos += 35;

      // Criticality Badge
      if (this.isCritical(patient)) {
        doc.setFillColor(244, 67, 54);
        doc.setTextColor(255, 255, 255);
        doc.roundedRect(10, yPos, 50, 10, 2, 2, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('⚠ CRITICO', 12, yPos + 7);
        doc.setTextColor(0, 0, 0);
        yPos += 15;
      } else if (this.isWarning(patient)) {
        doc.setFillColor(255, 152, 0);
        doc.setTextColor(255, 255, 255);
        doc.roundedRect(10, yPos, 50, 10, 2, 2, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('⚠ ATTENZIONE', 12, yPos + 7);
        doc.setTextColor(0, 0, 0);
        yPos += 15;
      }

      // Vital Signs Table
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Parametri Vitali', 14, yPos);
      
      yPos += 5;

      const vitalsData = [
        ['Parametro', 'Valore', 'Stato'],
        [
          'Pressione Arteriosa (PA)', 
          patient.vitals?.pressure || 'N/D',
          '-'
        ],
        [
          'Frequenza Cardiaca (FC)', 
          patient.vitals?.hr ? `${patient.vitals.hr} bpm` : 'N/D',
          patient.vitals?.hr ? this.getHrStatus(patient.vitals.hr) : '-'
        ],
        [
          'Saturazione Ossigeno (SpO₂)', 
          patient.vitals?.spo2 ? `${patient.vitals.spo2}%` : 'N/D',
          patient.vitals?.spo2 ? this.getSpo2Status(patient.vitals.spo2) : '-'
        ]
      ];

      doc.autoTable({
        startY: yPos,
        head: [vitalsData[0]],
        body: vitalsData.slice(1),
        theme: 'grid',
        headStyles: {
          fillColor: [25, 118, 210],
          textColor: 255,
          fontSize: 11,
          fontStyle: 'bold',
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 10,
          cellPadding: 5
        },
        columnStyles: {
          0: { cellWidth: 70, fontStyle: 'bold' },
          1: { cellWidth: 60, halign: 'center' },
          2: { cellWidth: 50, halign: 'center', fontStyle: 'bold' }
        },
        didParseCell: (data: any) => {
          // Color code status column
          if (data.column.index === 2 && data.row.index > 0) {
            const status = data.cell.text[0];
            if (status === 'CRITICO') {
              data.cell.styles.textColor = [244, 67, 54];
            } else if (status === 'ATTENZIONE') {
              data.cell.styles.textColor = [255, 152, 0];
            } else if (status === 'NORMALE') {
              data.cell.styles.textColor = [76, 175, 80];
            }
          }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Notes section
      if (patient.vitals?.note) {
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Note Cliniche', 14, yPos);
        
        yPos += 7;
        
        doc.setFillColor(245, 245, 245);
        const noteHeight = 30;
        doc.roundedRect(10, yPos, pageWidth - 20, noteHeight, 2, 2, 'F');
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const splitNote = doc.splitTextToSize(patient.vitals.note, pageWidth - 30);
        doc.text(splitNote, 15, yPos + 7);
        
        yPos += noteHeight + 10;
      }

      // Reference Values
      yPos += 5;
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Valori di Riferimento', 14, yPos);
      
      yPos += 5;

      const referenceData = [
        ['Parametro', 'Range Normale', 'Note'],
        ['FC', '60-100 bpm', 'Adulto a riposo'],
        ['SpO₂', '≥ 95%', '< 90% = Critico'],
        ['PA Sistolica', '90-120 mmHg', 'Valori indicativi'],
        ['PA Diastolica', '60-80 mmHg', 'Valori indicativi']
      ];

      doc.autoTable({
        startY: yPos,
        head: [referenceData[0]],
        body: referenceData.slice(1),
        theme: 'striped',
        headStyles: {
          fillColor: [158, 158, 158],
          fontSize: 10,
          fontStyle: 'bold'
        },
        bodyStyles: {
          fontSize: 9
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 60 },
          2: { cellWidth: 70 }
        }
      });

      // Footer
      const footerY = pageHeight - 20;
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.setFont('helvetica', 'italic');
      doc.text(
        `Documento generato il ${new Date().toLocaleString('it-IT')}`,
        pageWidth / 2,
        footerY,
        { align: 'center' }
      );
      doc.text(
        'Sistema 118 - AREU Lombardia',
        pageWidth / 2,
        footerY + 5,
        { align: 'center' }
      );

      // Border
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(5, 5, pageWidth - 10, pageHeight - 10);

      // Save PDF
      const fileName = `Paziente_${patient.patientId}_${new Date().getTime()}.pdf`;
      doc.save(fileName);

      this.message.set('PDF esportato con successo! ✅');
      setTimeout(() => this.message.set(null), 3000);

    } catch (err) {
      console.error('Errore export PDF:', err);
      this.error.set('Errore durante l\'export PDF');
      setTimeout(() => this.error.set(null), 3000);
    } finally {
      this.isExporting.set(false);
    }
  }

  // Export all patients
  async exportAllPdf() {
    this.isExporting.set(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFillColor(220, 53, 69);
      doc.rect(0, 0, pageWidth, 25, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('118 - AREU Lombardia', pageWidth / 2, 12, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text('Report Pazienti Completo', pageWidth / 2, 19, { align: 'center' });

      doc.setTextColor(0, 0, 0);
      
      let yPos = 35;

      // Statistics
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Statistiche Generali', 14, yPos);
      
      yPos += 10;

      const statsData = [
        ['Categoria', 'Numero Pazienti'],
        ['Totale Pazienti', `${this.patients.length}`],
        ['Critici (SpO₂ < 90%)', `${this.getCriticalCount()}`],
        ['Attenzione (SpO₂ 90-94%)', `${this.getWarningCount()}`],
        ['Normali (SpO₂ ≥ 95%)', `${this.getNormalCount()}`]
      ];

      doc.autoTable({
        startY: yPos,
        head: [statsData[0]],
        body: statsData.slice(1),
        theme: 'grid',
        headStyles: {
          fillColor: [25, 118, 210],
          textColor: 255
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Patients table
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Elenco Pazienti', 14, yPos);
      
      yPos += 5;

      const patientsData = this.filteredPatients().map(p => [
        p.patientId || 'N/D',
        p.vitals?.pressure || 'N/D',
        p.vitals?.hr ? `${p.vitals.hr}` : 'N/D',
        p.vitals?.spo2 ? `${p.vitals.spo2}%` : 'N/D',
        p.vitals?.spo2 ? this.getSpo2Status(p.vitals.spo2) : '-',
        p.createdAt ? new Date(p.createdAt).toLocaleDateString('it-IT') : 'N/D'
      ]);

      doc.autoTable({
        startY: yPos,
        head: [['ID', 'PA', 'FC', 'SpO₂', 'Stato', 'Data']],
        body: patientsData,
        theme: 'striped',
        headStyles: {
          fillColor: [25, 118, 210],
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 8
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 25 },
          2: { cellWidth: 20 },
          3: { cellWidth: 20 },
          4: { cellWidth: 30, fontStyle: 'bold' },
          5: { cellWidth: 25 }
        },
        didParseCell: (data: any) => {
          if (data.column.index === 4 && data.row.index >= 0) {
            const status = data.cell.text[0];
            if (status === 'CRITICO') {
              data.cell.styles.textColor = [244, 67, 54];
            } else if (status === 'ATTENZIONE') {
              data.cell.styles.textColor = [255, 152, 0];
            } else if (status === 'NORMALE') {
              data.cell.styles.textColor = [76, 175, 80];
            }
          }
        }
      });

      const fileName = `Report_Completo_${new Date().getTime()}.pdf`;
      doc.save(fileName);

      this.message.set('Report completo esportato! ✅');
      setTimeout(() => this.message.set(null), 3000);

    } catch (err) {
      console.error('Errore export report:', err);
      this.error.set('Errore durante l\'export del report');
      setTimeout(() => this.error.set(null), 3000);
    } finally {
      this.isExporting.set(false);
    }
  }

  // Helper methods
  private getHrStatus(hr: number): string {
    if (hr < 60) return 'BRADICARDIA';
    if (hr > 100) return 'TACHICARDIA';
    return 'NORMALE';
  }

  private getSpo2Status(spo2: number): string {
    if (spo2 < 90) return 'CRITICO';
    if (spo2 < 95) return 'ATTENZIONE';
    return 'NORMALE';
  }

  viewTrend(patient: any) {
    console.log('View trend for', patient);
    // TODO: Implementa modal con storico
  }

  async logout() {
    await this.authService.logout();
    location.reload();
  }
}