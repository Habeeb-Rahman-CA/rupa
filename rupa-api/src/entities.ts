import { User } from './auth/entities/user.entity.js';
import { RefreshToken } from './auth/entities/refresh-token.entity.js';
import { Category } from './categories/categories.entity.js';
import { BankAccount } from './bank-accounts/bank-account.entity.js';
import { Transaction } from './transactions/transaction.entity.js';
import { Wallet, WalletTransaction } from './wallets/wallets.entity.js';
import { AccountTransfer } from './transfers/account-transfer.entity.js';
import { Person } from './people/person.entity.js';
import { Debt, DebtPayment } from './debts/debts.entity.js';
import { Budget } from './budgets/budget.entity.js';
import {
  Subscription,
  SubscriptionPayment,
  SubscriptionRenewal,
  SubscriptionPriceChange,
} from './subscriptions/subscriptions.entity.js';
import {
  Event,
  EventParticipant,
  EventExpense,
  EventExpenseParticipant,
  EventSettlement,
} from './events/events.entity.js';
import {
  InterestEntry,
  InterestDisposal,
} from './interest/interest.entity.js';
import { AppSetting } from './app-settings/app-settings.entity.js';
import { PushSubscription } from './push/entities/push-subscription.entity.js';
import { PushPreference } from './push/entities/push-preference.entity.js';
import { PushNotificationLog } from './push/entities/push-notification-log.entity.js';
import { MoneyHeldPerson } from './money-held/entities/money-held.entity.js';
import { MoneyHeldTransaction } from './money-held/entities/money-held.entity.js';

/**
 * Every entity known to TypeORM.
 *
 * An explicit list instead of a directory glob: the glob makes
 * TypeORM `import()` each match at boot, which under Vitest (ESM, no CJS
 * require hook for `.ts`) fails with "Invalid or unexpected token".
 */
export const entities = [
  User,
  RefreshToken,
  Category,
  BankAccount,
  Transaction,
  Wallet,
  WalletTransaction,
  AccountTransfer,
  Person,
  Debt,
  DebtPayment,
  Budget,
  Subscription,
  SubscriptionPayment,
  SubscriptionRenewal,
  SubscriptionPriceChange,
  Event,
  EventParticipant,
  EventExpense,
  EventExpenseParticipant,
  EventSettlement,
  InterestEntry,
  InterestDisposal,
  AppSetting,
  PushSubscription,
  PushPreference,
  PushNotificationLog,
  MoneyHeldPerson,
  MoneyHeldTransaction,
];
