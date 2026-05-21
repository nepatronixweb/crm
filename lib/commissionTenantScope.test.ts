import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { tenantCommissionMongoFilter } from "./tenantRecordAccess";

describe("tenantCommissionMongoFilter", () => {
  it("returns empty filter for super_admin", () => {
    assert.deepEqual(
      tenantCommissionMongoFilter({ isSuperAdmin: true, organizationId: null }),
      {}
    );
  });

  it("fail-closes when tenant has no organization id", () => {
    assert.deepEqual(tenantCommissionMongoFilter({ isSuperAdmin: false, organizationId: null }), {
      _id: { $exists: false },
    });
  });

  it("scopes tenant list to organization id only", () => {
    const orgId = new mongoose.Types.ObjectId();
    assert.deepEqual(
      tenantCommissionMongoFilter({ isSuperAdmin: false, organizationId: orgId }),
      { organization: orgId }
    );
  });
});
