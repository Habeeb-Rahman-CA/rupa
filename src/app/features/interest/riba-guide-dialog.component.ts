import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';

/**
 * Read-only reference: Islamic guidance on Riba (interest) and how to handle
 * interest received. Purely informational — it never touches any data.
 */
@Component({
  selector: 'app-riba-guide-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, LucideAngularModule],
  template: `
    <div class="dialog-container">
      <header class="dialog-header">
        <div class="header-icon"><lucide-icon name="book-open" /></div>
        <div>
          <h2 mat-dialog-title>Islamic Interest (Riba) – Quick Reference</h2>
          <p class="dialog-subtitle">Guidance for handling interest received</p>
        </div>
      </header>

      <mat-dialog-content class="dialog-content">
        <section class="guide-section">
          <h3>1. What is Riba?</h3>
          <p>Riba (interest) is prohibited in Islam.</p>
          <p class="citation"><strong>Quran – Al-Baqarah 2:275</strong></p>
          <blockquote>Allah has permitted trade and forbidden Riba.</blockquote>
        </section>

        <section class="guide-section">
          <h3>2. Authentic Hadith</h3>
          <p>Jabir (RA) reported that the Prophet ﷺ cursed:</p>
          <ul>
            <li>The one who consumes Riba.</li>
            <li>The one who pays Riba.</li>
            <li>The one who records it.</li>
            <li>The two witnesses.</li>
          </ul>
          <p class="citation"><strong>Reference:</strong> Sahih Muslim 1598.</p>
        </section>

        <section class="guide-section">
          <h3>3. What to Do With Received Interest?</h3>
          <p>If your bank automatically credits interest:</p>
          <ol>
            <li>Identify and separate the interest amount.</li>
            <li>Do not use it for personal expenses.</li>
            <li>Give it to poor and needy people to dispose of it.</li>
            <li>Do not expect Sadaqah rewards for this disposal.</li>
            <li>Keep a record of the amount received and disposed.</li>
          </ol>
          <p class="note">
            <lucide-icon name="info" />
            <span>This is the general Hanafi scholarly guidance for disposing of bank interest.</span>
          </p>
        </section>

        <section class="guide-section">
          <h3>4. Where Can I Give It?</h3>
          <table class="guide-table">
            <thead>
              <tr><th>Purpose</th><th>Guidance</th></tr>
            </thead>
            <tbody>
              <tr><td>Poor and needy people</td><td class="ok">Permitted</td></tr>
              <tr><td>Needy Muslim families</td><td class="ok">Permitted</td></tr>
              <tr><td>Poor relatives</td><td class="warn">Subject to conditions</td></tr>
              <tr><td>Mosque construction</td><td class="warn">Scholarly disagreement</td></tr>
              <tr><td>Personal expenses</td><td class="no">Not permitted</td></tr>
              <tr><td>Zakat payment</td><td class="no">Not permitted</td></tr>
            </tbody>
          </table>
        </section>

        <section class="guide-section">
          <h3>5. If Interest Has Accumulated</h3>
          <ul>
            <li>Stop the interest-based practice.</li>
            <li>Calculate the accumulated interest.</li>
            <li>Dispose of the amount appropriately.</li>
            <li>Make sincere Tawbah.</li>
            <li>Resolve not to return to Riba.</li>
          </ul>
        </section>

        <section class="guide-section">
          <h3>6. Important Reminders</h3>
          <ul>
            <li>Keep interest separate from your personal income.</li>
            <li>Do not count interest as Zakat.</li>
            <li>Do not treat interest disposal as ordinary Sadaqah.</li>
            <li>Prefer non-interest-bearing accounts.</li>
            <li>Consult a qualified Mufti for complicated situations.</li>
          </ul>
        </section>

        <section class="guide-section">
          <h3>7. Quick References</h3>
          <ul>
            <li>Quran 2:275–279 – Prohibition of Riba.</li>
            <li>Quran 3:130 – Prohibition of Riba.</li>
            <li>Sahih Muslim 1598 – Those involved in Riba.</li>
            <li>Sahih Muslim 1015 – Allah accepts only what is pure.</li>
          </ul>
        </section>

        <div class="disclaimer">
          <p><strong>Reminder:</strong> This is a quick reference, not a personal Fatwa. Scholarly rulings can differ in certain situations.</p>
          <p class="dua">May Allah protect our wealth from Riba and grant us Halal earnings. Ameen.</p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-flat-button color="primary" type="button" (click)="close()">Close</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      h2 { margin: 0 !important; padding: 0 !important; font-size: 18px !important; font-weight: 700 !important; line-height: 1.25 !important; }
      .dialog-container { max-width: 560px; background: var(--app-surface); color: var(--app-ink); }
      .dialog-header { display: flex; gap: 12px; align-items: flex-start; padding: 4px 16px 14px; border-bottom: 1px solid var(--app-hairline); }
      .header-icon {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        flex: 0 0 auto;
        border-radius: 12px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }
      .header-icon lucide-icon { width: 19px; height: 19px; }
      .dialog-subtitle { margin: 3px 0 0; color: var(--app-ink-muted); font-size: 12px; line-height: 1.35; }
      .dialog-content { max-height: 75vh; padding: 16px !important; }

      .guide-section { margin-bottom: 18px; }
      .guide-section h3 { margin: 0 0 7px; color: var(--app-ink); font-size: 14px; font-weight: 700; }
      .guide-section p { margin: 0 0 6px; color: var(--app-ink); font-size: 13px; line-height: 1.5; }
      .guide-section ul, .guide-section ol { margin: 0; padding-left: 20px; }
      .guide-section li { color: var(--app-ink); font-size: 13px; line-height: 1.55; margin-bottom: 3px; }
      .citation { font-size: 12.5px !important; color: var(--app-ink-muted) !important; }
      blockquote {
        margin: 4px 0 6px;
        padding: 9px 12px;
        border-left: 3px solid var(--app-accent);
        border-radius: 0 10px 10px 0;
        background: var(--app-accent-soft);
        color: var(--app-ink);
        font-size: 13px;
        font-style: italic;
        line-height: 1.5;
      }
      .note {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--app-input-bg);
        color: var(--app-ink-muted);
        font-size: 12px;
        line-height: 1.4;
      }
      .note lucide-icon { width: 15px; height: 15px; flex: 0 0 auto; color: var(--app-accent); }

      .guide-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .guide-table th, .guide-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--app-hairline); }
      .guide-table th {
        color: var(--app-ink-muted);
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: .05em;
        text-transform: uppercase;
      }
      .guide-table td { color: var(--app-ink); }
      .guide-table td.ok { color: var(--app-positive); font-weight: 600; }
      .guide-table td.warn { color: #b43403; font-weight: 600; }
      .guide-table td.no { color: var(--app-negative, #dc2626); font-weight: 600; }
      .guide-table tbody tr:last-child td { border-bottom: 0; }

      .disclaimer {
        padding: 12px 14px;
        border: 1px dashed var(--app-hairline);
        border-radius: 13px;
        background: var(--app-input-bg);
      }
      .disclaimer p { margin: 0; color: var(--app-ink-muted); font-size: 12.5px; line-height: 1.5; }
      .disclaimer .dua { margin-top: 7px; color: var(--app-ink); font-style: italic; }
      .dialog-actions { padding: 0 16px 14px !important; gap: 8px; }
      .dialog-actions button { border-radius: 999px; }
    `,
  ],
})
export class RibaGuideDialogComponent {
  private readonly ref = inject(MatDialogRef<RibaGuideDialogComponent>);

  close(): void {
    this.ref.close();
  }
}
