import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { importProvidersFrom } from '@angular/core';
import { signal } from '@angular/core';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';

import { QuickAddSheetComponent } from './quick-add-sheet.component';
import { CategoriesService } from '../../core/services/categories.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { BankAccountsService } from '../../core/services/bank-accounts.service';
import { BillScannerService } from '../../core/services/bill-scanner.service';
import { AiConsentService } from '../../core/services/ai-consent.service';
import { Category } from '../../core/models/domain.models';
import { APP_ICONS } from '../../shared/lucide-icons';

describe('QuickAddSheetComponent new-category save flow', () => {
  let catsService: {
    categories: ReturnType<typeof signal<Category[]>>;
    create: jasmine.Spy;
  };
  let txService: { transactions: ReturnType<typeof signal<unknown[]>>; create: jasmine.Spy };
  let sheetRef: { dismiss: jasmine.Spy };

  const existingCategory: Category = {
    id: 'cat_food',
    owner_id: 'u1',
    name: 'Food',
    kind: 'expense',
    created_at: '2026-01-01',
  };

  const createdCategory: Category = {
    id: 'cat_new',
    owner_id: 'u1',
    name: 'Coffee',
    kind: 'expense',
    created_at: '2026-11-19',
  };

  beforeEach(() => {
    catsService = {
      categories: signal([existingCategory]),
      create: jasmine.createSpy('create').and.resolveTo(createdCategory),
    };
    txService = {
      transactions: signal([]),
      create: jasmine.createSpy('create').and.resolveTo({ id: 'tx_1' }),
    };
    sheetRef = { dismiss: jasmine.createSpy('dismiss') };

    TestBed.configureTestingModule({
      imports: [QuickAddSheetComponent],
      providers: [
        QuickAddSheetComponent,
        provideNoopAnimations(),
        importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
        { provide: CategoriesService, useValue: catsService },
        { provide: TransactionsService, useValue: txService },
        {
          provide: BankAccountsService,
          useValue: { bankAccounts: signal([]), primaryAccount: signal(null) },
        },
        { provide: MatBottomSheetRef, useValue: sheetRef },
        { provide: MatSnackBar, useValue: { open: jasmine.createSpy('open') } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
        { provide: BillScannerService, useValue: {} },
        {
          provide: AiConsentService,
          useValue: { granted: signal(true), grant: () => {}, deny: () => {} },
        },
      ],
    });
  });

  it('creates the category and maps its id to the transaction (class-level)', async () => {
    const comp = TestBed.inject(QuickAddSheetComponent);
    comp.amount.set(250);
    comp.selectedCategoryId.set('__new__');
    comp.newCategoryName.set('Coffee');

    await comp.save();

    expect(catsService.create).toHaveBeenCalledWith('Coffee', 'expense');
    expect(txService.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ category_id: 'cat_new' }),
    );
    expect(sheetRef.dismiss).toHaveBeenCalledWith({ saved: true });
  });

  it('creates the category and maps its id to the transaction (DOM-level)', async () => {
    const fixture = TestBed.createComponent(QuickAddSheetComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.amount.set(250);
    fixture.detectChanges();

    // Click the "+ New category" chip (selection is handled by the inner button).
    const chips = Array.from(
      fixture.nativeElement.querySelectorAll('mat-chip-option'),
    ) as HTMLElement[];
    const newChip = chips.find((c) => c.textContent?.includes('New category'));
    expect(newChip).toBeTruthy();
    const newChipBtn = newChip!.querySelector('button') as HTMLButtonElement;
    expect(newChipBtn).toBeTruthy();
    newChipBtn.click();
    fixture.detectChanges();

    expect(comp.selectedCategoryId()).toBe('__new__');

    // Type a name into the new-category field.
    const inputs = Array.from(
      fixture.nativeElement.querySelectorAll('input'),
    ) as HTMLInputElement[];
    const catInput = inputs.find((i) => i.placeholder?.toLowerCase().includes('petrol'));
    expect(catInput).toBeTruthy();
    catInput!.value = 'Coffee';
    catInput!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(comp.newCategoryName()).toBe('Coffee');

    // Click Save.
    const saveBtn = (
      Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]
    ).find((b) => b.textContent?.trim() === 'Save');
    expect(saveBtn).toBeDefined();
    const save = saveBtn as HTMLButtonElement;
    expect(save.disabled).toBeFalse();
    save.click();
    fixture.detectChanges();

    await fixture.whenStable();
    fixture.detectChanges();

    expect(catsService.create).toHaveBeenCalledWith('Coffee', 'expense');
    expect(txService.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ category_id: 'cat_new' }),
    );
  });

  it('does not submit the transaction when the new category could not be created', async () => {
    const comp = TestBed.inject(QuickAddSheetComponent);
    catsService.create.and.resolveTo(null);

    comp.amount.set(250);
    comp.selectedCategoryId.set('__new__');
    comp.newCategoryName.set('Coffee');

    await comp.save();

    expect(catsService.create).toHaveBeenCalledWith('Coffee', 'expense');
    expect(txService.create).not.toHaveBeenCalled();
    expect(sheetRef.dismiss).not.toHaveBeenCalled();
  });

  it('passes an existing category id through without creating one', async () => {
    const comp = TestBed.inject(QuickAddSheetComponent);
    comp.amount.set(100);
    comp.selectedCategoryId.set('cat_food');

    await comp.save();

    expect(catsService.create).not.toHaveBeenCalled();
    expect(txService.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ category_id: 'cat_food' }),
    );
  });
});
