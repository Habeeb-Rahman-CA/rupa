import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from './app-settings.entity.js';
import { AppSettingsController } from './app-settings.controller.js';
import { AppSettingsService } from './app-settings.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  controllers: [AppSettingsController],
  providers: [AppSettingsService],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
