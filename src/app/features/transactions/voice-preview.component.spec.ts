import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { VoicePreviewComponent, VoicePreviewData } from './voice-preview.component';
import { VoiceEntry } from '../../core/services/voice-expense-parser.service';
import { Category } from '../../core/models/domain.models';

/**
 * Regression test for: voice preview mapping amount + direction but leaving
 * Category blank. The select is keyed by category *name* while the lookup
 * compared against id-keyed options (and parser suggestions were dropped on
 * anything but an exact match), so a mapped category still rendered blank.
 */
describe('VoicePreviewComponent category mapping', () => {
  const categories: Category[] = [
    { id: 'c1', owner_id: 'u1', name: 'Food & Dining', kind: 'expense', created_at: '2026-01-01' },
    { id: 'c2', owner_id: 'u1', name: 'Groceries', kind: 'expense', created_at: '2026-01-02' },
  ];

  function build(entries: VoiceEntry[], text = 'add expense 200 for food'): VoicePreviewComponent {
    const data: VoicePreviewData = { rawText: text, entries, categories };
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: { close: () => undefined } },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    return TestBed.runInInjectionContext(() => new VoicePreviewComponent());
  }

  it('selects the category the model matched', () => {
    const comp = build([
      { amount: 200, direction: 'out', category: 'Food & Dining', notes: null },
    ]);

    expect(comp.selectedCategory(0)).toBe('Food & Dining');
    expect(
      comp.categoryOptions().find((o) => o.value === 'Food & Dining')?.label,
    ).toBe('Food & Dining');
  });

  it('resolves a loosely spoken label to the configured category', () => {
    const comp = build([{ amount: 200, direction: 'out', category: 'food', notes: null }]);

    expect(comp.selectedCategory(0)).toBe('Food & Dining');
    expect(comp.entries()[0].category).toBe('Food & Dining');
  });

  it('keeps an unmatched suggestion visible as a "+ new" option instead of blank', () => {
    const comp = build([
      { amount: 200, direction: 'out', category: 'Pet Supplies', notes: null },
    ]);

    const opt = comp.categoryOptions().find((o) => o.value === 'Pet Supplies');
    expect(opt?.label).toBe('+ Pet Supplies');
    expect(comp.selectedCategory(0)).toBe('Pet Supplies');
  });

  it('shows no selection when nothing was suggested', () => {
    const comp = build([{ amount: 200, direction: 'out', category: null, notes: null }]);

    expect(comp.selectedCategory(0)).toBeNull();
  });

  it('stores the chosen category name so saving matches the existing one', () => {
    const comp = build([{ amount: 200, direction: 'out', category: null, notes: null }]);

    comp.setCategory(0, 'Groceries');

    expect(comp.entries()[0].category).toBe('Groceries');
    expect(comp.selectedCategory(0)).toBe('Groceries');
  });
});
