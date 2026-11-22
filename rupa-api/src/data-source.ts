import 'dotenv/config';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [process.cwd() + '/src/**/*.entity{.ts,.js}'],
  migrations: [process.cwd() + '/src/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
