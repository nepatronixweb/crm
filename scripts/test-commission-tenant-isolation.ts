import "dotenv/config";
import mongoose from "mongoose";
import assert from "node:assert/strict";
import Commission from "@/models/Commission";
import User from "@/models/User";
import Branch from "@/models/Branch";
import Organization from "@/models/Organization";
import {
  backfillTenantCommissionOrganizations,
  findCommissionInTenant,
  tenantCommissionScopeForSession,
} from "@/lib/tenantRecordAccess";

function requireMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.error("MONGODB_URI missing");
    process.exit(1);
  }
  return uri;
}

type FakeSession = {
  user: {
    id: string;
    role: string;
    organizationId: string | null;
    branch: string;
    name?: string;
  };
};

async function sessionForOrg(orgId: mongoose.Types.ObjectId): Promise<FakeSession | null> {
  const branchIds = await Branch.find({ organization: orgId }).distinct("_id");
  const user = await User.findOne({
    branch: { $in: branchIds },
    role: { $ne: "super_admin" },
  }).lean();
  if (!user) return null;
  return {
    user: {
      id: String(user._id),
      role: String(user.role),
      organizationId: String(orgId),
      branch: String(user.branch),
      name: user.name,
    },
  };
}

async function main() {
  await mongoose.connect(requireMongoUri());

  const marker = `Isolation test ${Date.now()}`;
  await Commission.deleteMany({ applicantName: { $regex: /^Isolation test / } });

  const orgs = await Organization.find({}).sort({ name: 1 }).lean();
  assert.ok(orgs.length >= 2, "need at least two organizations for isolation test");

  const createdIds: mongoose.Types.ObjectId[] = [];

  for (const org of orgs) {
    const session = await sessionForOrg(org._id);
    assert.ok(session, `missing user for org ${org.name}`);
    const row = await Commission.create({
      destinationCountry: "Australia",
      applicantName: `${marker} ${org.name}`,
      universityName: "Test U",
      organization: org._id,
      createdBy: session.user.id,
      createdByName: session.user.name ?? "tester",
    });
    createdIds.push(row._id);
  }

  for (let i = 0; i < orgs.length; i++) {
    const org = orgs[i]!;
    const session = await sessionForOrg(org._id);
    assert.ok(session);
    await backfillTenantCommissionOrganizations(session as never);
    const filter = await tenantCommissionScopeForSession(session as never);
    const visible = await Commission.find({
      ...filter,
      applicantName: { $regex: /^Isolation test / },
    })
      .select("_id applicantName organization")
      .lean();

    assert.equal(
      visible.length,
      1,
      `${org.name} should see exactly one commission row`
    );
    assert.equal(
      String(visible[0]!._id),
      String(createdIds[i]),
      `${org.name} should see only its own commission`
    );

    for (let j = 0; j < orgs.length; j++) {
      if (i === j) continue;
      const foreignId = String(createdIds[j]);
      const hit = await findCommissionInTenant(session as never, foreignId);
      assert.equal(hit, null, `${org.name} must not access commission from ${orgs[j]!.name}`);
    }
  }

  await Commission.deleteMany({ _id: { $in: createdIds } });

  console.log("commission tenant isolation: OK");
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
