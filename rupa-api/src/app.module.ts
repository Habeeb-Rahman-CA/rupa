import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { appConfig, databaseConfig, jwtConfig } from './config/configuration.js';
import { entities } from './entities.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { WalletsModule } from './wallets/wallets.module.js';
import { TransfersModule } from './transfers/transfers.module.js';
import { PeopleModule } from './people/people.module.js';
import { DebtsModule } from './debts/debts.module.js';
import { BudgetsModule } from './budgets/budgets.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { EventsModule } from './events/events.module.js';
import { InterestModule } from './interest/interest.module.js';
import { AppSettingsModule } from './app-settings/app-settings.module.js';
import { HealthModule } from './health/health.module.js';
import { MoneyHeldModule } from './money-held/money-held.module.js';
import { PushModule } from './push/push.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, databaseConfig, jwtConfig],
      validate: (config: Record<string, unknown>) => {
        const required = [
          'DATABASE_URL',
          'JWT_ACCESS_SECRET',
          'JWT_REFRESH_SECRET',
        ];
        for (const key of required) {
          if (!config[key]) {
            throw new Error(`Missing required environment variable: ${key}`);
          }
        }
        return config;
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('database.url');
        return {
          type: 'postgres',
          url: databaseUrl,
          entities,
          synchronize: false,
          logging: configService.get<boolean>('database.logging') || false,
          migrations: [__dirname + '/../migrations/*{.ts,.js}'],
          migrationsRun: false,
          ssl: configService.get<string>('app.nodeEnv') === 'production' ? { rejectUnauthorized: false } : false,
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    BankAccountsModule,
    TransactionsModule,
    WalletsModule,
    TransfersModule,
    PeopleModule,
    DebtsModule,
    BudgetsModule,
    SubscriptionsModule,
    EventsModule,
    InterestModule,
    AppSettingsModule,
    PushModule,
    MoneyHeldModule,
    HealthModule,
  ],
})
export class AppModule {}
