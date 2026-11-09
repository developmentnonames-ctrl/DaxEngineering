-- CreateEnum
CREATE TYPE "core"."GrantScope" AS ENUM ('OWN', 'DEPARTMENT', 'ALL');

-- CreateEnum
CREATE TYPE "core"."FieldTier" AS ENUM ('INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "core"."OverrideEffect" AS ENUM ('GRANT', 'DENY');

-- CreateEnum
CREATE TYPE "core"."ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "core"."OutboxStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "audit"."audit_log" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "actor_name" TEXT,
    "app" TEXT,
    "request_id" TEXT,
    "ip" TEXT,
    "module_key" TEXT NOT NULL,
    "entity_key" TEXT NOT NULL,
    "entity_id" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "changed_fields" TEXT[],
    "reason" TEXT,
    "restricted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id","occurred_at")
);

-- CreateTable
CREATE TABLE "core"."module" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "toggleable" BOOLEAN NOT NULL DEFAULT true,
    "depends_on" TEXT[],
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "module_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "core"."feature" (
    "id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."permission" (
    "key" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "scopes" "core"."GrantScope"[],
    "is_approval" BOOLEAN NOT NULL DEFAULT false,
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "core"."entity" (
    "key" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,

    CONSTRAINT "entity_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "core"."field" (
    "id" UUID NOT NULL,
    "entity_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "column" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tier" "core"."FieldTier" NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "writable" BOOLEAN NOT NULL DEFAULT false,
    "group" TEXT,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "sortable" BOOLEAN NOT NULL DEFAULT false,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."department" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."role" (
    "id" UUID NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "require_2fa" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."role_permission" (
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "scope" "core"."GrantScope" NOT NULL,
    "store_ids" UUID[],

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateTable
CREATE TABLE "core"."role_field_grant" (
    "role_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "can_read" BOOLEAN NOT NULL,
    "can_write" BOOLEAN NOT NULL,

    CONSTRAINT "role_field_grant_pkey" PRIMARY KEY ("role_id","field_id")
);

-- CreateTable
CREATE TABLE "core"."user_role" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "core"."user_department" (
    "user_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,

    CONSTRAINT "user_department_pkey" PRIMARY KEY ("user_id","department_id")
);

-- CreateTable
CREATE TABLE "core"."user_permission_override" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "effect" "core"."OverrideEffect" NOT NULL,
    "scope" "core"."GrantScope",
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."user_profile" (
    "user_id" UUID NOT NULL,
    "perm_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "core"."policy_epoch" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "value" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "policy_epoch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."registry_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "catalog_hash" TEXT NOT NULL,
    "synced_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "registry_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."number_series" (
    "id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "subtype" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "pattern" TEXT NOT NULL DEFAULT '{DOC}/{SUB}/{FY}/{SEQ}',
    "padding" INTEGER NOT NULL DEFAULT 4,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "removed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "number_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."number_counter" (
    "series_id" UUID NOT NULL,
    "period_key" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "number_counter_pkey" PRIMARY KEY ("series_id","period_key")
);

-- CreateTable
CREATE TABLE "core"."approval_request" (
    "id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "entity_key" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "status" "core"."ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "department_id" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "approval_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."attachment" (
    "id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "entity_key" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."idempotency_key" (
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status_code" INTEGER,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateTable
CREATE TABLE "core"."outbox_event" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "core"."OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."processed_event" (
    "event_id" UUID NOT NULL,
    "handler" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_event_pkey" PRIMARY KEY ("event_id","handler")
);

-- CreateTable
CREATE TABLE "core"."job_run" (
    "name" TEXT NOT NULL,
    "last_run_at" TIMESTAMPTZ(3) NOT NULL,
    "last_status" TEXT NOT NULL,
    "last_error" TEXT,

    CONSTRAINT "job_run_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "audit_log_entity_key_entity_id_occurred_at_idx" ON "audit"."audit_log"("entity_key", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_occurred_at_idx" ON "audit"."audit_log"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_occurred_at_idx" ON "audit"."audit_log"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "feature_module_key_key_key" ON "core"."feature"("module_key", "key");

-- CreateIndex
CREATE INDEX "permission_module_key_idx" ON "core"."permission"("module_key");

-- CreateIndex
CREATE UNIQUE INDEX "field_entity_key_name_key" ON "core"."field"("entity_key", "name");

-- CreateIndex
CREATE UNIQUE INDEX "department_key_key" ON "core"."department"("key");

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "core"."role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "core"."role"("name");

-- CreateIndex
CREATE INDEX "user_role_role_id_idx" ON "core"."user_role"("role_id");

-- CreateIndex
CREATE INDEX "user_department_department_id_idx" ON "core"."user_department"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_override_user_id_permission_key_key" ON "core"."user_permission_override"("user_id", "permission_key");

-- CreateIndex
CREATE UNIQUE INDEX "number_series_doc_type_subtype_key" ON "core"."number_series"("doc_type", "subtype");

-- CreateIndex
CREATE INDEX "approval_request_status_permission_key_idx" ON "core"."approval_request"("status", "permission_key");

-- CreateIndex
CREATE INDEX "approval_request_entity_key_entity_id_idx" ON "core"."approval_request"("entity_key", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_storage_key_key" ON "core"."attachment"("storage_key");

-- CreateIndex
CREATE INDEX "attachment_entity_key_entity_id_idx" ON "core"."attachment"("entity_key", "entity_id");

-- CreateIndex
CREATE INDEX "idempotency_key_created_at_idx" ON "core"."idempotency_key"("created_at");

-- CreateIndex
CREATE INDEX "outbox_event_status_available_at_idx" ON "core"."outbox_event"("status", "available_at");

-- AddForeignKey
ALTER TABLE "core"."feature" ADD CONSTRAINT "feature_module_key_fkey" FOREIGN KEY ("module_key") REFERENCES "core"."module"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."permission" ADD CONSTRAINT "permission_module_key_fkey" FOREIGN KEY ("module_key") REFERENCES "core"."module"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."entity" ADD CONSTRAINT "entity_module_key_fkey" FOREIGN KEY ("module_key") REFERENCES "core"."module"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."field" ADD CONSTRAINT "field_entity_key_fkey" FOREIGN KEY ("entity_key") REFERENCES "core"."entity"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_permission" ADD CONSTRAINT "role_permission_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "core"."permission"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_field_grant" ADD CONSTRAINT "role_field_grant_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_field_grant" ADD CONSTRAINT "role_field_grant_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "core"."field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_department" ADD CONSTRAINT "user_department_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_department" ADD CONSTRAINT "user_department_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "core"."department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_permission_override" ADD CONSTRAINT "user_permission_override_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_permission_override" ADD CONSTRAINT "user_permission_override_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "core"."permission"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_profile" ADD CONSTRAINT "user_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."number_counter" ADD CONSTRAINT "number_counter_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "core"."number_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO "core"."policy_epoch" ("id", "value") VALUES (1, 1);

ALTER TABLE "core"."number_counter" ADD CONSTRAINT "number_counter_last_value_check" CHECK ("last_value" > 0);
ALTER TABLE "core"."number_series" ADD CONSTRAINT "number_series_padding_check" CHECK ("padding" BETWEEN 1 AND 8);
ALTER TABLE "core"."user_permission_override" ADD CONSTRAINT "override_reason_check" CHECK (length(trim("reason")) > 0);

CREATE FUNCTION "core"."bump_policy_epoch"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "core"."policy_epoch" SET "value" = "value" + 1 WHERE "id" = 1;
  RETURN NULL;
END $$;

CREATE TRIGGER "role_bump_epoch" AFTER INSERT OR UPDATE OR DELETE ON "core"."role"
  FOR EACH STATEMENT EXECUTE FUNCTION "core"."bump_policy_epoch"();
CREATE TRIGGER "role_permission_bump_epoch" AFTER INSERT OR UPDATE OR DELETE ON "core"."role_permission"
  FOR EACH STATEMENT EXECUTE FUNCTION "core"."bump_policy_epoch"();
CREATE TRIGGER "role_field_grant_bump_epoch" AFTER INSERT OR UPDATE OR DELETE ON "core"."role_field_grant"
  FOR EACH STATEMENT EXECUTE FUNCTION "core"."bump_policy_epoch"();
CREATE TRIGGER "module_bump_epoch" AFTER INSERT OR UPDATE OR DELETE ON "core"."module"
  FOR EACH STATEMENT EXECUTE FUNCTION "core"."bump_policy_epoch"();
CREATE TRIGGER "permission_bump_epoch" AFTER INSERT OR UPDATE OR DELETE ON "core"."permission"
  FOR EACH STATEMENT EXECUTE FUNCTION "core"."bump_policy_epoch"();
CREATE TRIGGER "field_bump_epoch" AFTER INSERT OR UPDATE OR DELETE ON "core"."field"
  FOR EACH STATEMENT EXECUTE FUNCTION "core"."bump_policy_epoch"();

CREATE FUNCTION "core"."bump_user_perm_version"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid uuid;
BEGIN
  uid := CASE WHEN TG_OP = 'DELETE' THEN OLD."user_id" ELSE NEW."user_id" END;
  INSERT INTO "core"."user_profile" ("user_id", "perm_version") VALUES (uid, 2)
    ON CONFLICT ("user_id") DO UPDATE SET "perm_version" = "core"."user_profile"."perm_version" + 1;
  RETURN NULL;
END $$;

CREATE TRIGGER "user_role_bump_version" AFTER INSERT OR UPDATE OR DELETE ON "core"."user_role"
  FOR EACH ROW EXECUTE FUNCTION "core"."bump_user_perm_version"();
CREATE TRIGGER "user_department_bump_version" AFTER INSERT OR UPDATE OR DELETE ON "core"."user_department"
  FOR EACH ROW EXECUTE FUNCTION "core"."bump_user_perm_version"();
CREATE TRIGGER "user_override_bump_version" AFTER INSERT OR UPDATE OR DELETE ON "core"."user_permission_override"
  FOR EACH ROW EXECUTE FUNCTION "core"."bump_user_perm_version"();

CREATE FUNCTION "core"."sync_super_admin_flag"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "auth"."user" u SET "is_super_admin" = EXISTS (
    SELECT 1 FROM "core"."user_role" ur JOIN "core"."role" r ON r."id" = ur."role_id"
    WHERE ur."user_id" = u."id" AND r."is_super_admin" AND r."archived_at" IS NULL
  );
  RETURN NULL;
END $$;

CREATE TRIGGER "user_role_sync_super_admin" AFTER INSERT OR UPDATE OR DELETE ON "core"."user_role"
  FOR EACH STATEMENT EXECUTE FUNCTION "core"."sync_super_admin_flag"();
CREATE TRIGGER "role_sync_super_admin" AFTER UPDATE OF "is_super_admin", "archived_at" ON "core"."role"
  FOR EACH STATEMENT EXECUTE FUNCTION "core"."sync_super_admin_flag"();

CREATE FUNCTION "audit"."reject_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit.audit_log is append-only';
END $$;

CREATE TRIGGER "audit_log_append_only" BEFORE UPDATE OR DELETE ON "audit"."audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit"."reject_change"();
CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "audit"."audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit"."reject_change"();

CREATE UNIQUE INDEX "approval_request_one_pending" ON "core"."approval_request" ("entity_key", "entity_id") WHERE "status" = 'PENDING';
