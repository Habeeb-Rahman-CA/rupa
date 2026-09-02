import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { APP_VERSION } from '../../core/app-version';

@Component({
  selector: 'app-terms-page',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="page">
      <header class="top">
        <button
          type="button"
          class="back-btn"
          (click)="goBack()"
          aria-label="Back"
        >
          <lucide-icon name="arrow-left" />
        </button>
        <div class="title">Terms of Service</div>
      </header>

      <article class="doc">
        <p class="lede">
          Please read these terms carefully before using <strong>rūpa</strong>.
          By creating an account or using the app, you agree to be bound by
          the terms set out below.
        </p>
        <p class="meta">
          Last updated: September 2, 2026 &middot; Version {{ appVersion }}
        </p>

        <h2>1. What rūpa is</h2>
        <p>
          rūpa is a personal expense tracker. It lets you record your own
          financial activity — transactions, balances, money owed to and by
          you, and shared expenses across trips or events. rūpa is a tool
          for personal use; it is not a bank, a payment processor, or a
          licensed financial advisor.
        </p>

        <h2>2. Your account</h2>
        <p>
          You are responsible for the accuracy of the information you provide
          during signup, for keeping your password confidential, and for all
          activity performed under your account. If you suspect unauthorized
          access, sign out and change your password immediately.
        </p>

        <h2>3. Your data</h2>
        <p>
          The financial information you record in rūpa belongs to you. It is
          stored in the Supabase project associated with the app. Row-Level
          Security policies restrict access to your own rows only. rūpa does
          not sell, rent, or share your personal financial data with third
          parties for advertising or profiling.
        </p>
        <p>
          You may export or delete your data at any time through the
          Supabase project. Deleting your account is permanent and cannot be
          reversed.
        </p>

        <h2>4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>use the service for any unlawful purpose;</li>
          <li>attempt to access data belonging to another user;</li>
          <li>disrupt, overload, or interfere with the infrastructure;</li>
          <li>
            reverse engineer, decompile, or copy the source code for
            commercial redistribution.
          </li>
        </ul>

        <h2>5. Availability</h2>
        <p>
          rūpa is provided on a best-effort basis. We do not guarantee
          uninterrupted access, freedom from bugs, or that your data will
          always be available. You are encouraged to keep periodic backups
          of important records.
        </p>

        <h2>6. Changes to the service and terms</h2>
        <p>
          We may add, modify, or remove features at any time, and we may
          update these terms as the app evolves. If a material change is
          made, the "Last updated" date at the top of this document will
          be revised. Your continued use of the app after that point
          constitutes acceptance of the revised terms.
        </p>

        <h2>7. Termination</h2>
        <p>
          We may suspend or terminate an account that violates these terms
          or that is used in a manner that risks the safety or reliability
          of the service. You may terminate your account at any time.
        </p>

        <h2>8. No warranty</h2>
        <p>
          rūpa is provided "as is" without warranty of any kind, express or
          implied, including but not limited to warranties of
          merchantability, fitness for a particular purpose, and
          non-infringement. Nothing in rūpa constitutes financial or tax
          advice.
        </p>

        <h2>9. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by applicable law, rūpa and its
          maintainers are not liable for any indirect, incidental, special,
          consequential, or exemplary damages arising out of or in
          connection with your use of the app, including loss of data,
          profits, or opportunity, even if advised of the possibility of
          such damages.
        </p>

        <h2>10. Governing law</h2>
        <p>
          These terms are governed by the laws of India. Any dispute
          arising out of or relating to these terms or the use of rūpa
          will be resolved by the competent courts having jurisdiction
          over the user's place of residence.
        </p>

        <p class="thanks">
          Thank you for using rūpa.
        </p>
      </article>
    </div>
  `,
  styles: [
    `
      :host { display: block; height: 100%; }

      .page {
        min-height: 100vh;
        min-height: 100dvh;
        background: var(--app-canvas);
        padding: calc(16px + env(safe-area-inset-top)) 0 40px;
      }

      .top {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 16px 12px;
        max-width: 760px;
        margin: 0 auto;
      }
      .back-btn {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        border: 0;
        background: transparent;
        color: var(--app-ink);
        display: grid;
        place-items: center;
        cursor: pointer;

        &:hover { background: var(--app-input-bg); }
        lucide-icon { width: 20px; height: 20px; }
      }
      .title {
        font-size: 18px;
        font-weight: 700;
        color: var(--app-ink);
      }

      .doc {
        max-width: 760px;
        margin: 0 auto;
        padding: 24px 24px 40px;
        background: var(--app-surface);
        border-radius: var(--app-radius-xl);
        box-shadow: var(--app-shadow-md);
      }
      .doc .lede {
        font-size: 16px;
        color: var(--app-ink);
        line-height: 1.6;
        margin: 0 0 12px;
      }
      .doc .meta {
        margin: 0 0 24px;
        font-size: 12px;
        color: var(--app-ink-muted);
      }
      .doc h2 {
        margin: 28px 0 8px;
        font-size: 16px;
        font-weight: 700;
        color: var(--app-ink);
        letter-spacing: -0.01em;
      }
      .doc p,
      .doc li {
        margin: 8px 0;
        color: var(--app-ink);
        font-size: 14.5px;
        line-height: 1.65;
      }
      .doc ul {
        margin: 8px 0 8px 20px;
        padding: 0;
      }
      .doc li { list-style: disc; }
      .doc .thanks {
        margin-top: 28px;
        color: var(--app-ink-muted);
        font-style: italic;
      }

      @media (max-width: 640px) {
        .doc {
          margin: 0 12px;
          padding: 20px 18px 32px;
        }
      }
    `,
  ],
})
export class TermsPage {
  private readonly location = inject(Location);
  readonly appVersion = APP_VERSION;

  goBack(): void {
    // If we came from another page, go back; otherwise land on /login.
    if (window.history.length > 1) {
      this.location.back();
    } else {
      window.location.href = '/login';
    }
  }
}
