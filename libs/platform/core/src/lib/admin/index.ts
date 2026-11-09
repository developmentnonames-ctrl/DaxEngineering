import { AdminAuditController } from './audit.controller';
import { AdminRolesController } from './roles.controller';
import { AdminSettingsController } from './settings.controller';
import { AdminSummaryController } from './summary.controller';
import { AdminUsersController } from './users.controller';

export const ADMIN_CONTROLLERS = [
  AdminUsersController,
  AdminRolesController,
  AdminSettingsController,
  AdminAuditController,
  AdminSummaryController,
];
